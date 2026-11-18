-- ProfJero DataLab — analytics & response management.
-- Aggregation happens in Postgres: the API receives compact distributions, never raw
-- response sets, so large surveys can be analysed without exhausting memory.

create table private.stopwords (word text primary key);

-- Submissions in scope for a filter object:
-- { "from": iso, "to": iso, "excludeFlagged": bool, "answer": { "questionId": uuid, "value": text }, "search": text, "status": "flagged"|"needs_review"|"reviewed" }
create or replace function private.scope_submissions(p_form_id uuid, p_filters jsonb)
returns table (id uuid, submitted_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.id, s.submitted_at from public.submissions s
  where s.form_id = p_form_id
    and s.status = 'completed'
    and (nullif(p_filters ->> 'from', '') is null or s.submitted_at >= (p_filters ->> 'from')::timestamptz)
    and (nullif(p_filters ->> 'to', '') is null or s.submitted_at <= (p_filters ->> 'to')::timestamptz)
    and (coalesce((p_filters ->> 'excludeFlagged')::boolean, false) = false or not s.is_flagged)
    and (nullif(p_filters ->> 'status', '') is null
         or (p_filters ->> 'status' = 'flagged' and s.is_flagged)
         or (p_filters ->> 'status' in ('needs_review', 'reviewed') and s.review_status = p_filters ->> 'status'))
    and (p_filters -> 'answer' is null or jsonb_typeof(p_filters -> 'answer') <> 'object' or exists (
          select 1 from public.submission_answers a
          where a.submission_id = s.id and a.question_id = (p_filters -> 'answer' ->> 'questionId')::uuid
            and ((p_filters -> 'answer' ->> 'value') = any (a.value_options)
                 or lower(a.value_text) = lower(p_filters -> 'answer' ->> 'value')
                 or trim_scale(a.value_number)::text = (p_filters -> 'answer' ->> 'value'))))
    and (nullif(trim(p_filters ->> 'search'), '') is null or exists (
          select 1 from public.submission_answers a
          where a.submission_id = s.id and (a.value_text ilike '%' || replace(replace(trim(p_filters ->> 'search'), '%', '\%'), '_', '\_') || '%'
                                            or a.other_text ilike '%' || replace(replace(trim(p_filters ->> 'search'), '%', '\%'), '_', '\_') || '%')))
$$;

create or replace function private.assert_form_access(p_form_id uuid, p_min text) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare ws uuid;
begin
  select workspace_id into ws from public.forms where id = p_form_id;
  if ws is null or not private.has_role(ws, p_min) then raise exception 'not_found' using errcode = 'P0002'; end if;
  return ws;
end $$;

create or replace function public.analytics_overview(p_form_id uuid, p_filters jsonb default '{}')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  perform private.assert_form_access(p_form_id, 'viewer');
  with sc as (select * from private.scope_submissions(p_form_id, p_filters)),
       subs as (select s.* from public.submissions s join sc on sc.id = s.id),
       all_in_range as (
         select s.status from public.submissions s where s.form_id = p_form_id
           and (nullif(p_filters ->> 'from', '') is null or s.submitted_at >= (p_filters ->> 'from')::timestamptz)
           and (nullif(p_filters ->> 'to', '') is null or s.submitted_at <= (p_filters ->> 'to')::timestamptz))
  select jsonb_build_object(
    'total', (select count(*) from all_in_range),
    'completed', (select count(*) from subs),
    'partial', (select count(*) from all_in_range where status = 'partial'),
    'flagged', (select count(*) from subs where is_flagged),
    'avgDurationSeconds', (select round(avg(duration_seconds))::int from subs where duration_seconds between 1 and 86400),
    'medianDurationSeconds', (select percentile_cont(0.5) within group (order by duration_seconds) from subs where duration_seconds between 1 and 86400),
    'firstAt', (select min(submitted_at) from subs),
    'lastAt', (select max(submitted_at) from subs),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'count', n) order by d), '[]') from (select submitted_at::date d, count(*) n from subs group by 1) x),
    'byWeekday', (select coalesce(jsonb_agg(jsonb_build_object('weekday', d, 'count', n) order by d), '[]') from (select extract(isodow from submitted_at)::int d, count(*) n from subs group by 1) x),
    'byHour', (select coalesce(jsonb_agg(jsonb_build_object('hour', h, 'count', n) order by h), '[]') from (select extract(hour from submitted_at)::int h, count(*) n from subs group by 1) x)
  ) into r;
  return r;
end $$;

create or replace function public.analytics_question_aggregates(p_form_id uuid, p_filters jsonb default '{}')
returns table (question_id uuid, metric text, key text, num numeric, cnt int, docs int)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_form_access(p_form_id, 'viewer');
  return query
  with sc as (select s.id from private.scope_submissions(p_form_id, p_filters) s),
       ans as (select a.*, q.type from public.submission_answers a join sc on sc.id = a.submission_id join public.form_questions q on q.id = a.question_id where a.form_id = p_form_id)
  select a.question_id, 'answered'::text, null::text, null::numeric, count(*)::int, null::int from ans a group by a.question_id
  union all
  select a.question_id, 'opt', o, null, count(*)::int, null from ans a, unnest(a.value_options) o group by a.question_id, o
  union all
  select a.question_id, 'num', null, a.value_number, count(*)::int, null from ans a
    where a.type in ('number', 'rating', 'linear_scale') and a.value_number is not null group by a.question_id, a.value_number
  union all
  select a.question_id, 'likert', e.key, (e.value)::numeric, count(*)::int, null from ans a, jsonb_each_text(a.value) e
    where a.type = 'likert' and jsonb_typeof(a.value) = 'object' and e.value ~ '^\d+$' group by a.question_id, e.key, e.value
  union all
  select a.question_id, 'date', a.value_text, null, count(*)::int, null from ans a where a.type = 'date' and a.value_text is not null group by a.question_id, a.value_text
  union all
  select a.question_id, 'hour', split_part(a.value_text, ':', 1), null, count(*)::int, null from ans a where a.type = 'time' and a.value_text ~ '^\d{2}:' group by a.question_id, split_part(a.value_text, ':', 1)
  union all
  select w.question_id, 'word', w.word, null, w.c, w.d from (
    select t.question_id, t.word, count(*)::int c, count(distinct t.submission_id)::int d,
           row_number() over (partition by t.question_id order by count(distinct t.submission_id) desc, count(*) desc, t.word) rn
    from (
      select a.question_id, a.submission_id, regexp_replace(tok, '^''+|''+$', '', 'g') word
      from ans a, regexp_split_to_table(lower(coalesce(a.value_text, '')), '[^[:alnum:]'']+') tok
      where a.type in ('short_text', 'long_text')
    ) t
    where char_length(t.word) > 2 and t.word !~ '^\d+$' and not exists (select 1 from private.stopwords sw where sw.word = t.word)
    group by t.question_id, t.word
  ) w where w.rn <= 30;
end $$;

create or replace function public.analytics_crosstab(p_form_id uuid, p_row_question uuid, p_col_question uuid, p_filters jsonb default '{}')
returns table (row_key text, col_key text, cnt int)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_form_access(p_form_id, 'viewer');
  return query
  with sc as (select s.id from private.scope_submissions(p_form_id, p_filters) s),
       r as (select a.submission_id, k from public.submission_answers a join sc on sc.id = a.submission_id,
               unnest(coalesce(a.value_options, array[trim_scale(a.value_number)::text])) k
             where a.question_id = p_row_question and a.form_id = p_form_id),
       c as (select a.submission_id, k from public.submission_answers a join sc on sc.id = a.submission_id,
               unnest(coalesce(a.value_options, array[trim_scale(a.value_number)::text])) k
             where a.question_id = p_col_question and a.form_id = p_form_id)
  select r.k, c.k, count(*)::int from r join c on c.submission_id = r.submission_id where r.k is not null and c.k is not null group by r.k, c.k;
end $$;

/* Mean of a numeric question per category of a grouping question (group comparison). */
create or replace function public.analytics_group_numeric(p_form_id uuid, p_group_question uuid, p_value_question uuid, p_filters jsonb default '{}')
returns table (group_key text, n int, mean numeric, median numeric, stddev numeric, min numeric, max numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_form_access(p_form_id, 'viewer');
  return query
  with sc as (select s.id from private.scope_submissions(p_form_id, p_filters) s),
       g as (select a.submission_id, k from public.submission_answers a join sc on sc.id = a.submission_id, unnest(coalesce(a.value_options, array[trim_scale(a.value_number)::text])) k
             where a.question_id = p_group_question and a.form_id = p_form_id),
       v as (select a.submission_id, a.value_number x from public.submission_answers a join sc on sc.id = a.submission_id
             where a.question_id = p_value_question and a.value_number is not null)
  select g.k, count(*)::int, round(avg(v.x), 4), round(percentile_cont(0.5) within group (order by v.x)::numeric, 4), round(stddev_samp(v.x), 4), min(v.x), max(v.x)
  from g join v on v.submission_id = g.submission_id group by g.k;
end $$;

/* Text answers for display or for AI theme analysis (caller must redact before external processing). */
create or replace function public.analytics_text_answers(p_form_id uuid, p_question_id uuid, p_filters jsonb default '{}', p_limit int default 50, p_offset int default 0)
returns table (submission_id uuid, submitted_at timestamptz, answer text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_form_access(p_form_id, 'viewer');
  return query
  select a.submission_id, sc.submitted_at, coalesce(a.value_text, a.other_text)
  from private.scope_submissions(p_form_id, p_filters) sc
  join public.submission_answers a on a.submission_id = sc.id and a.question_id = p_question_id
  where coalesce(a.value_text, a.other_text) is not null and char_length(trim(coalesce(a.value_text, a.other_text))) > 0
  order by sc.submitted_at desc
  limit least(greatest(p_limit, 1), 500) offset greatest(p_offset, 0);
end $$;

/* "Other (please specify)" free text for a choice question. */
create or replace function public.analytics_other_answers(p_form_id uuid, p_question_id uuid, p_filters jsonb default '{}', p_limit int default 50)
returns table (answer text, cnt int)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_form_access(p_form_id, 'viewer');
  return query
  select lower(trim(a.other_text)), count(*)::int from private.scope_submissions(p_form_id, p_filters) sc
  join public.submission_answers a on a.submission_id = sc.id and a.question_id = p_question_id
  where a.other_text is not null group by 1 order by 2 desc limit least(greatest(p_limit, 1), 200);
end $$;

/* Paginated response listing with answers keyed by stable question id. */
create or replace function public.list_responses(p_form_id uuid, p_filters jsonb default '{}', p_sort text default 'newest', p_limit int default 25, p_offset int default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare total int; rows jsonb;
begin
  perform private.assert_form_access(p_form_id, 'viewer');
  select count(*) into total from private.scope_submissions(p_form_id, p_filters);
  select coalesce(jsonb_agg(x order by case when p_sort = 'oldest' then extract(epoch from x.submitted_at) else -extract(epoch from x.submitted_at) end), '[]') into rows
  from (
    select s.id, s.submitted_at, s.status, s.review_status, s.is_flagged, s.flag_reason, s.duration_seconds, s.respondent_email, s.is_sample,
      (select coalesce(jsonb_object_agg(a.question_id, a.value), '{}') from public.submission_answers a where a.submission_id = s.id) as answers,
      (select coalesce(jsonb_object_agg(a.question_id, a.other_text), '{}') from public.submission_answers a where a.submission_id = s.id and a.other_text is not null) as other
    from private.scope_submissions(p_form_id, p_filters) sc join public.submissions s on s.id = sc.id
    order by case when p_sort = 'oldest' then s.submitted_at end asc, case when p_sort <> 'oldest' then s.submitted_at end desc
    limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0)
  ) x;
  return jsonb_build_object('total', total, 'rows', rows);
end $$;

create or replace function public.get_response(p_submission_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s public.submissions;
begin
  select * into s from public.submissions where id = p_submission_id;
  if s.id is null or not private.has_role(s.workspace_id, 'viewer') then raise exception 'not_found' using errcode = 'P0002'; end if;
  return jsonb_build_object(
    'id', s.id, 'formId', s.form_id, 'submittedAt', s.submitted_at, 'startedAt', s.started_at, 'durationSeconds', s.duration_seconds,
    'status', s.status, 'reviewStatus', s.review_status, 'isFlagged', s.is_flagged, 'flagReason', s.flag_reason, 'respondentEmail', s.respondent_email, 'isSample', s.is_sample,
    'metadata', s.metadata,
    'answers', (select coalesce(jsonb_object_agg(a.question_id, a.value), '{}') from public.submission_answers a where a.submission_id = s.id),
    'other', (select coalesce(jsonb_object_agg(a.question_id, a.other_text), '{}') from public.submission_answers a where a.submission_id = s.id and a.other_text is not null),
    'archivedQuestions', (select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'title', q.title, 'type', q.type)), '[]') from public.form_questions q
                          where q.form_id = s.form_id and q.archived_at is not null and exists (select 1 from public.submission_answers a where a.submission_id = s.id and a.question_id = q.id)),
    'flags', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'type', f.flag_type, 'note', f.note, 'createdAt', f.created_at, 'by', p.full_name) order by f.created_at desc), '[]')
              from public.response_flags f left join public.profiles p on p.id = f.created_by where f.submission_id = s.id)
  );
end $$;

/* Paginated export rows (used by the API to stream CSV/XLSX in batches). */
create or replace function public.export_responses_page(p_form_id uuid, p_filters jsonb default '{}', p_after timestamptz default null, p_limit int default 500)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_form_access(p_form_id, 'viewer');
  return (select coalesce(jsonb_agg(x order by x.submitted_at), '[]') from (
    select s.id, s.submitted_at, s.duration_seconds, s.review_status, s.is_flagged, s.respondent_email,
      (select coalesce(jsonb_object_agg(a.question_id, a.value), '{}') from public.submission_answers a where a.submission_id = s.id) as answers,
      (select coalesce(jsonb_object_agg(a.question_id, a.other_text), '{}') from public.submission_answers a where a.submission_id = s.id and a.other_text is not null) as other
    from private.scope_submissions(p_form_id, p_filters) sc join public.submissions s on s.id = sc.id
    where p_after is null or s.submitted_at > p_after
    order by s.submitted_at limit least(greatest(p_limit, 1), 1000)) x);
end $$;

create or replace function public.delete_responses(p_form_id uuid, p_ids uuid[])
returns int language plpgsql security definer set search_path = '' as $$
declare ws uuid := private.assert_form_access(p_form_id, 'editor'); n int;
begin
  delete from public.submissions where form_id = p_form_id and id = any(p_ids);
  get diagnostics n = row_count;
  perform private.audit(ws, 'responses.deleted', 'form', p_form_id::text, jsonb_build_object('count', n));
  return n;
end $$;

create or replace function public.update_responses_review(p_form_id uuid, p_ids uuid[], p_review_status text, p_flagged boolean, p_reason text)
returns int language plpgsql security definer set search_path = '' as $$
declare ws uuid := private.assert_form_access(p_form_id, 'editor'); n int;
begin
  update public.submissions set
    review_status = coalesce(p_review_status, review_status),
    is_flagged = coalesce(p_flagged, is_flagged),
    flag_reason = case when p_flagged is true then left(p_reason, 500) when p_flagged is false then null else flag_reason end
  where form_id = p_form_id and id = any(p_ids);
  get diagnostics n = row_count;
  if p_flagged is true then
    insert into public.response_flags (submission_id, workspace_id, flag_type, note, created_by)
    select id, ws, 'suspicious', left(p_reason, 2000), (select auth.uid()) from public.submissions where form_id = p_form_id and id = any(p_ids);
  end if;
  return n;
end $$;

revoke execute on all functions in schema public from public, anon;
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.role_rank(text), private.is_platform_admin(), private.is_active_user(), private.workspace_role(uuid), private.has_role(uuid, text), private.shares_workspace(uuid),
  private.random_slug(int), private.slugify(text), private.unique_workspace_slug(text) to authenticated;
grant execute on function public.analytics_overview(uuid, jsonb), public.analytics_question_aggregates(uuid, jsonb), public.analytics_crosstab(uuid, uuid, uuid, jsonb),
  public.analytics_group_numeric(uuid, uuid, uuid, jsonb), public.analytics_text_answers(uuid, uuid, jsonb, int, int), public.analytics_other_answers(uuid, uuid, jsonb, int),
  public.list_responses(uuid, jsonb, text, int, int), public.get_response(uuid), public.export_responses_page(uuid, jsonb, timestamptz, int),
  public.delete_responses(uuid, uuid[]), public.update_responses_review(uuid, uuid[], text, boolean, text) to authenticated;
-- public endpoints keep their grants
grant execute on function public.get_public_form(text) to anon, authenticated;
grant execute on function public.gateway_rate_limit(text, text, int, int), public.submit_response(text, uuid, jsonb, jsonb, jsonb, text, uuid, text, timestamptz, int),
  public.submit_abuse_report(text, text, text, text, text), public.record_error(text, text, text, text, jsonb),
  public.record_ai_usage(text, uuid, uuid, text, text, text, int, int, int, boolean, text), public.record_usage(text, uuid, text, bigint) to anon, authenticated;
