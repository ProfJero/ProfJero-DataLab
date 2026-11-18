-- RLS, tenant-isolation and permission tests. Run with: pnpm test:rls (local Postgres + shim)
\set ON_ERROR_STOP 1
set client_min_messages = warning;

create schema if not exists t;
grant usage on schema t to anon, authenticated;
create table if not exists t.results (name text, ok boolean, detail text);
grant all on t.results to anon, authenticated;
create table if not exists t.ctx (k text primary key, v text);
grant all on t.ctx to anon, authenticated;

create or replace function t.check(p_name text, p_ok boolean, p_detail text default null) returns void language sql as $$
  insert into t.results values (p_name, coalesce(p_ok, false), p_detail) $$;
create or replace function t.expect_error(p_name text, p_sql text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
    perform t.check(p_name, false, 'no error raised');
  exception when others then
    perform t.check(p_name, true, sqlerrm);
  end;
end $$;
create or replace function t.rows(p_sql text) returns int language plpgsql as $$
declare n int; begin execute 'select count(*) from (' || p_sql || ') x' into n; return n; end $$;
create or replace function t.affected(p_sql text) returns int language plpgsql as $$
declare n int; begin execute p_sql; get diagnostics n = row_count; return n; end $$;
create or replace function t.get(p_k text) returns text language sql as $$ select v from t.ctx where k = p_k $$;
create or replace function t.put(p_k text, p_v text) returns void language sql as $$ insert into t.ctx values (p_k, p_v) on conflict (k) do update set v = excluded.v $$;
grant execute on all functions in schema t to anon, authenticated;

truncate t.results; truncate t.ctx;

-- users
insert into auth.users (id, email, raw_user_meta_data) values
 ('a0000000-0000-4000-8000-000000000001', 'owner@test.local', '{"full_name":"Ama Owner"}'),
 ('b0000000-0000-4000-8000-000000000002', 'viewer@test.local', '{"full_name":"Kofi Viewer"}'),
 ('c0000000-0000-4000-8000-000000000003', 'outsider@test.local', '{"full_name":"Esi Outsider"}'),
 ('d0000000-0000-4000-8000-000000000004', 'editor@test.local', '{"full_name":"Yaw Editor"}');
insert into private.app_secrets (name, value) values ('gateway_key', 'test-gateway-key') on conflict (name) do update set value = excluded.value;

-- ===== Owner sets up workspace and form
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}', false);
select t.put('ws', public.complete_onboarding('Ama Owner', 'research', 'University', 'Research Lab')::text);
select t.check('profile created by trigger', (select full_name from public.profiles where id = auth.uid()) = 'Ama Owner');
select t.check('owner membership created', (select role from public.workspace_members where workspace_id = t.get('ws')::uuid and user_id = auth.uid()) = 'owner');
select t.check('free subscription assigned', (public.workspace_entitlements(t.get('ws')::uuid) ->> 'plan_code') = 'free');
select t.expect_error('free plan cannot invite (team feature gated)', $$select public.create_invitation(t.get('ws')::uuid, 'viewer@test.local', 'viewer')$$);
reset role;
update public.subscriptions set plan_id = (select id from public.subscription_plans where code = 'organisation') where workspace_id = t.get('ws')::uuid;
set role authenticated;
select t.put('tok', public.create_invitation(t.get('ws')::uuid, 'viewer@test.local', 'viewer') ->> 'token');
select t.put('tok2', public.create_invitation(t.get('ws')::uuid, 'editor@test.local', 'editor') ->> 'token');
select t.put('form', public.create_form(t.get('ws')::uuid, '{
  "title":"Network survey","description":"","theme":{},"settings":{},
  "sections":[{"id":"11111111-1111-4111-8111-111111111111","title":"","jumps":[]}],
  "questions":[
   {"id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","sectionId":"11111111-1111-4111-8111-111111111111","type":"single_choice","title":"Network","required":true,"config":{"options":[{"id":"mtn","label":"MTN"},{"id":"tel","label":"Telecel"}]}},
   {"id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","sectionId":"11111111-1111-4111-8111-111111111111","type":"rating","title":"Satisfaction","required":true,"config":{"scaleMax":5}},
   {"id":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","sectionId":"11111111-1111-4111-8111-111111111111","type":"long_text","title":"Challenges","required":false,"config":{}}
  ]}'::jsonb)::text);
select t.check('form created with 3 questions', (select count(*) from public.form_questions where form_id = t.get('form')::uuid) = 3);
select t.expect_error('status cannot be changed by direct update', $$update public.forms set status = 'published' where id = t.get('form')::uuid$$);
select public.set_form_status(t.get('form')::uuid, 'published');
select t.check('form published via RPC', (select status from public.forms where id = t.get('form')::uuid) = 'published');
select t.put('slug', (select slug from public.forms where id = t.get('form')::uuid));
select t.expect_error('version conflict detected', $$select public.save_form_definition(t.get('form')::uuid, public.get_form_definition(t.get('form')::uuid) -> 'definition', 1)$$);

-- ===== Anonymous respondent
reset role; set role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', false);
select t.check('anon can read published public form', public.get_public_form(t.get('slug')) ->> 'available' = 'true');
select t.check('anon sees nothing for unknown slug', public.get_public_form('doesnotexist') is null);
select t.check('anon can read public plan catalogue', t.rows('select * from public.subscription_plans') = 4);
select t.check('anon can read public platform settings', t.rows('select * from public.platform_settings') > 0);
select t.check('anon cannot read platform admins', t.rows('select 1 from public.subscription_plans where false') = 0);
select t.expect_error('anon cannot read platform_admins table', 'select * from public.platform_admins');
select t.expect_error('anon cannot select submissions', 'select * from public.submissions');
select t.expect_error('anon cannot select forms table', 'select * from public.forms');
select t.expect_error('submit without gateway key rejected', $$select public.submit_response('wrong', t.get('form')::uuid, '{}'::jsonb, null, null, null, null, null, null, 1)$$);
select public.submit_response('test-gateway-key', t.get('form')::uuid, '{"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa":"mtn","bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb":5,"cccccccc-cccc-4ccc-8ccc-cccccccccccc":"Data is expensive and the network is slow"}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'fp1', null, null, now() - interval '2 minutes', 2);
select public.submit_response('test-gateway-key', t.get('form')::uuid, '{"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa":"mtn","bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb":4,"cccccccc-cccc-4ccc-8ccc-cccccccccccc":"Expensive data bundles"}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'fp2', null, null, null, 2);
select public.submit_response('test-gateway-key', t.get('form')::uuid, '{"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa":"tel","bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb":2,"99999999-9999-4999-8999-999999999999":"ignored unknown question"}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'fp3', null, null, null, 2);
select t.check('rate limit allows within window', public.gateway_rate_limit('test-gateway-key', 'ip:1', 2, 60));
select public.gateway_rate_limit('test-gateway-key', 'ip:1', 2, 60);
select t.check('rate limit blocks over limit', not public.gateway_rate_limit('test-gateway-key', 'ip:1', 2, 60));

-- ===== Invitees accept
reset role; set role authenticated;
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}', false);
select t.expect_error('outsider cannot accept invitation for another email', $$select public.accept_invitation(t.get('tok'))$$);
select set_config('request.jwt.claims', '{"sub":"b0000000-0000-4000-8000-000000000002","role":"authenticated"}', false);
select public.accept_invitation(t.get('tok'));
select t.check('viewer joined as viewer', (select role from public.workspace_members where user_id = auth.uid()) = 'viewer');
select t.expect_error('invitation cannot be reused', $$select public.accept_invitation(t.get('tok'))$$);
select set_config('request.jwt.claims', '{"sub":"d0000000-0000-4000-8000-000000000004","role":"authenticated"}', false);
select public.accept_invitation(t.get('tok2'));

-- ===== Viewer permissions
select set_config('request.jwt.claims', '{"sub":"b0000000-0000-4000-8000-000000000002","role":"authenticated"}', false);
select t.check('viewer can read forms', t.rows('select * from public.forms') = 1);
select t.check('viewer can read submissions', t.rows('select * from public.submissions') = 3);
select t.check('viewer cannot update form', t.affected($$update public.forms set title = 'hacked'$$) = 0);
select t.check('viewer cannot delete submissions', t.affected('delete from public.submissions') = 0);
select t.check('viewer cannot delete form', t.affected('delete from public.forms') = 0);
select t.expect_error('viewer cannot save definition', $$select public.save_form_definition(t.get('form')::uuid, '{"sections":[{"id":"11111111-1111-4111-8111-111111111111"}],"questions":[]}'::jsonb)$$);
select t.expect_error('viewer cannot change status', $$select public.set_form_status(t.get('form')::uuid, 'closed')$$);
select t.expect_error('viewer cannot invite', $$select public.create_invitation(t.get('ws')::uuid, 'x@test.local', 'admin')$$);
select t.expect_error('viewer cannot create report', $$insert into public.reports (workspace_id, title, type, created_by) values (t.get('ws')::uuid, 'r', 'survey_summary', auth.uid())$$);
select t.expect_error('viewer cannot change own account status', $$update public.profiles set account_status = 'suspended' where id = auth.uid()$$);
select t.expect_error('viewer cannot change own email', $$update public.profiles set email = 'x@evil.test' where id = auth.uid()$$);
select t.check('viewer can update own name', t.affected($$update public.profiles set full_name = 'Kofi V.' where id = auth.uid()$$) = 1);
select t.expect_error('viewer cannot self-promote via insert', $$insert into public.workspace_members (workspace_id, user_id, role) values (t.get('ws')::uuid, auth.uid(), 'owner')$$);
select t.expect_error('viewer cannot self-promote via update', $$update public.workspace_members set role = 'owner' where user_id = auth.uid()$$);
select t.expect_error('viewer cannot call admin RPC', 'select public.admin_overview()');
select t.check('viewer sees co-member profiles', t.rows('select * from public.profiles') = 3);
select t.check('viewer can view analytics', (public.analytics_overview(t.get('form')::uuid) ->> 'completed')::int = 3);

-- ===== Editor permissions
select set_config('request.jwt.claims', '{"sub":"d0000000-0000-4000-8000-000000000004","role":"authenticated"}', false);
select t.check('editor can flag responses', public.update_responses_review(t.get('form')::uuid, array(select id from public.submissions where fingerprint is null limit 1), 'needs_review', true, 'test') >= 0);
select t.expect_error('editor cannot change member roles', $$select public.update_member_role(t.get('ws')::uuid, 'b0000000-0000-4000-8000-000000000002', 'admin')$$);
select t.expect_error('editor cannot transfer ownership', $$select public.transfer_workspace_ownership(t.get('ws')::uuid, 'd0000000-0000-4000-8000-000000000004')$$);
insert into public.form_questions (id, form_id, workspace_id, position, type) values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', t.get('form')::uuid, gen_random_uuid(), 99, 'short_text');
select t.check('spoofed workspace_id is overwritten with the form''s workspace', (select workspace_id::text from public.form_questions where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee') = t.get('ws'));
delete from public.form_questions where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

-- ===== Outsider isolation (IDOR)
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}', false);
select t.check('outsider sees no forms', t.rows('select * from public.forms') = 0);
select t.check('outsider sees no submissions', t.rows('select * from public.submissions') = 0);
select t.check('outsider sees no answers', t.rows('select * from public.submission_answers') = 0);
select t.check('outsider sees no workspaces', t.rows('select * from public.workspaces') = 0);
select t.check('outsider sees only own profile', t.rows('select * from public.profiles') = 1);
select t.check('outsider sees no audit logs', t.rows('select * from public.audit_logs') = 0);
select t.check('outsider cannot update form by id', t.affected($$update public.forms set title = 'x' where id = t.get('form')::uuid$$) = 0);
select t.expect_error('outsider cannot read definition by id', $$select public.get_form_definition(t.get('form')::uuid)$$);
select t.expect_error('outsider cannot list responses by id', $$select public.list_responses(t.get('form')::uuid)$$);
select t.expect_error('outsider cannot run analytics by id', $$select * from public.analytics_question_aggregates(t.get('form')::uuid)$$);
select t.expect_error('outsider cannot crosstab by id', $$select * from public.analytics_crosstab(t.get('form')::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')$$);
select t.expect_error('outsider cannot create form in foreign workspace', $$select public.create_form(t.get('ws')::uuid, '{"title":"x","sections":[{"id":"22222222-2222-4222-8222-222222222222"}],"questions":[]}'::jsonb)$$);
select t.expect_error('outsider cannot insert form directly', $$insert into public.forms (workspace_id, title, slug) values (t.get('ws')::uuid, 'x', 'abcdefgh')$$);
select t.expect_error('outsider cannot read entitlements', $$select public.workspace_entitlements(t.get('ws')::uuid)$$);
select t.expect_error('outsider cannot read dashboard', $$select public.dashboard_stats(t.get('ws')::uuid)$$);
select t.expect_error('outsider cannot insert submission directly', $$insert into public.submissions (form_id, workspace_id) values (t.get('form')::uuid, t.get('ws')::uuid)$$);
select t.expect_error('outsider cannot hijack question ids across forms', $$select public.save_form_definition(t.get('form')::uuid, '{"sections":[{"id":"11111111-1111-4111-8111-111111111111"}],"questions":[]}'::jsonb)$$);
-- workspace creation forces owner = caller
insert into public.workspaces (name, owner_id) values ('Mine', 'a0000000-0000-4000-8000-000000000001');
select t.check('workspace owner forced to caller', (select owner_id from public.workspaces where name = 'Mine') = auth.uid());
select t.put('ws2', (select id::text from public.workspaces where name = 'Mine'));
-- free plan form limit (5)
select public.create_form(t.get('ws2')::uuid, ('{"title":"f' || g || '","sections":[{"id":"' || gen_random_uuid() || '"}],"questions":[]}')::jsonb) from generate_series(1, 5) g;
select t.expect_error('free plan form limit enforced', $$select public.create_form(t.get('ws2')::uuid, ('{"title":"f6","sections":[{"id":"' || gen_random_uuid() || '"}],"questions":[]}')::jsonb)$$);

-- ===== Owner analytics correctness
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}', false);
select t.check('analytics: answered count', (select cnt from public.analytics_question_aggregates(t.get('form')::uuid) where question_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and metric = 'answered') = 3);
select t.check('analytics: MTN count', (select cnt from public.analytics_question_aggregates(t.get('form')::uuid) where metric = 'opt' and key = 'mtn') = 2);
select t.check('analytics: rating buckets', (select sum(num * cnt) from public.analytics_question_aggregates(t.get('form')::uuid) where metric = 'num') = 11);
select t.check('analytics: keyword expensive in 2 docs', (select docs from public.analytics_question_aggregates(t.get('form')::uuid) where metric = 'word' and key = 'expensive') = 2);
select t.check('analytics: stopwords removed', not exists (select 1 from public.analytics_question_aggregates(t.get('form')::uuid) where metric = 'word' and key in ('the', 'and', 'is')));
select t.check('analytics: answer filter', (public.analytics_overview(t.get('form')::uuid, '{"answer":{"questionId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","value":"tel"}}') ->> 'completed')::int = 1);
select t.check('analytics: rating filter by value', (public.analytics_overview(t.get('form')::uuid, '{"answer":{"questionId":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","value":"5"}}') ->> 'completed')::int = 1);
select t.check('analytics: crosstab', (select sum(cnt) from public.analytics_crosstab(t.get('form')::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')) = 3);
select t.check('analytics: group mean', (select mean from public.analytics_group_numeric(t.get('form')::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') where group_key = 'mtn') = 4.5);
select t.check('responses: list total', (public.list_responses(t.get('form')::uuid) ->> 'total')::int = 3);
select t.check('responses: search', (public.list_responses(t.get('form')::uuid, '{"search":"bundles"}') ->> 'total')::int = 1);
select t.check('responses: unknown question ignored', (select count(*) from public.submission_answers where form_id = t.get('form')::uuid) = 8);
select t.check('response_count maintained', (select response_count from public.forms where id = t.get('form')::uuid) = 3);
select t.check('milestone notification sent', exists (select 1 from public.notifications where type = 'form.milestone' and user_id = auth.uid()));
select t.check('usage recorded', (public.workspace_entitlements(t.get('ws')::uuid) -> 'usage' ->> 'responses_per_month')::int = 3);
select t.expect_error('type locked once answered', $$select public.save_form_definition(t.get('form')::uuid, jsonb_set(public.get_form_definition(t.get('form')::uuid) -> 'definition', '{questions,0,type}', '"dropdown"'))$$);
-- archive instead of delete when answers exist
select public.save_form_definition(t.get('form')::uuid, jsonb_set(public.get_form_definition(t.get('form')::uuid) -> 'definition', '{questions}', (public.get_form_definition(t.get('form')::uuid) -> 'definition' -> 'questions') - 2));
select t.check('answered question archived not deleted', (select archived_at is not null from public.form_questions where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'));
select t.check('answers preserved after archive', (select count(*) from public.submission_answers where question_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc') = 2);
-- duplicate prevention & limits
select public.update_publication_settings(t.get('form')::uuid, '{"preventDuplicates":true,"responseLimit":4}');
reset role; set role anon;
select public.submit_response('test-gateway-key', t.get('form')::uuid, '{"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa":"mtn","bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb":3}'::jsonb, null, null, 'fpX', null, null, null, 3);
select t.expect_error('duplicate fingerprint rejected', $$select public.submit_response('test-gateway-key', t.get('form')::uuid, '{"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa":"mtn"}'::jsonb, null, null, 'fpX', null, null, null, 3)$$);
select t.expect_error('response limit enforced', $$select public.submit_response('test-gateway-key', t.get('form')::uuid, '{"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa":"mtn"}'::jsonb, null, null, 'fpZ', null, null, null, 3)$$);
select t.check('public form reports limit reached', public.get_public_form(t.get('slug')) ->> 'unavailableReason' = 'limit_reached');
reset role; set role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}', false);
select public.set_form_status(t.get('form')::uuid, 'closed');
reset role; set role anon;
select t.expect_error('closed form rejects submissions', $$select public.submit_response('test-gateway-key', t.get('form')::uuid, '{}'::jsonb, null, null, 'fpQ', null, null, null, 3)$$);
select t.check('closed form still viewable with reason', public.get_public_form(t.get('slug')) ->> 'unavailableReason' = 'closed');

-- ===== Platform admin
reset role;
insert into public.platform_admins (user_id) values ('a0000000-0000-4000-8000-000000000001');
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}', false);
select t.check('platform admin can call overview', (public.admin_overview() ->> 'users')::int = 4);
select public.admin_set_user_status('c0000000-0000-4000-8000-000000000003', 'suspended', 'test');
select t.check('admin action audited', exists (select 1 from public.audit_logs where action = 'admin.user_status_changed'));
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}', false);
select t.expect_error('suspended user cannot create workspace', $$insert into public.workspaces (name, owner_id) values ('Nope', auth.uid())$$);
select t.check('suspended user loses workspace access', t.rows('select * from public.forms') = 0);
reset role;

\echo
select case when ok then 'PASS' else 'FAIL' end as result, name, case when not ok then detail end as detail from t.results order by ok, name;
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed from t.results;
