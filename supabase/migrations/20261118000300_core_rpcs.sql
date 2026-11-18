-- ProfJero DataLab — core RPCs (forms, publishing, public submissions, workspaces, entitlements)
-- All functions are SECURITY DEFINER with an empty search_path and perform explicit
-- authorisation checks; EXECUTE is granted per function at the end of this file.

-- ---------------------------------------------------------------- gateway & rate limiting
-- The API Worker holds a shared gateway key (stored here in private.app_secrets and as a
-- Worker secret). Public operations that must pass through the Worker's validation,
-- spam protection and rate limiting require it, so they cannot be called directly.
create or replace function private.check_gateway(p_key text) returns void
language plpgsql stable security definer set search_path = '' as $$
declare expected text;
begin
  select value into expected from private.app_secrets where name = 'gateway_key';
  if expected is null or p_key is null or extensions.digest(p_key, 'sha256') <> extensions.digest(expected, 'sha256') then
    raise exception 'gateway_denied' using errcode = '42501';
  end if;
end $$;

create or replace function public.gateway_rate_limit(p_gateway text, p_bucket text, p_limit int, p_window_seconds int)
returns boolean language plpgsql security definer set search_path = '' as $$
declare ws timestamptz; n int;
begin
  perform private.check_gateway(p_gateway);
  ws := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into private.rate_limits (bucket, window_start, hits) values (left(p_bucket, 200), ws, 1)
  on conflict (bucket, window_start) do update set hits = private.rate_limits.hits + 1
  returning hits into n;
  if random() < 0.01 then delete from private.rate_limits where window_start < now() - interval '1 day'; end if;
  return n <= p_limit;
end $$;

-- ---------------------------------------------------------------- entitlements
create or replace function private.current_month() returns date
language sql stable set search_path = '' as $$ select date_trunc('month', now())::date $$;

create or replace function private.entitlements(p_ws uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare plan public.subscription_plans; sub public.subscriptions; m date := private.current_month();
begin
  select s.* into sub from public.subscriptions s where s.workspace_id = p_ws;
  if sub.id is not null and sub.status in ('active', 'trialing') and (sub.current_period_end is null or sub.current_period_end > now()) then
    select * into plan from public.subscription_plans where id = sub.plan_id;
  end if;
  if plan.id is null then select * into plan from public.subscription_plans where is_default limit 1; end if;
  return jsonb_build_object(
    'plan_code', plan.code,
    'plan_name', plan.name,
    'status', coalesce(sub.status, 'active'),
    'provider', coalesce(sub.provider, 'none'),
    'current_period_end', sub.current_period_end,
    'features', plan.features,
    'limits', plan.limits,
    'usage', jsonb_build_object(
      'forms', (select count(*) from public.forms where workspace_id = p_ws and status <> 'archived'),
      'members', (select count(*) from public.workspace_members where workspace_id = p_ws)
                + (select count(*) from public.workspace_invitations where workspace_id = p_ws and accepted_at is null and revoked_at is null and expires_at > now()),
      'responses_per_month', coalesce((select quantity from public.usage_records where workspace_id = p_ws and metric = 'responses' and period_month = m), 0),
      'ai_credits_per_month', coalesce((select quantity from public.usage_records where workspace_id = p_ws and metric = 'ai_credits' and period_month = m), 0),
      'exports_per_month', coalesce((select quantity from public.usage_records where workspace_id = p_ws and metric = 'exports' and period_month = m), 0),
      'reports', (select count(*) from public.reports where workspace_id = p_ws),
      'upload_mb', coalesce((select sum(bytes) from public.media_assets where workspace_id = p_ws), 0) / 1048576.0
    )
  );
end $$;

create or replace function private.feature_enabled(p_ws uuid, p_feature text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((private.entitlements(p_ws) -> 'features' ->> p_feature)::boolean, false)
$$;

-- Returns true when adding p_add stays within the limit (null/absent limit = unlimited).
create or replace function private.within_limit(p_ws uuid, p_limit text, p_add numeric default 1) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare e jsonb := private.entitlements(p_ws); lim numeric;
begin
  if (e -> 'limits' -> p_limit) is null or jsonb_typeof(e -> 'limits' -> p_limit) = 'null' then return true; end if;
  lim := (e -> 'limits' ->> p_limit)::numeric;
  return coalesce((e -> 'usage' ->> p_limit)::numeric, 0) + p_add <= lim;
end $$;

create or replace function private.add_usage(p_ws uuid, p_metric text, p_qty bigint) returns void
language sql security definer set search_path = '' as $$
  insert into public.usage_records (workspace_id, metric, period_month, quantity)
  values (p_ws, p_metric, private.current_month(), p_qty)
  on conflict (workspace_id, metric, period_month) do update set quantity = public.usage_records.quantity + excluded.quantity
$$;

create or replace function public.workspace_entitlements(p_workspace_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.has_role(p_workspace_id, 'viewer') and not private.is_platform_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return private.entitlements(p_workspace_id);
end $$;

-- Enforce the plan's form limit at the database level.
create or replace function private.enforce_form_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not private.within_limit(new.workspace_id, 'forms', 1) then
    raise exception 'plan_limit:forms' using errcode = 'P0001', hint = 'Your plan''s form limit has been reached.';
  end if;
  return new;
end $$;
create trigger enforce_form_limit before insert on public.forms for each row execute function private.enforce_form_limit();

-- ---------------------------------------------------------------- form definition
create or replace function private.definition_json(p_form_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'title', f.title,
    'description', coalesce(f.description, ''),
    'coverImageUrl', f.cover_image_url,
    'logoUrl', f.logo_url,
    'theme', f.theme,
    'settings', f.settings,
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title, 'description', coalesce(s.description, ''), 'jumps', s.jumps) order by s.position)
      from public.form_sections s where s.form_id = f.id), '[]'::jsonb),
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object('id', q.id, 'sectionId', q.section_id, 'type', q.type, 'title', q.title, 'description', coalesce(q.description, ''),
               'required', q.required, 'config', q.config, 'visibility', q.visibility) order by q.position)
      from public.form_questions q where q.form_id = f.id and q.archived_at is null), '[]'::jsonb)
  )
  from public.forms f where f.id = p_form_id
$$;

create or replace function public.get_form_definition(p_form_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare f public.forms; p public.form_publication_settings;
begin
  select * into f from public.forms where id = p_form_id;
  if f.id is null or not private.has_role(f.workspace_id, 'viewer') then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select * into p from public.form_publication_settings where form_id = f.id;
  return jsonb_build_object(
    'id', f.id, 'workspaceId', f.workspace_id, 'slug', f.slug, 'status', f.status, 'version', f.version,
    'responseCount', f.response_count, 'updatedAt', f.updated_at, 'publishedAt', f.published_at, 'templateSlug', f.template_slug,
    'definition', private.definition_json(f.id),
    'publication', jsonb_build_object('isPublic', p.is_public, 'requireAuth', p.require_auth, 'closesAt', p.closes_at, 'responseLimit', p.response_limit,
      'preventDuplicates', p.prevent_duplicates, 'honeypot', p.honeypot, 'collectRespondentEmail', p.collect_respondent_email,
      'aiAnalysisEnabled', p.ai_analysis_enabled, 'closedMessage', p.closed_message),
    'answeredQuestionIds', coalesce((select jsonb_agg(distinct a.question_id) from public.submission_answers a where a.form_id = f.id), '[]'::jsonb)
  );
end $$;

/*
  Atomically replace a form's structure. Questions keep stable ids; questions removed
  after answers exist are archived rather than deleted. Optimistic concurrency via p_expected_version.
*/
create or replace function public.save_form_definition(p_form_id uuid, p_definition jsonb, p_expected_version int default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare f public.forms; sec_ids uuid[]; q_ids uuid[]; new_version int;
begin
  select * into f from public.forms where id = p_form_id for update;
  if f.id is null or not private.has_role(f.workspace_id, 'editor') then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if f.status = 'archived' then raise exception 'form_archived' using errcode = 'P0001'; end if;
  if p_expected_version is not null and p_expected_version <> f.version then
    raise exception 'version_conflict' using errcode = 'P0001', detail = f.version::text;
  end if;
  if jsonb_typeof(p_definition -> 'sections') <> 'array' or jsonb_array_length(p_definition -> 'sections') = 0 then
    raise exception 'invalid_definition' using errcode = '22023';
  end if;
  if jsonb_array_length(coalesce(p_definition -> 'questions', '[]')) > 500 then raise exception 'too_many_questions' using errcode = '22023'; end if;

  select array_agg((s ->> 'id')::uuid) into sec_ids from jsonb_array_elements(p_definition -> 'sections') s;
  select coalesce(array_agg((q ->> 'id')::uuid), '{}') into q_ids from jsonb_array_elements(coalesce(p_definition -> 'questions', '[]')) q;

  -- ids must not belong to another form (prevents cross-form tampering)
  if exists (select 1 from public.form_sections where id = any(sec_ids) and form_id <> p_form_id)
     or exists (select 1 from public.form_questions where id = any(q_ids) and form_id <> p_form_id) then
    raise exception 'id_conflict' using errcode = '42501';
  end if;
  -- question types are locked once answers exist
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_definition -> 'questions', '[]')) q
    join public.form_questions fq on fq.id = (q ->> 'id')::uuid and fq.type <> (q ->> 'type')
    where exists (select 1 from public.submission_answers a where a.question_id = fq.id)
  ) then
    raise exception 'question_type_locked' using errcode = 'P0001', hint = 'A question that already has responses cannot change type.';
  end if;

  update public.forms set
    title = left(coalesce(nullif(trim(p_definition ->> 'title'), ''), 'Untitled form'), 300),
    description = left(p_definition ->> 'description', 5000),
    cover_image_url = nullif(p_definition ->> 'coverImageUrl', ''),
    logo_url = nullif(p_definition ->> 'logoUrl', ''),
    theme = coalesce(p_definition -> 'theme', '{}'),
    settings = coalesce(p_definition -> 'settings', '{}'),
    version = version + 1
  where id = p_form_id
  returning version into new_version;

  insert into public.form_sections (id, form_id, workspace_id, position, title, description, jumps)
  select (s ->> 'id')::uuid, p_form_id, f.workspace_id, (ord - 1)::int, left(coalesce(s ->> 'title', ''), 500), left(s ->> 'description', 4000), coalesce(s -> 'jumps', '[]')
  from jsonb_array_elements(p_definition -> 'sections') with ordinality t(s, ord)
  on conflict (id) do update set position = excluded.position, title = excluded.title, description = excluded.description, jumps = excluded.jumps;

  -- archive or delete removed questions
  update public.form_questions q set archived_at = now(), section_id = null
  where q.form_id = p_form_id and q.archived_at is null and not (q.id = any(q_ids))
    and exists (select 1 from public.submission_answers a where a.question_id = q.id);
  delete from public.form_questions q
  where q.form_id = p_form_id and not (q.id = any(q_ids))
    and not exists (select 1 from public.submission_answers a where a.question_id = q.id);

  insert into public.form_questions (id, form_id, workspace_id, section_id, position, type, title, description, required, config, visibility, archived_at)
  select (q ->> 'id')::uuid, p_form_id, f.workspace_id, (q ->> 'sectionId')::uuid, (ord - 1)::int, q ->> 'type', left(coalesce(q ->> 'title', ''), 1000),
         left(q ->> 'description', 4000), coalesce((q ->> 'required')::boolean, false), coalesce(q -> 'config', '{}'),
         case when jsonb_typeof(q -> 'visibility') = 'object' then q -> 'visibility' end, null
  from jsonb_array_elements(coalesce(p_definition -> 'questions', '[]')) with ordinality t(q, ord)
  on conflict (id) do update set section_id = excluded.section_id, position = excluded.position, type = excluded.type, title = excluded.title,
    description = excluded.description, required = excluded.required, config = excluded.config, visibility = excluded.visibility, archived_at = null;

  delete from public.form_sections where form_id = p_form_id and not (id = any(sec_ids));

  return jsonb_build_object('version', new_version, 'savedAt', now());
end $$;

create or replace function public.create_form(p_workspace_id uuid, p_definition jsonb, p_template_slug text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare new_id uuid;
begin
  if not private.has_role(p_workspace_id, 'editor') then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into public.forms (workspace_id, created_by, title, description, template_slug)
  values (p_workspace_id, (select auth.uid()), left(coalesce(nullif(trim(p_definition ->> 'title'), ''), 'Untitled form'), 300), left(p_definition ->> 'description', 5000), p_template_slug)
  returning id into new_id;
  perform public.save_form_definition(new_id, p_definition, null);
  return new_id;
end $$;

create or replace function public.update_publication_settings(p_form_id uuid, p_settings jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare f public.forms;
begin
  select * into f from public.forms where id = p_form_id;
  if f.id is null or not private.has_role(f.workspace_id, 'editor') then raise exception 'not_found' using errcode = 'P0002'; end if;
  update public.form_publication_settings set
    is_public = coalesce((p_settings ->> 'isPublic')::boolean, is_public),
    require_auth = coalesce((p_settings ->> 'requireAuth')::boolean, require_auth),
    closes_at = case when p_settings ? 'closesAt' then nullif(p_settings ->> 'closesAt', '')::timestamptz else closes_at end,
    response_limit = case when p_settings ? 'responseLimit' then nullif(p_settings ->> 'responseLimit', '')::int else response_limit end,
    prevent_duplicates = coalesce((p_settings ->> 'preventDuplicates')::boolean, prevent_duplicates),
    honeypot = coalesce((p_settings ->> 'honeypot')::boolean, honeypot),
    collect_respondent_email = coalesce((p_settings ->> 'collectRespondentEmail')::boolean, collect_respondent_email),
    ai_analysis_enabled = coalesce((p_settings ->> 'aiAnalysisEnabled')::boolean, ai_analysis_enabled),
    closed_message = case when p_settings ? 'closedMessage' then left(p_settings ->> 'closedMessage', 1000) else closed_message end
  where form_id = p_form_id;
  perform private.audit(f.workspace_id, 'form.publication_updated', 'form', f.id::text, p_settings);
end $$;

create or replace function public.set_form_status(p_form_id uuid, p_status text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare f public.forms; uses_logic boolean; uses_advanced boolean;
begin
  select * into f from public.forms where id = p_form_id for update;
  if f.id is null or not private.has_role(f.workspace_id, 'editor') then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_status not in ('draft', 'published', 'closed', 'archived') then raise exception 'invalid_status' using errcode = '22023'; end if;
  if p_status = 'published' then
    if not exists (select 1 from public.form_questions where form_id = f.id and archived_at is null and type not in ('heading', 'statement')) then
      raise exception 'no_questions' using errcode = 'P0001', hint = 'Add at least one question before publishing.';
    end if;
    select exists (select 1 from public.form_questions where form_id = f.id and archived_at is null and visibility is not null)
        or exists (select 1 from public.form_sections where form_id = f.id and jsonb_array_length(jumps) > 0) into uses_logic;
    if uses_logic and not private.feature_enabled(f.workspace_id, 'conditional_logic') then
      raise exception 'plan_feature:conditional_logic' using errcode = 'P0001', hint = 'Conditional logic requires the Pro plan or higher.';
    end if;
    select exists (select 1 from public.form_questions where form_id = f.id and archived_at is null and type in ('file_upload', 'image_choice')) into uses_advanced;
    if uses_advanced and not private.feature_enabled(f.workspace_id, 'advanced_questions') then
      raise exception 'plan_feature:advanced_questions' using errcode = 'P0001', hint = 'File upload and image choice questions require the Pro plan or higher.';
    end if;
  end if;
  update public.forms set status = p_status,
    published_at = case when p_status = 'published' then coalesce(published_at, now()) else published_at end,
    closed_at = case when p_status = 'closed' then now() when p_status = 'published' then null else closed_at end,
    archived_at = case when p_status = 'archived' then now() else null end
  where id = f.id;
  perform private.audit(f.workspace_id, 'form.status_changed', 'form', f.id::text, jsonb_build_object('from', f.status, 'to', p_status));
  return jsonb_build_object('status', p_status);
end $$;

-- ---------------------------------------------------------------- public respondent API
create or replace function public.get_public_form(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare f public.forms; p public.form_publication_settings; w public.workspaces; reason text := null; e jsonb;
begin
  select * into f from public.forms where slug = p_slug;
  if f.id is null or f.status not in ('published', 'closed') then return null; end if;
  select * into p from public.form_publication_settings where form_id = f.id;
  if not p.is_public then return null; end if;
  select * into w from public.workspaces where id = f.workspace_id;
  if exists (select 1 from public.profiles where id = w.owner_id and account_status = 'suspended') then return null; end if;
  e := private.entitlements(f.workspace_id);
  if f.status = 'closed' then reason := 'closed';
  elsif p.closes_at is not null and p.closes_at <= now() then reason := 'closed';
  elsif p.response_limit is not null and f.response_count >= p.response_limit then reason := 'limit_reached';
  end if;
  return jsonb_build_object(
    'id', f.id, 'slug', f.slug, 'version', f.version,
    'available', reason is null, 'unavailableReason', reason,
    'closedMessage', p.closed_message,
    'requireAuth', p.require_auth, 'honeypot', p.honeypot, 'collectRespondentEmail', p.collect_respondent_email,
    'workspace', jsonb_build_object('name', w.name, 'logoUrl', w.logo_url),
    'branding', not coalesce((e -> 'features' ->> 'remove_branding')::boolean, false),
    'definition', private.definition_json(f.id)
  );
end $$;

create or replace function public.submit_response(
  p_gateway text, p_form_id uuid, p_answers jsonb, p_other jsonb, p_meta jsonb,
  p_fingerprint text, p_respondent_user uuid, p_respondent_email text, p_started_at timestamptz, p_form_version int
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare f public.forms; p public.form_publication_settings; sid uuid; new_count int; milestone int;
begin
  perform private.check_gateway(p_gateway);
  select * into f from public.forms where id = p_form_id;
  if f.id is null or f.status <> 'published' then raise exception 'form_unavailable' using errcode = 'P0001'; end if;
  select * into p from public.form_publication_settings where form_id = f.id;
  if not p.is_public then raise exception 'form_unavailable' using errcode = 'P0001'; end if;
  if p.closes_at is not null and p.closes_at <= now() then raise exception 'form_closed' using errcode = 'P0001'; end if;
  if p.require_auth and p_respondent_user is null then raise exception 'auth_required' using errcode = 'P0001'; end if;
  if p.prevent_duplicates and (
      (p_fingerprint is not null and exists (select 1 from public.submissions where form_id = f.id and fingerprint = p_fingerprint))
      or (p_respondent_user is not null and exists (select 1 from public.submissions where form_id = f.id and respondent_user_id = p_respondent_user))) then
    raise exception 'duplicate' using errcode = 'P0001';
  end if;
  if not private.within_limit(f.workspace_id, 'responses_per_month', 1) then raise exception 'quota_exceeded' using errcode = 'P0001'; end if;

  update public.forms set response_count = response_count + 1, last_response_at = now()
  where id = f.id and (p.response_limit is null or response_count < p.response_limit)
  returning response_count into new_count;
  if new_count is null then raise exception 'limit_reached' using errcode = 'P0001'; end if;

  insert into public.submissions (form_id, workspace_id, status, form_version, started_at, duration_seconds, respondent_user_id, respondent_email, fingerprint, metadata)
  values (f.id, f.workspace_id, 'completed', p_form_version, p_started_at,
          case when p_started_at is not null and p_started_at < now() then least(extract(epoch from now() - p_started_at)::int, 86400 * 30) end,
          p_respondent_user, case when p.collect_respondent_email then left(p_respondent_email, 320) end,
          case when p.prevent_duplicates then p_fingerprint end, coalesce(p_meta, '{}'))
  returning id into sid;

  insert into public.submission_answers (submission_id, form_id, question_id, value, value_text, value_number, value_options, other_text)
  select sid, f.id, q.id, a.value,
    case when q.type in ('short_text', 'long_text', 'email', 'phone', 'url', 'date', 'time', 'single_choice', 'dropdown', 'yes_no')
           or (q.type = 'image_choice' and jsonb_typeof(a.value) = 'string') then left(a.value #>> '{}', 20000) end,
    case when q.type in ('number', 'rating', 'linear_scale') and jsonb_typeof(a.value) = 'number' then (a.value #>> '{}')::numeric end,
    case when q.type in ('multiple_choice', 'image_choice') and jsonb_typeof(a.value) = 'array' then array(select jsonb_array_elements_text(a.value))
         when q.type in ('single_choice', 'dropdown', 'yes_no', 'image_choice') and jsonb_typeof(a.value) = 'string' then array[a.value #>> '{}'] end,
    left(coalesce(p_other, '{}'::jsonb) ->> q.id::text, 1000)
  from jsonb_each(coalesce(p_answers, '{}'::jsonb)) a(key, value)
  join public.form_questions q on q.form_id = f.id and q.archived_at is null and q.type not in ('heading', 'statement')
   and a.key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' and q.id = a.key::uuid
  where jsonb_typeof(a.value) <> 'null';

  perform private.add_usage(f.workspace_id, 'responses', 1);

  foreach milestone in array array[1, 10, 50, 100, 250, 500, 1000, 5000, 10000, 50000, 100000] loop
    if new_count = milestone then
      perform private.notify_admins(f.workspace_id, 'form.milestone',
        case when milestone = 1 then 'First response received' else milestone || ' responses reached' end,
        '"' || f.title || '" has ' || milestone || case when milestone = 1 then ' response.' else ' responses.' end,
        '/app/forms/' || f.id || '/responses');
    end if;
  end loop;
  if p.response_limit is not null and new_count = p.response_limit then
    perform private.notify_admins(f.workspace_id, 'form.limit_reached', 'Response limit reached', '"' || f.title || '" reached its response limit and stopped accepting responses.', '/app/forms/' || f.id || '/share');
  end if;
  return jsonb_build_object('submissionId', sid, 'count', new_count);
end $$;

create or replace function private.after_submission_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.forms set response_count = greatest(response_count - 1, 0) where id = old.form_id;
  return old;
end $$;
create trigger after_submission_delete after delete on public.submissions for each row execute function private.after_submission_delete();

create or replace function public.submit_abuse_report(p_gateway text, p_slug text, p_reason text, p_details text, p_email text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare rid uuid;
begin
  perform private.check_gateway(p_gateway);
  insert into public.abuse_reports (form_id, form_slug, reason, details, reporter_email)
  values ((select id from public.forms where slug = p_slug), left(p_slug, 60), p_reason, left(p_details, 4000), left(p_email, 320))
  returning id into rid;
  return rid;
end $$;

create or replace function public.record_error(p_gateway text, p_source text, p_code text, p_message text, p_context jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.check_gateway(p_gateway);
  insert into public.error_events (source, code, message, context) values (left(p_source, 60), left(p_code, 60), left(p_message, 2000), coalesce(p_context, '{}'));
  if random() < 0.01 then delete from public.error_events where created_at < now() - interval '90 days'; end if;
end $$;

-- Usage and AI accounting, recorded by the Worker after it has authenticated the user.
create or replace function public.record_ai_usage(p_gateway text, p_workspace_id uuid, p_user_id uuid, p_feature text, p_provider text, p_model text, p_tokens_in int, p_tokens_out int, p_credits int, p_success boolean, p_error_code text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.check_gateway(p_gateway);
  insert into public.ai_usage (workspace_id, user_id, feature, provider, model, tokens_in, tokens_out, credits, success, error_code)
  values (p_workspace_id, p_user_id, left(p_feature, 60), left(p_provider, 60), left(p_model, 120), greatest(p_tokens_in, 0), greatest(p_tokens_out, 0), greatest(p_credits, 0), p_success, left(p_error_code, 60));
  if p_credits > 0 then perform private.add_usage(p_workspace_id, 'ai_credits', p_credits); end if;
end $$;

create or replace function public.record_usage(p_gateway text, p_workspace_id uuid, p_metric text, p_qty bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.check_gateway(p_gateway);
  perform private.add_usage(p_workspace_id, p_metric, p_qty);
end $$;

-- ---------------------------------------------------------------- onboarding & account
create or replace function public.complete_onboarding(p_full_name text, p_intended_use text, p_organisation_type text, p_workspace_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); ws uuid;
begin
  if uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  update public.profiles set
    full_name = coalesce(nullif(left(trim(p_full_name), 200), ''), full_name),
    intended_use = case when p_intended_use in ('education', 'research', 'business', 'nonprofit', 'religious', 'personal', 'other') then p_intended_use else intended_use end,
    organisation_type = nullif(left(trim(p_organisation_type), 100), ''),
    onboarded_at = coalesce(onboarded_at, now())
  where id = uid;
  select workspace_id into ws from public.workspace_members where user_id = uid order by created_at limit 1;
  if ws is null then
    insert into public.workspaces (name, owner_id, organisation_type)
    values (coalesce(nullif(left(trim(p_workspace_name), 120), ''), 'My workspace'), uid, nullif(left(trim(p_organisation_type), 100), ''))
    returning id into ws;
  end if;
  return ws;
end $$;

create or replace function public.request_account_deletion(p_cancel boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set deletion_requested_at = case when p_cancel then null else now() end where id = (select auth.uid());
  perform private.audit(null, case when p_cancel then 'account.deletion_cancelled' else 'account.deletion_requested' end, 'user', (select auth.uid())::text, '{}', true);
end $$;

create or replace function public.export_my_data() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'exported_at', now(),
    'profile', (select to_jsonb(p) - 'avatar_public_id' from public.profiles p where p.id = (select auth.uid())),
    'memberships', (select coalesce(jsonb_agg(jsonb_build_object('workspace', w.name, 'role', m.role, 'joined', m.created_at)), '[]') from public.workspace_members m join public.workspaces w on w.id = m.workspace_id where m.user_id = (select auth.uid())),
    'forms_created', (select coalesce(jsonb_agg(jsonb_build_object('title', f.title, 'status', f.status, 'created_at', f.created_at, 'responses', f.response_count)), '[]') from public.forms f where f.created_by = (select auth.uid())),
    'reports_created', (select coalesce(jsonb_agg(jsonb_build_object('title', r.title, 'type', r.type, 'created_at', r.created_at)), '[]') from public.reports r where r.created_by = (select auth.uid())),
    'ai_usage', (select coalesce(jsonb_agg(jsonb_build_object('feature', a.feature, 'at', a.created_at, 'credits', a.credits)), '[]') from public.ai_usage a where a.user_id = (select auth.uid())),
    'notifications', (select count(*) from public.notifications n where n.user_id = (select auth.uid()))
  )
$$;

-- ---------------------------------------------------------------- team management
create or replace function public.create_invitation(p_workspace_id uuid, p_email text, p_role text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare token text := encode(extensions.gen_random_bytes(24), 'hex'); iid uuid; em text := lower(trim(p_email)); ws public.workspaces;
begin
  if not private.has_role(p_workspace_id, 'admin') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_role not in ('admin', 'editor', 'analyst', 'viewer') then raise exception 'invalid_role' using errcode = '22023'; end if;
  if em !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then raise exception 'invalid_email' using errcode = '22023'; end if;
  if not private.feature_enabled(p_workspace_id, 'team_collaboration') then
    raise exception 'plan_feature:team_collaboration' using errcode = 'P0001', hint = 'Team collaboration requires the Organisation plan.';
  end if;
  if not private.within_limit(p_workspace_id, 'members', 1) then raise exception 'plan_limit:members' using errcode = 'P0001'; end if;
  if exists (select 1 from public.workspace_members m join public.profiles p on p.id = m.user_id where m.workspace_id = p_workspace_id and p.email = em) then
    raise exception 'already_member' using errcode = 'P0001';
  end if;
  update public.workspace_invitations set revoked_at = now() where workspace_id = p_workspace_id and email = em and accepted_at is null and revoked_at is null;
  insert into public.workspace_invitations (workspace_id, email, role, token_hash, invited_by)
  values (p_workspace_id, em, p_role, encode(extensions.digest(token, 'sha256'), 'hex'), (select auth.uid()))
  returning id into iid;
  select * into ws from public.workspaces where id = p_workspace_id;
  -- in-app notification if the invitee already has an account
  perform private.notify(p.id, null, 'workspace.invitation', 'Workspace invitation', 'You have been invited to join ' || ws.name || ' as ' || p_role || '.', '/invite/' || token)
  from public.profiles p where p.email = em;
  perform private.audit(p_workspace_id, 'member.invited', 'invitation', iid::text, jsonb_build_object('email', em, 'role', p_role));
  return jsonb_build_object('id', iid, 'token', token, 'workspaceName', ws.name);
end $$;

create or replace function public.revoke_invitation(p_invitation_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare inv public.workspace_invitations;
begin
  select * into inv from public.workspace_invitations where id = p_invitation_id;
  if inv.id is null or not private.has_role(inv.workspace_id, 'admin') then raise exception 'not_found' using errcode = 'P0002'; end if;
  update public.workspace_invitations set revoked_at = now() where id = inv.id and accepted_at is null;
  perform private.audit(inv.workspace_id, 'member.invitation_revoked', 'invitation', inv.id::text, jsonb_build_object('email', inv.email));
end $$;

create or replace function public.get_invitation(p_token text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('workspaceName', w.name, 'workspaceLogo', w.logo_url, 'role', i.role, 'email', i.email,
    'expired', i.expires_at <= now(), 'accepted', i.accepted_at is not null, 'revoked', i.revoked_at is not null,
    'emailMatches', i.email = (select lower(email) from public.profiles where id = (select auth.uid())))
  from public.workspace_invitations i join public.workspaces w on w.id = i.workspace_id
  where i.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
$$;

create or replace function public.accept_invitation(p_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare inv public.workspace_invitations; uid uuid := (select auth.uid()); my_email text;
begin
  if uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into inv from public.workspace_invitations where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') for update;
  if inv.id is null or inv.revoked_at is not null or inv.accepted_at is not null or inv.expires_at <= now() then
    raise exception 'invitation_invalid' using errcode = 'P0001';
  end if;
  select lower(email) into my_email from public.profiles where id = uid;
  if my_email is distinct from inv.email then raise exception 'invitation_email_mismatch' using errcode = '42501'; end if;
  insert into public.workspace_members (workspace_id, user_id, role, invited_by) values (inv.workspace_id, uid, inv.role, inv.invited_by)
  on conflict (workspace_id, user_id) do nothing;
  update public.workspace_invitations set accepted_at = now(), accepted_by = uid where id = inv.id;
  update public.profiles set default_workspace_id = coalesce(default_workspace_id, inv.workspace_id) where id = uid;
  if inv.invited_by is not null then
    perform private.notify(inv.invited_by, inv.workspace_id, 'workspace.invitation_accepted', 'Invitation accepted', inv.email || ' joined the workspace.', '/app/settings/members');
  end if;
  perform private.audit(inv.workspace_id, 'member.joined', 'user', uid::text, jsonb_build_object('role', inv.role));
  return inv.workspace_id;
end $$;

create or replace function public.update_member_role(p_workspace_id uuid, p_user_id uuid, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare actor_role text := private.workspace_role(p_workspace_id); target_role text;
begin
  if private.role_rank(actor_role) < 4 then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_role not in ('admin', 'editor', 'analyst', 'viewer') then raise exception 'invalid_role' using errcode = '22023'; end if;
  select role into target_role from public.workspace_members where workspace_id = p_workspace_id and user_id = p_user_id;
  if target_role is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if target_role = 'owner' then raise exception 'cannot_change_owner' using errcode = '42501'; end if;
  -- admins may only manage members below admin and cannot grant admin
  if actor_role = 'admin' and (target_role = 'admin' or p_role = 'admin') then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.workspace_members set role = p_role where workspace_id = p_workspace_id and user_id = p_user_id;
  perform private.audit(p_workspace_id, 'member.role_changed', 'user', p_user_id::text, jsonb_build_object('from', target_role, 'to', p_role));
  perform private.notify(p_user_id, p_workspace_id, 'workspace.role_changed', 'Your role changed', 'Your role is now ' || p_role || '.', '/app');
end $$;

create or replace function public.remove_member(p_workspace_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare actor_role text := private.workspace_role(p_workspace_id); target_role text;
begin
  select role into target_role from public.workspace_members where workspace_id = p_workspace_id and user_id = p_user_id;
  if target_role is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if target_role = 'owner' then raise exception 'cannot_remove_owner' using errcode = '42501'; end if;
  if not (p_user_id = (select auth.uid()) or private.role_rank(actor_role) > private.role_rank(target_role) and private.role_rank(actor_role) >= 4) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  delete from public.workspace_members where workspace_id = p_workspace_id and user_id = p_user_id;
  update public.profiles set default_workspace_id = null where id = p_user_id and default_workspace_id = p_workspace_id;
  perform private.audit(p_workspace_id, 'member.removed', 'user', p_user_id::text, jsonb_build_object('role', target_role));
end $$;

create or replace function public.transfer_workspace_ownership(p_workspace_id uuid, p_new_owner uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if private.workspace_role(p_workspace_id) is distinct from 'owner' then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.workspace_members where workspace_id = p_workspace_id and user_id = p_new_owner) or p_new_owner = uid then
    raise exception 'invalid_target' using errcode = '22023';
  end if;
  update public.workspace_members set role = 'admin' where workspace_id = p_workspace_id and user_id = uid;
  update public.workspace_members set role = 'owner' where workspace_id = p_workspace_id and user_id = p_new_owner;
  update public.workspaces set owner_id = p_new_owner where id = p_workspace_id;
  perform private.audit(p_workspace_id, 'workspace.ownership_transferred', 'user', p_new_owner::text, jsonb_build_object('from', uid));
  perform private.notify(p_new_owner, p_workspace_id, 'workspace.ownership', 'You are now the workspace owner', 'Ownership was transferred to you.', '/app/settings');
end $$;

create or replace function public.register_media_asset(p_workspace_id uuid, p_form_id uuid, p_purpose text, p_public_id text, p_secure_url text, p_format text, p_bytes bigint, p_width int, p_height int)
returns uuid language plpgsql security definer set search_path = '' as $$
declare aid uuid; uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_purpose = 'avatar' then
    if p_public_id not like 'datalab/users/' || uid || '/%' then raise exception 'invalid_asset' using errcode = '42501'; end if;
  else
    if not private.has_role(p_workspace_id, 'editor') then raise exception 'forbidden' using errcode = '42501'; end if;
    if p_public_id not like 'datalab/workspaces/' || p_workspace_id || '/%' then raise exception 'invalid_asset' using errcode = '42501'; end if;
  end if;
  if p_secure_url not like 'https://res.cloudinary.com/%' then raise exception 'invalid_asset' using errcode = '42501'; end if;
  insert into public.media_assets (workspace_id, uploaded_by, form_id, purpose, public_id, secure_url, format, bytes, width, height)
  values (case when p_purpose = 'avatar' then null else p_workspace_id end, uid, p_form_id, p_purpose, p_public_id, p_secure_url, left(p_format, 20), p_bytes, p_width, p_height)
  on conflict (public_id) do update set secure_url = excluded.secure_url
  returning id into aid;
  return aid;
end $$;

-- ---------------------------------------------------------------- dashboard
create or replace function public.dashboard_stats(p_workspace_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.has_role(p_workspace_id, 'viewer') then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'totalForms', (select count(*) from public.forms where workspace_id = p_workspace_id and status <> 'archived'),
    'activeForms', (select count(*) from public.forms where workspace_id = p_workspace_id and status = 'published'),
    'draftForms', (select count(*) from public.forms where workspace_id = p_workspace_id and status = 'draft'),
    'totalResponses', (select count(*) from public.submissions where workspace_id = p_workspace_id),
    'responsesLast30', (select count(*) from public.submissions where workspace_id = p_workspace_id and submitted_at >= now() - interval '30 days'),
    'responsesPrev30', (select count(*) from public.submissions where workspace_id = p_workspace_id and submitted_at >= now() - interval '60 days' and submitted_at < now() - interval '30 days'),
    'trend', (select coalesce(jsonb_agg(jsonb_build_object('day', d::date, 'count', coalesce(c.n, 0)) order by d), '[]')
              from generate_series((now() - interval '29 days')::date, now()::date, interval '1 day') d
              left join (select submitted_at::date as day, count(*) n from public.submissions where workspace_id = p_workspace_id and submitted_at >= now() - interval '30 days' group by 1) c on c.day = d::date),
    'topForms', (select coalesce(jsonb_agg(x), '[]') from (
                  select f.id, f.title, f.status, count(s.id) as recent, f.response_count as total
                  from public.forms f left join public.submissions s on s.form_id = f.id and s.submitted_at >= now() - interval '30 days'
                  where f.workspace_id = p_workspace_id and f.status in ('published', 'closed')
                  group by f.id order by count(s.id) desc, f.response_count desc limit 5) x),
    'drafts', (select coalesce(jsonb_agg(x), '[]') from (select id, title, updated_at from public.forms where workspace_id = p_workspace_id and status = 'draft' order by updated_at desc limit 5) x),
    'recentReports', (select coalesce(jsonb_agg(x), '[]') from (select id, title, type, updated_at from public.reports where workspace_id = p_workspace_id order by updated_at desc limit 5) x),
    'recentActivity', (select coalesce(jsonb_agg(x), '[]') from (
                  select a.action, a.target_type, a.target_id, a.details, a.created_at, p.full_name as actor
                  from public.audit_logs a left join public.profiles p on p.id = a.actor_id
                  where a.workspace_id = p_workspace_id and not a.is_platform order by a.created_at desc limit 8) x),
    'entitlements', private.entitlements(p_workspace_id)
  );
end $$;

-- ---------------------------------------------------------------- grants
revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.role_rank(text), private.is_platform_admin(), private.is_active_user(), private.workspace_role(uuid), private.has_role(uuid, text), private.shares_workspace(uuid),
  private.random_slug(int), private.slugify(text), private.unique_workspace_slug(text) to authenticated;

grant execute on function public.get_public_form(text) to anon, authenticated;
grant execute on function public.gateway_rate_limit(text, text, int, int), public.submit_response(text, uuid, jsonb, jsonb, jsonb, text, uuid, text, timestamptz, int),
  public.submit_abuse_report(text, text, text, text, text), public.record_error(text, text, text, text, jsonb),
  public.record_ai_usage(text, uuid, uuid, text, text, text, int, int, int, boolean, text), public.record_usage(text, uuid, text, bigint) to anon, authenticated;
grant execute on function public.workspace_entitlements(uuid), public.get_form_definition(uuid), public.save_form_definition(uuid, jsonb, int), public.create_form(uuid, jsonb, text),
  public.update_publication_settings(uuid, jsonb), public.set_form_status(uuid, text), public.complete_onboarding(text, text, text, text),
  public.request_account_deletion(boolean), public.export_my_data(), public.create_invitation(uuid, text, text), public.revoke_invitation(uuid),
  public.get_invitation(text), public.accept_invitation(text), public.update_member_role(uuid, uuid, text), public.remove_member(uuid, uuid),
  public.transfer_workspace_ownership(uuid, uuid), public.register_media_asset(uuid, uuid, text, text, text, text, bigint, int, int), public.dashboard_stats(uuid) to authenticated;
