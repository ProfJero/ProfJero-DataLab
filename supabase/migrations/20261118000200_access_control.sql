-- ProfJero DataLab — access-control helpers, integrity triggers and Row Level Security policies.

-- ---------------------------------------------------------------- helpers
create or replace function private.role_rank(p_role text) returns int
language sql immutable set search_path = '' as $$
  select case p_role when 'owner' then 5 when 'admin' then 4 when 'editor' then 3 when 'analyst' then 2 when 'viewer' then 1 else 0 end
$$;

create or replace function private.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins where user_id = (select auth.uid()))
$$;

create or replace function private.is_active_user() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and account_status = 'active')
$$;

-- Caller's role in a workspace (null if not a member or suspended).
create or replace function private.workspace_role(p_ws uuid) returns text
language sql stable security definer set search_path = '' as $$
  select m.role from public.workspace_members m
  join public.profiles p on p.id = m.user_id and p.account_status = 'active'
  where m.workspace_id = p_ws and m.user_id = (select auth.uid())
$$;

create or replace function private.has_role(p_ws uuid, p_min text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.role_rank(private.workspace_role(p_ws)) >= private.role_rank(p_min), false)
$$;

create or replace function private.shares_workspace(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.workspace_members a
    join public.workspace_members b on a.workspace_id = b.workspace_id
    where a.user_id = (select auth.uid()) and b.user_id = p_user
  )
$$;

create or replace function private.audit(p_ws uuid, p_action text, p_target_type text, p_target_id text, p_details jsonb default '{}'::jsonb, p_platform boolean default false)
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_logs (workspace_id, actor_id, action, target_type, target_id, details, is_platform)
  values (p_ws, (select auth.uid()), p_action, p_target_type, p_target_id, coalesce(p_details, '{}'::jsonb), p_platform)
$$;

create or replace function private.notify(p_user uuid, p_ws uuid, p_type text, p_title text, p_body text, p_link text)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, workspace_id, type, title, body, link)
  values (p_user, p_ws, p_type, p_title, p_body, p_link)
$$;

create or replace function private.notify_admins(p_ws uuid, p_type text, p_title text, p_body text, p_link text)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, workspace_id, type, title, body, link)
  select user_id, p_ws, p_type, p_title, p_body, p_link from public.workspace_members
  where workspace_id = p_ws and role in ('owner', 'admin')
$$;

create or replace function private.random_slug(p_len int default 10) returns text
language sql volatile set search_path = '' as $$
  select string_agg(substr('abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + (get_byte(b, i) % 56), 1), '')
  from extensions.gen_random_bytes(p_len) b, generate_series(0, p_len - 1) i
$$;

create or replace function private.slugify(p text) returns text
language sql immutable set search_path = '' as $$
  select coalesce(nullif(trim(both '-' from left(regexp_replace(lower(coalesce(p, '')), '[^a-z0-9]+', '-', 'g'), 40)), ''), 'workspace')
$$;

create or replace function private.unique_workspace_slug(p_name text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare base text := private.slugify(p_name); candidate text; n int := 0;
begin
  if char_length(base) < 2 then base := base || '-ws'; end if;
  candidate := base;
  while exists (select 1 from public.workspaces where slug = candidate) and n < 20 loop
    n := n + 1;
    candidate := left(base, 33) || '-' || lower(private.random_slug(5));
  end loop;
  return candidate;
end $$;

grant execute on function private.random_slug(int), private.slugify(text), private.unique_workspace_slug(text) to authenticated;
grant execute on function private.role_rank(text), private.is_platform_admin(), private.is_active_user(), private.workspace_role(uuid), private.has_role(uuid, text), private.shares_workspace(uuid) to authenticated;

-- ---------------------------------------------------------------- identity triggers
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, lower(new.email), nullif(left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 200), ''))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

create or replace function private.sync_user_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = lower(new.email) where id = new.id;
  end if;
  return new;
end $$;

create trigger on_auth_user_email_changed after update of email on auth.users
  for each row execute function private.sync_user_email();

-- Users may edit their own profile but never their account status or email.
-- invoker rights: current_user must reflect the caller
create or replace function private.guard_profile() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') and not private.is_platform_admin() then
    if new.account_status is distinct from old.account_status or new.email is distinct from old.email or new.id is distinct from old.id then
      raise exception 'Not allowed to change protected profile fields' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger guard_profile before update on public.profiles for each row execute function private.guard_profile();

-- ---------------------------------------------------------------- workspace triggers
-- invoker rights: current_user must reflect the caller
create or replace function private.before_workspace_insert() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.owner_id := (select auth.uid());
    new.is_demo := coalesce(new.is_demo, false) and private.is_platform_admin();
  end if;
  new.slug := private.unique_workspace_slug(coalesce(nullif(new.slug, ''), new.name));
  return new;
end $$;
create trigger before_workspace_insert before insert on public.workspaces for each row execute function private.before_workspace_insert();

create or replace function private.after_workspace_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.workspace_members (workspace_id, user_id, role) values (new.id, new.owner_id, 'owner');
  insert into public.subscriptions (workspace_id, plan_id, status, provider)
  select new.id, id, 'active', 'none' from public.subscription_plans where is_default limit 1;
  update public.profiles set default_workspace_id = coalesce(default_workspace_id, new.id) where id = new.owner_id;
  perform private.audit(new.id, 'workspace.created', 'workspace', new.id::text, jsonb_build_object('name', new.name));
  return new;
end $$;
create trigger after_workspace_insert after insert on public.workspaces for each row execute function private.after_workspace_insert();

-- invoker rights: current_user must reflect the caller
create or replace function private.guard_workspace_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') and not private.is_platform_admin() then
    if new.owner_id is distinct from old.owner_id then
      raise exception 'Use transfer_workspace_ownership to change the owner' using errcode = '42501';
    end if;
    new.is_demo := old.is_demo;
    new.slug := old.slug;
  end if;
  return new;
end $$;
create trigger guard_workspace_update before update on public.workspaces for each row execute function private.guard_workspace_update();

-- ---------------------------------------------------------------- form integrity triggers
-- Child rows always inherit workspace_id from their form, so tenant scoping cannot be spoofed.
create or replace function private.inherit_form_workspace() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.form_id is distinct from old.form_id then
    raise exception 'form_id is immutable' using errcode = '42501';
  end if;
  select workspace_id into new.workspace_id from public.forms where id = new.form_id;
  if new.workspace_id is null then raise exception 'Form not found' using errcode = 'P0002'; end if;
  return new;
end $$;
create trigger inherit_ws before insert or update on public.form_sections for each row execute function private.inherit_form_workspace();
create trigger inherit_ws before insert or update on public.form_questions for each row execute function private.inherit_form_workspace();
create trigger inherit_ws before insert or update on public.form_publication_settings for each row execute function private.inherit_form_workspace();

create or replace function private.inherit_report_workspace() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select workspace_id into new.workspace_id from public.reports where id = new.report_id;
  if new.workspace_id is null then raise exception 'Report not found' using errcode = 'P0002'; end if;
  return new;
end $$;
create trigger inherit_ws before insert or update on public.report_sections for each row execute function private.inherit_report_workspace();

-- invoker rights: current_user must reflect the caller
create or replace function private.inherit_submission_workspace() returns trigger
language plpgsql set search_path = '' as $$
begin
  select workspace_id into new.workspace_id from public.submissions where id = new.submission_id;
  if new.workspace_id is null then raise exception 'Submission not found' using errcode = 'P0002'; end if;
  if current_user in ('authenticated', 'anon') then new.created_by := (select auth.uid()); end if;
  return new;
end $$;
create trigger inherit_ws before insert on public.response_flags for each row execute function private.inherit_submission_workspace();

create or replace function private.inherit_conversation_workspace() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select workspace_id into new.workspace_id from public.ai_conversations where id = new.conversation_id;
  if new.workspace_id is null then raise exception 'Conversation not found' using errcode = 'P0002'; end if;
  return new;
end $$;
create trigger inherit_ws before insert on public.ai_messages for each row execute function private.inherit_conversation_workspace();

-- invoker rights: current_user must reflect the caller
create or replace function private.guard_form_write() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if current_user in ('authenticated', 'anon') then
      new.created_by := (select auth.uid());
      new.status := 'draft';
      new.response_count := 0;
      new.version := 1;
    end if;
    if new.slug is null or new.slug = '' then new.slug := private.random_slug(10); end if;
  else
    if new.workspace_id is distinct from old.workspace_id then raise exception 'workspace_id is immutable' using errcode = '42501'; end if;
    if current_user in ('authenticated', 'anon') then
      -- counters and status are owned by RPCs
      new.response_count := old.response_count;
      new.last_response_at := old.last_response_at;
      new.slug := old.slug;
      new.created_by := old.created_by;
      if new.status is distinct from old.status and coalesce(current_setting('datalab.status_change', true), '') <> 'on' then
        raise exception 'Use set_form_status to change a form''s status' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end $$;
create trigger guard_form_write before insert or update on public.forms for each row execute function private.guard_form_write();

create or replace function private.after_form_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.form_publication_settings (form_id, workspace_id) values (new.id, new.workspace_id) on conflict do nothing;
  perform private.audit(new.workspace_id, 'form.created', 'form', new.id::text, jsonb_build_object('title', new.title));
  return new;
end $$;
create trigger after_form_insert after insert on public.forms for each row execute function private.after_form_insert();

-- ---------------------------------------------------------------- RLS policies
-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.shares_workspace(id)) or (select private.is_platform_admin()));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- platform admins: visible only to platform admins; managed by SQL only.
create policy platform_admins_select on public.platform_admins for select to authenticated
  using ((select private.is_platform_admin()));

-- workspaces
create policy workspaces_select on public.workspaces for select to authenticated
  using ((select private.has_role(id, 'viewer')) or (select private.is_platform_admin()));
create policy workspaces_insert on public.workspaces for insert to authenticated
  with check (owner_id = (select auth.uid()) and (select private.is_active_user()));
create policy workspaces_update on public.workspaces for update to authenticated
  using ((select private.has_role(id, 'admin'))) with check ((select private.has_role(id, 'admin')));
create policy workspaces_delete on public.workspaces for delete to authenticated
  using ((select private.has_role(id, 'owner')));

-- members: read within workspace; leaving is allowed (except owner). Changes go through RPCs.
create policy members_select on public.workspace_members for select to authenticated
  using ((select private.has_role(workspace_id, 'viewer')) or (select private.is_platform_admin()));
create policy members_leave on public.workspace_members for delete to authenticated
  using (user_id = (select auth.uid()) and role <> 'owner');

create policy invitations_select on public.workspace_invitations for select to authenticated
  using ((select private.has_role(workspace_id, 'admin')));

-- plans are public catalogue data
create policy plans_select on public.subscription_plans for select to anon, authenticated
  using (is_active and is_public or (select private.is_platform_admin()));

create policy subscriptions_select on public.subscriptions for select to authenticated
  using ((select private.has_role(workspace_id, 'viewer')) or (select private.is_platform_admin()));
create policy payments_select on public.payment_transactions for select to authenticated
  using ((select private.has_role(workspace_id, 'owner')) or (select private.is_platform_admin()));
create policy usage_select on public.usage_records for select to authenticated
  using ((select private.has_role(workspace_id, 'viewer')) or (select private.is_platform_admin()));

-- forms and their structure
create policy forms_select on public.forms for select to authenticated
  using ((select private.has_role(workspace_id, 'viewer')) or (select private.is_platform_admin()));
create policy forms_insert on public.forms for insert to authenticated
  with check ((select private.has_role(workspace_id, 'editor')));
create policy forms_update on public.forms for update to authenticated
  using ((select private.has_role(workspace_id, 'editor'))) with check ((select private.has_role(workspace_id, 'editor')));
create policy forms_delete on public.forms for delete to authenticated
  using ((select private.has_role(workspace_id, 'admin')) or ((select private.has_role(workspace_id, 'editor')) and created_by = (select auth.uid())));

do $$
declare t text;
begin
  foreach t in array array['form_publication_settings','form_sections','form_questions'] loop
    execute format('create policy %1$s_select on public.%1$I for select to authenticated using ((select private.has_role(workspace_id, ''viewer'')))', t);
    execute format('create policy %1$s_insert on public.%1$I for insert to authenticated with check ((select private.has_role((select f.workspace_id from public.forms f where f.id = form_id), ''editor'')))', t);
    execute format('create policy %1$s_update on public.%1$I for update to authenticated using ((select private.has_role(workspace_id, ''editor''))) with check ((select private.has_role(workspace_id, ''editor'')))', t);
    execute format('create policy %1$s_delete on public.%1$I for delete to authenticated using ((select private.has_role(workspace_id, ''editor'')))', t);
  end loop;
end $$;

-- responses: inserted only via submit_response(); editors can triage and delete.
create policy submissions_select on public.submissions for select to authenticated
  using ((select private.has_role(workspace_id, 'viewer')));
create policy submissions_update on public.submissions for update to authenticated
  using ((select private.has_role(workspace_id, 'editor'))) with check ((select private.has_role(workspace_id, 'editor')));
create policy submissions_delete on public.submissions for delete to authenticated
  using ((select private.has_role(workspace_id, 'editor')));

create policy answers_select on public.submission_answers for select to authenticated
  using ((select private.has_role((select f.workspace_id from public.forms f where f.id = form_id), 'viewer')));

create policy flags_select on public.response_flags for select to authenticated
  using ((select private.has_role(workspace_id, 'viewer')));
create policy flags_insert on public.response_flags for insert to authenticated
  with check ((select private.has_role((select s.workspace_id from public.submissions s where s.id = submission_id), 'editor')));
create policy flags_update on public.response_flags for update to authenticated
  using ((select private.has_role(workspace_id, 'editor'))) with check ((select private.has_role(workspace_id, 'editor')));
create policy flags_delete on public.response_flags for delete to authenticated
  using ((select private.has_role(workspace_id, 'editor')));

-- templates: public catalogue
create policy templates_select on public.form_templates for select to anon, authenticated
  using (is_published or (select private.is_platform_admin()));
create policy templates_admin_write on public.form_templates for all to authenticated
  using ((select private.is_platform_admin())) with check ((select private.is_platform_admin()));

-- reports
create policy reports_select on public.reports for select to authenticated
  using ((select private.has_role(workspace_id, 'viewer')));
create policy reports_insert on public.reports for insert to authenticated
  with check ((select private.has_role(workspace_id, 'analyst')) and created_by = (select auth.uid()));
create policy reports_update on public.reports for update to authenticated
  using ((select private.has_role(workspace_id, 'analyst'))) with check ((select private.has_role(workspace_id, 'analyst')));
create policy reports_delete on public.reports for delete to authenticated
  using ((select private.has_role(workspace_id, 'admin')) or ((select private.has_role(workspace_id, 'analyst')) and created_by = (select auth.uid())));

create policy report_sections_select on public.report_sections for select to authenticated
  using ((select private.has_role(workspace_id, 'viewer')));
create policy report_sections_insert on public.report_sections for insert to authenticated
  with check ((select private.has_role((select r.workspace_id from public.reports r where r.id = report_id), 'analyst')));
create policy report_sections_update on public.report_sections for update to authenticated
  using ((select private.has_role(workspace_id, 'analyst'))) with check ((select private.has_role(workspace_id, 'analyst')));
create policy report_sections_delete on public.report_sections for delete to authenticated
  using ((select private.has_role(workspace_id, 'analyst')));

-- AI conversations are private to the user who started them (and require analyst access).
create policy ai_conversations_select on public.ai_conversations for select to authenticated
  using (user_id = (select auth.uid()) and (select private.has_role(workspace_id, 'analyst')));
create policy ai_conversations_insert on public.ai_conversations for insert to authenticated
  with check (user_id = (select auth.uid()) and (select private.has_role(workspace_id, 'analyst')));
create policy ai_conversations_update on public.ai_conversations for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy ai_conversations_delete on public.ai_conversations for delete to authenticated
  using (user_id = (select auth.uid()));

create policy ai_messages_select on public.ai_messages for select to authenticated
  using (exists (select 1 from public.ai_conversations c where c.id = conversation_id and c.user_id = (select auth.uid())));
create policy ai_messages_insert on public.ai_messages for insert to authenticated
  with check (exists (select 1 from public.ai_conversations c where c.id = conversation_id and c.user_id = (select auth.uid()) and private.has_role(c.workspace_id, 'analyst')));

create policy ai_usage_select on public.ai_usage for select to authenticated
  using ((select private.has_role(workspace_id, 'admin')) or user_id = (select auth.uid()) or (select private.is_platform_admin()));

-- media references
create policy media_select on public.media_assets for select to authenticated
  using ((workspace_id is not null and (select private.has_role(workspace_id, 'viewer'))) or uploaded_by = (select auth.uid()));
create policy media_delete on public.media_assets for delete to authenticated
  using ((workspace_id is not null and (select private.has_role(workspace_id, 'editor'))) or (workspace_id is null and uploaded_by = (select auth.uid())));

-- audit logs: workspace admins see their workspace; platform admins see everything
create policy audit_select on public.audit_logs for select to authenticated
  using ((workspace_id is not null and not is_platform and (select private.has_role(workspace_id, 'admin'))) or (select private.is_platform_admin()));

-- notifications: own only
create policy notifications_select on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy notifications_update on public.notifications for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notifications_delete on public.notifications for delete to authenticated using (user_id = (select auth.uid()));

-- platform settings: public keys readable by anyone; all keys by platform admins
create policy settings_select on public.platform_settings for select to anon, authenticated
  using (is_public or (select private.is_platform_admin()));

create policy abuse_select on public.abuse_reports for select to authenticated using ((select private.is_platform_admin()));
create policy errors_select on public.error_events for select to authenticated using ((select private.is_platform_admin()));

-- Table privileges: anon gets nothing except catalogue reads; mutations of
-- system-owned tables happen only through security-definer functions.
revoke all on all tables in schema public from anon;
grant select on public.form_templates, public.subscription_plans, public.platform_settings to anon;
revoke insert, update, delete on public.submission_answers, public.subscriptions, public.usage_records, public.payment_transactions,
  public.ai_usage, public.audit_logs, public.workspace_invitations, public.platform_admins, public.abuse_reports, public.error_events,
  public.subscription_plans, public.platform_settings, public.media_assets from authenticated;
revoke insert, update on public.workspace_members from authenticated;
revoke insert on public.submissions, public.profiles, public.notifications from authenticated;
grant delete on public.media_assets to authenticated;
