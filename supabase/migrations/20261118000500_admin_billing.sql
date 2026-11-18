-- ProfJero DataLab — platform administration and billing RPCs.
-- Every admin function checks private.is_platform_admin() server-side and writes an audit entry.

create or replace function private.assert_platform_admin() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
end $$;

create or replace function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_platform_admin();
  return jsonb_build_object(
    'users', (select count(*) from public.profiles),
    'usersLast30', (select count(*) from public.profiles where created_at >= now() - interval '30 days'),
    'suspendedUsers', (select count(*) from public.profiles where account_status = 'suspended'),
    'deletionRequests', (select count(*) from public.profiles where deletion_requested_at is not null),
    'workspaces', (select count(*) from public.workspaces),
    'forms', (select count(*) from public.forms),
    'publishedForms', (select count(*) from public.forms where status = 'published'),
    'submissions', (select count(*) from public.submissions),
    'submissionsLast30', (select count(*) from public.submissions where submitted_at >= now() - interval '30 days'),
    'aiRequestsLast30', (select count(*) from public.ai_usage where created_at >= now() - interval '30 days'),
    'aiFailuresLast30', (select count(*) from public.ai_usage where created_at >= now() - interval '30 days' and not success),
    'aiTokensLast30', (select coalesce(sum(tokens_in + tokens_out), 0) from public.ai_usage where created_at >= now() - interval '30 days'),
    'openAbuseReports', (select count(*) from public.abuse_reports where status in ('open', 'reviewing')),
    'errorsLast24h', (select count(*) from public.error_events where created_at >= now() - interval '24 hours'),
    'planDistribution', (select coalesce(jsonb_agg(jsonb_build_object('plan', p.name, 'count', c.n)), '[]') from (
        select plan_id, count(*) n from public.subscriptions group by plan_id) c join public.subscription_plans p on p.id = c.plan_id),
    'signupsDaily', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'count', n) order by d), '[]') from (
        select created_at::date d, count(*) n from public.profiles where created_at >= now() - interval '30 days' group by 1) x),
    'submissionsDaily', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'count', n) order by d), '[]') from (
        select submitted_at::date d, count(*) n from public.submissions where submitted_at >= now() - interval '30 days' group by 1) x)
  );
end $$;

create or replace function public.admin_list_users(p_search text default null, p_limit int default 50, p_offset int default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_platform_admin();
  return jsonb_build_object(
    'total', (select count(*) from public.profiles p where p_search is null or p.email ilike '%' || p_search || '%' or p.full_name ilike '%' || p_search || '%'),
    'rows', (select coalesce(jsonb_agg(x), '[]') from (
      select p.id, p.email, p.full_name, p.account_status, p.intended_use, p.created_at, p.deletion_requested_at, p.onboarded_at,
        exists (select 1 from public.platform_admins a where a.user_id = p.id) as is_platform_admin,
        (select count(*) from public.workspace_members m where m.user_id = p.id) as workspaces,
        (select count(*) from public.forms f where f.created_by = p.id) as forms,
        (select max(created_at) from public.audit_logs l where l.actor_id = p.id) as last_activity
      from public.profiles p
      where p_search is null or p.email ilike '%' || p_search || '%' or p.full_name ilike '%' || p_search || '%'
      order by p.created_at desc limit least(p_limit, 200) offset greatest(p_offset, 0)) x)
  );
end $$;

create or replace function public.admin_set_user_status(p_user_id uuid, p_status text, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_platform_admin();
  if p_status not in ('active', 'suspended') then raise exception 'invalid_status' using errcode = '22023'; end if;
  if p_user_id = (select auth.uid()) then raise exception 'cannot_change_self' using errcode = '42501'; end if;
  update public.profiles set account_status = p_status where id = p_user_id;
  perform private.audit(null, 'admin.user_status_changed', 'user', p_user_id::text, jsonb_build_object('status', p_status, 'reason', p_reason), true);
  perform private.notify(p_user_id, null, 'account.status', case when p_status = 'suspended' then 'Account suspended' else 'Account reactivated' end, p_reason, '/app/account');
end $$;

create or replace function public.admin_list_workspaces(p_search text default null, p_limit int default 50, p_offset int default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_platform_admin();
  return jsonb_build_object(
    'total', (select count(*) from public.workspaces w where p_search is null or w.name ilike '%' || p_search || '%'),
    'rows', (select coalesce(jsonb_agg(x), '[]') from (
      select w.id, w.name, w.slug, w.is_demo, w.created_at, o.email as owner_email, pl.code as plan_code, pl.name as plan_name, s.status as subscription_status, s.provider, s.current_period_end,
        (select count(*) from public.workspace_members m where m.workspace_id = w.id) as members,
        (select count(*) from public.forms f where f.workspace_id = w.id) as forms,
        (select count(*) from public.submissions sb where sb.workspace_id = w.id) as submissions,
        (select coalesce(sum(credits), 0) from public.ai_usage u where u.workspace_id = w.id and u.created_at >= date_trunc('month', now())) as ai_credits_month
      from public.workspaces w join public.profiles o on o.id = w.owner_id
      left join public.subscriptions s on s.workspace_id = w.id left join public.subscription_plans pl on pl.id = s.plan_id
      where p_search is null or w.name ilike '%' || p_search || '%'
      order by w.created_at desc limit least(p_limit, 200) offset greatest(p_offset, 0)) x)
  );
end $$;

create or replace function public.admin_assign_plan(p_workspace_id uuid, p_plan_code text, p_period_end timestamptz default null, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare plan_id uuid;
begin
  perform private.assert_platform_admin();
  select id into plan_id from public.subscription_plans where code = p_plan_code and is_active;
  if plan_id is null then raise exception 'plan_not_found' using errcode = 'P0002'; end if;
  insert into public.subscriptions (workspace_id, plan_id, status, provider, current_period_start, current_period_end, assigned_by)
  values (p_workspace_id, plan_id, 'active', 'manual', now(), p_period_end, (select auth.uid()))
  on conflict (workspace_id) do update set plan_id = excluded.plan_id, status = 'active', provider = 'manual',
    current_period_start = now(), current_period_end = excluded.current_period_end, assigned_by = excluded.assigned_by, cancel_at_period_end = false;
  perform private.audit(p_workspace_id, 'admin.plan_assigned', 'workspace', p_workspace_id::text, jsonb_build_object('plan', p_plan_code, 'period_end', p_period_end, 'note', p_note), true);
  perform private.notify_admins(p_workspace_id, 'subscription.changed', 'Subscription updated', 'Your workspace is now on the ' || p_plan_code || ' plan.', '/app/settings/billing');
end $$;

create or replace function public.admin_upsert_plan(p_plan jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare pid uuid;
begin
  perform private.assert_platform_admin();
  if jsonb_typeof(p_plan -> 'features') <> 'object' or jsonb_typeof(p_plan -> 'limits') <> 'object' then raise exception 'invalid_plan' using errcode = '22023'; end if;
  insert into public.subscription_plans (code, name, description, price_monthly_minor, price_yearly_minor, currency, features, limits, is_public, is_active, sort_order)
  values (p_plan ->> 'code', p_plan ->> 'name', p_plan ->> 'description', nullif(p_plan ->> 'price_monthly_minor', '')::int, nullif(p_plan ->> 'price_yearly_minor', '')::int,
          coalesce(p_plan ->> 'currency', 'GHS'), p_plan -> 'features', p_plan -> 'limits', coalesce((p_plan ->> 'is_public')::boolean, true),
          coalesce((p_plan ->> 'is_active')::boolean, true), coalesce((p_plan ->> 'sort_order')::int, 0))
  on conflict (code) do update set name = excluded.name, description = excluded.description, price_monthly_minor = excluded.price_monthly_minor,
    price_yearly_minor = excluded.price_yearly_minor, currency = excluded.currency, features = excluded.features, limits = excluded.limits,
    is_public = excluded.is_public, is_active = excluded.is_active, sort_order = excluded.sort_order
  returning id into pid;
  perform private.audit(null, 'admin.plan_updated', 'plan', p_plan ->> 'code', p_plan, true);
  return pid;
end $$;

create or replace function public.admin_ai_usage(p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_platform_admin();
  return jsonb_build_object(
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'requests', n, 'tokens', t, 'failures', fl) order by d), '[]') from (
      select created_at::date d, count(*) n, sum(tokens_in + tokens_out) t, count(*) filter (where not success) fl from public.ai_usage
      where created_at >= now() - make_interval(days => p_days) group by 1) x),
    'byFeature', (select coalesce(jsonb_agg(jsonb_build_object('feature', feature, 'requests', n, 'credits', c)), '[]') from (
      select feature, count(*) n, sum(credits) c from public.ai_usage where created_at >= now() - make_interval(days => p_days) group by 1) x),
    'byModel', (select coalesce(jsonb_agg(jsonb_build_object('provider', provider, 'model', model, 'requests', n, 'tokens', t)), '[]') from (
      select provider, model, count(*) n, sum(tokens_in + tokens_out) t from public.ai_usage where created_at >= now() - make_interval(days => p_days) group by 1, 2) x),
    'topWorkspaces', (select coalesce(jsonb_agg(jsonb_build_object('workspace', w.name, 'requests', n, 'credits', c)), '[]') from (
      select workspace_id, count(*) n, sum(credits) c from public.ai_usage where created_at >= now() - make_interval(days => p_days) group by 1 order by 3 desc limit 10) x
      join public.workspaces w on w.id = x.workspace_id),
    'errors', (select coalesce(jsonb_agg(jsonb_build_object('code', error_code, 'count', n)), '[]') from (
      select error_code, count(*) n from public.ai_usage where not success and created_at >= now() - make_interval(days => p_days) group by 1 order by 2 desc limit 10) x)
  );
end $$;

create or replace function public.admin_audit_logs(p_platform_only boolean default false, p_action text default null, p_limit int default 100, p_offset int default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_platform_admin();
  return (select coalesce(jsonb_agg(x), '[]') from (
    select l.id, l.action, l.target_type, l.target_id, l.details, l.is_platform, l.created_at, p.email as actor_email, w.name as workspace
    from public.audit_logs l left join public.profiles p on p.id = l.actor_id left join public.workspaces w on w.id = l.workspace_id
    where (not p_platform_only or l.is_platform) and (p_action is null or l.action ilike p_action || '%')
    order by l.created_at desc limit least(p_limit, 500) offset greatest(p_offset, 0)) x);
end $$;

create or replace function public.admin_list_abuse_reports(p_status text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_platform_admin();
  return (select coalesce(jsonb_agg(x), '[]') from (
    select r.*, f.title as form_title, f.status as form_status, w.name as workspace from public.abuse_reports r
    left join public.forms f on f.id = r.form_id left join public.workspaces w on w.id = f.workspace_id
    where p_status is null or r.status = p_status order by r.created_at desc limit 200) x);
end $$;

create or replace function public.admin_resolve_abuse_report(p_report_id uuid, p_status text, p_note text, p_close_form boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.abuse_reports;
begin
  perform private.assert_platform_admin();
  if p_status not in ('reviewing', 'resolved', 'dismissed') then raise exception 'invalid_status' using errcode = '22023'; end if;
  update public.abuse_reports set status = p_status, resolution_note = left(p_note, 2000), resolved_by = (select auth.uid()),
    resolved_at = case when p_status in ('resolved', 'dismissed') then now() end
  where id = p_report_id returning * into r;
  if p_close_form and r.form_id is not null then
    update public.forms set status = 'closed', closed_at = now() where id = r.form_id;
  end if;
  perform private.audit(null, 'admin.abuse_report_' || p_status, 'abuse_report', p_report_id::text, jsonb_build_object('close_form', p_close_form, 'note', p_note), true);
end $$;

create or replace function public.admin_update_setting(p_key text, p_value jsonb, p_is_public boolean default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_platform_admin();
  insert into public.platform_settings (key, value, is_public, updated_by) values (p_key, p_value, coalesce(p_is_public, false), (select auth.uid()))
  on conflict (key) do update set value = excluded.value, is_public = coalesce(p_is_public, public.platform_settings.is_public), updated_by = excluded.updated_by;
  perform private.audit(null, 'admin.setting_updated', 'setting', p_key, jsonb_build_object('value', p_value), true);
end $$;

create or replace function public.admin_system_health()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_platform_admin();
  return jsonb_build_object(
    'database', jsonb_build_object('size', pg_size_pretty(pg_database_size(current_database())), 'now', now()),
    'recentErrors', (select coalesce(jsonb_agg(x), '[]') from (select id, source, code, message, context, created_at from public.error_events order by created_at desc limit 50) x),
    'errorsBySource', (select coalesce(jsonb_agg(jsonb_build_object('source', source, 'count', n)), '[]') from (
      select source, count(*) n from public.error_events where created_at >= now() - interval '7 days' group by 1) x),
    'tableSizes', (select coalesce(jsonb_agg(jsonb_build_object('table', relname, 'rows', n_live_tup)), '[]') from (
      select relname, n_live_tup from pg_stat_user_tables where schemaname = 'public' order by n_live_tup desc limit 12) x)
  );
end $$;

-- ---------------------------------------------------------------- billing (provider-neutral)
create or replace function public.billing_create_transaction(p_gateway text, p_workspace_id uuid, p_user_id uuid, p_plan_code text, p_interval text, p_provider text, p_reference text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare pl public.subscription_plans; amount int;
begin
  perform private.check_gateway(p_gateway);
  if not exists (select 1 from public.workspace_members where workspace_id = p_workspace_id and user_id = p_user_id and role = 'owner') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into pl from public.subscription_plans where code = p_plan_code and is_active and is_public;
  if pl.id is null then raise exception 'plan_not_found' using errcode = 'P0002'; end if;
  amount := case when p_interval = 'yearly' then pl.price_yearly_minor else pl.price_monthly_minor end;
  if amount is null or amount <= 0 then raise exception 'plan_not_purchasable' using errcode = 'P0001'; end if;
  insert into public.payment_transactions (workspace_id, plan_id, initiated_by, provider, reference, interval, amount_minor, currency)
  values (p_workspace_id, pl.id, p_user_id, p_provider, p_reference, p_interval, amount, pl.currency);
  return jsonb_build_object('amountMinor', amount, 'currency', pl.currency, 'planName', pl.name);
end $$;

/* Called only after the Worker has verified the payment with the provider (server-to-server). */
create or replace function public.billing_confirm_transaction(p_gateway text, p_reference text, p_status text, p_amount_minor int, p_currency text, p_payload jsonb, p_customer_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t public.payment_transactions; period interval;
begin
  perform private.check_gateway(p_gateway);
  select * into t from public.payment_transactions where reference = p_reference for update;
  if t.id is null then raise exception 'transaction_not_found' using errcode = 'P0002'; end if;
  if t.status = 'success' then return jsonb_build_object('status', 'success', 'alreadyProcessed', true); end if;
  if p_status = 'success' and (p_amount_minor < t.amount_minor or upper(p_currency) <> upper(t.currency)) then
    update public.payment_transactions set status = 'failed', provider_payload = p_payload, verified_at = now() where id = t.id;
    perform private.audit(t.workspace_id, 'billing.amount_mismatch', 'payment', p_reference, jsonb_build_object('expected', t.amount_minor, 'received', p_amount_minor), true);
    return jsonb_build_object('status', 'failed', 'reason', 'amount_mismatch');
  end if;
  update public.payment_transactions set status = case when p_status in ('success', 'failed', 'abandoned') then p_status else 'failed' end,
    provider_payload = p_payload, verified_at = now() where id = t.id;
  if p_status = 'success' then
    period := case when t.interval = 'yearly' then interval '1 year' else interval '1 month' end;
    insert into public.subscriptions (workspace_id, plan_id, status, provider, provider_customer_id, current_period_start, current_period_end)
    values (t.workspace_id, t.plan_id, 'active', t.provider, p_customer_id, now(), now() + period)
    on conflict (workspace_id) do update set plan_id = excluded.plan_id, status = 'active', provider = excluded.provider,
      provider_customer_id = coalesce(excluded.provider_customer_id, public.subscriptions.provider_customer_id),
      current_period_start = now(),
      current_period_end = greatest(coalesce(public.subscriptions.current_period_end, now()), now()) + period,
      cancel_at_period_end = false;
    perform private.audit(t.workspace_id, 'billing.payment_succeeded', 'payment', p_reference, jsonb_build_object('amount', t.amount_minor, 'currency', t.currency), false);
    perform private.notify_admins(t.workspace_id, 'subscription.activated', 'Payment received', 'Your subscription is active. Thank you!', '/app/settings/billing');
  end if;
  return jsonb_build_object('status', p_status);
end $$;

revoke execute on all functions in schema public from public, anon;
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.role_rank(text), private.is_platform_admin(), private.is_active_user(), private.workspace_role(uuid), private.has_role(uuid, text), private.shares_workspace(uuid),
  private.random_slug(int), private.slugify(text), private.unique_workspace_slug(text) to authenticated;
grant execute on function public.admin_overview(), public.admin_list_users(text, int, int), public.admin_set_user_status(uuid, text, text),
  public.admin_list_workspaces(text, int, int), public.admin_assign_plan(uuid, text, timestamptz, text), public.admin_upsert_plan(jsonb), public.admin_ai_usage(int),
  public.admin_audit_logs(boolean, text, int, int), public.admin_list_abuse_reports(text), public.admin_resolve_abuse_report(uuid, text, text, boolean),
  public.admin_update_setting(text, jsonb, boolean), public.admin_system_health() to authenticated;
grant execute on function public.get_public_form(text) to anon, authenticated;
grant execute on function public.gateway_rate_limit(text, text, int, int), public.submit_response(text, uuid, jsonb, jsonb, jsonb, text, uuid, text, timestamptz, int),
  public.submit_abuse_report(text, text, text, text, text), public.record_error(text, text, text, text, jsonb),
  public.record_ai_usage(text, uuid, uuid, text, text, text, int, int, int, boolean, text), public.record_usage(text, uuid, text, bigint),
  public.billing_create_transaction(text, uuid, uuid, text, text, text, text), public.billing_confirm_transaction(text, text, text, int, text, jsonb, text) to anon, authenticated;

-- ---------------------------------------------------------------- seed: plans & settings
insert into public.subscription_plans (code, name, description, price_monthly_minor, price_yearly_minor, currency, is_default, sort_order, features, limits) values
('free', 'Free', 'For individuals getting started with surveys.', 0, 0, 'GHS', true, 1,
  '{"conditional_logic":false,"advanced_questions":false,"advanced_analytics":false,"crosstab":false,"ai_analyst":true,"reports":true,"advanced_reports":false,"xlsx_export":false,"remove_branding":false,"team_collaboration":false,"custom_theme":false}',
  '{"forms":5,"responses_per_month":200,"members":1,"ai_credits_per_month":20,"exports_per_month":10,"reports":2,"upload_mb":50}'),
('pro', 'Pro', 'For professionals who need logic, advanced analytics and AI.', 9900, 99000, 'GHS', false, 2,
  '{"conditional_logic":true,"advanced_questions":true,"advanced_analytics":true,"crosstab":false,"ai_analyst":true,"reports":true,"advanced_reports":false,"xlsx_export":true,"remove_branding":true,"team_collaboration":false,"custom_theme":true}',
  '{"forms":50,"responses_per_month":5000,"members":1,"ai_credits_per_month":300,"exports_per_month":200,"reports":50,"upload_mb":2000}'),
('research', 'Research', 'For researchers who need cross-tabulation, comparisons and extended AI.', 19900, 199000, 'GHS', false, 3,
  '{"conditional_logic":true,"advanced_questions":true,"advanced_analytics":true,"crosstab":true,"ai_analyst":true,"reports":true,"advanced_reports":true,"xlsx_export":true,"remove_branding":true,"team_collaboration":true,"custom_theme":true}',
  '{"forms":200,"responses_per_month":20000,"members":3,"ai_credits_per_month":1500,"exports_per_month":null,"reports":null,"upload_mb":10000}'),
('organisation', 'Organisation', 'For teams and institutions with collaboration and higher limits.', 49900, 499000, 'GHS', false, 4,
  '{"conditional_logic":true,"advanced_questions":true,"advanced_analytics":true,"crosstab":true,"ai_analyst":true,"reports":true,"advanced_reports":true,"xlsx_export":true,"remove_branding":true,"team_collaboration":true,"custom_theme":true}',
  '{"forms":null,"responses_per_month":100000,"members":50,"ai_credits_per_month":5000,"exports_per_month":null,"reports":null,"upload_mb":50000}')
on conflict (code) do nothing;

insert into public.platform_settings (key, value, description, is_public) values
('signups.enabled', 'true', 'Allow new user registrations.', true),
('ai.global_enabled', 'true', 'Master switch for AI features across the platform.', true),
('ai.credit_costs', '{"analyst_question":1,"summary":2,"themes":2,"generate_form":2,"report_ai":3}', 'AI credits charged per operation.', true),
('pricing.notice', '"Prices are indicative and may change. Paid plans can also be arranged by contacting us."', 'Notice displayed on the pricing page.', true),
('support.email', 'null', 'Support contact email shown in the app (set by the platform owner).', true),
('maintenance.message', 'null', 'Optional banner shown across the app.', true)
on conflict (key) do nothing;
