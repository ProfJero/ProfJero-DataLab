-- ProfJero DataLab — core schema
-- Conventions: UUID primary keys, timestamptz everywhere, explicit workspace ownership,
-- JSONB only for flexible configuration. RLS is enabled on every table (see next migration).

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

-- Never grant function execution implicitly; every RPC is granted explicitly.
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema private revoke execute on functions from public;

create or replace function private.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------- identities
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text check (char_length(full_name) <= 200),
  avatar_url text check (char_length(avatar_url) <= 1000),
  avatar_public_id text,
  intended_use text check (intended_use in ('education', 'research', 'business', 'nonprofit', 'religious', 'personal', 'other')),
  organisation_type text check (char_length(organisation_type) <= 100),
  onboarded_at timestamptz,
  default_workspace_id uuid,
  account_status text not null default 'active' check (account_status in ('active', 'suspended')),
  deletion_requested_at timestamptz,
  ai_processing_consent boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_email_idx on public.profiles (lower(email));

create table public.platform_admins (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  granted_at timestamptz not null default now(),
  note text
);

-- ---------------------------------------------------------------- workspaces
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  owner_id uuid not null references public.profiles (id) on delete restrict,
  logo_url text check (char_length(logo_url) <= 1000),
  logo_public_id text,
  organisation_type text,
  is_demo boolean not null default false,
  ai_enabled boolean not null default true,
  data_retention_days int check (data_retention_days is null or data_retention_days between 30 and 3650),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index workspaces_owner_idx on public.workspaces (owner_id);

alter table public.profiles
  add constraint profiles_default_ws_fk foreign key (default_workspace_id) references public.workspaces (id) on delete set null;

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'editor', 'analyst', 'viewer')),
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_members_user_idx on public.workspace_members (user_id);

create table public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email text not null check (email = lower(email) and char_length(email) <= 320),
  role text not null check (role in ('admin', 'editor', 'analyst', 'viewer')),
  token_hash text not null unique,
  invited_by uuid references public.profiles (id) on delete set null,
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index workspace_invitations_ws_idx on public.workspace_invitations (workspace_id);
create unique index workspace_invitations_pending_uniq on public.workspace_invitations (workspace_id, email)
  where accepted_at is null and revoked_at is null;

-- ---------------------------------------------------------------- plans & billing
create table public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9_]{2,40}$'),
  name text not null,
  description text,
  price_monthly_minor int check (price_monthly_minor >= 0),
  price_yearly_minor int check (price_yearly_minor >= 0),
  currency text not null default 'GHS' check (char_length(currency) = 3),
  features jsonb not null default '{}'::jsonb check (jsonb_typeof(features) = 'object'),
  limits jsonb not null default '{}'::jsonb check (jsonb_typeof(limits) = 'object'),
  is_public boolean not null default true,
  is_active boolean not null default true,
  is_default boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index subscription_plans_single_default on public.subscription_plans (is_default) where is_default;

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.workspaces (id) on delete cascade,
  plan_id uuid not null references public.subscription_plans (id),
  status text not null default 'active' check (status in ('active', 'trialing', 'past_due', 'canceled', 'pending')),
  provider text not null default 'none' check (provider in ('none', 'manual', 'paystack', 'stripe')),
  provider_customer_id text,
  provider_subscription_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  assigned_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index subscriptions_plan_idx on public.subscriptions (plan_id);

create table public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  plan_id uuid references public.subscription_plans (id),
  initiated_by uuid references public.profiles (id) on delete set null,
  provider text not null,
  reference text not null unique,
  interval text not null default 'monthly' check (interval in ('monthly', 'yearly')),
  amount_minor int not null check (amount_minor >= 0),
  currency text not null,
  status text not null default 'pending' check (status in ('pending', 'success', 'failed', 'abandoned')),
  provider_payload jsonb,
  created_at timestamptz not null default now(),
  verified_at timestamptz
);
create index payment_transactions_ws_idx on public.payment_transactions (workspace_id, created_at desc);

create table public.usage_records (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  metric text not null check (metric in ('responses', 'ai_credits', 'exports', 'upload_bytes')),
  period_month date not null,
  quantity bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, metric, period_month)
);

-- ---------------------------------------------------------------- forms
create table public.forms (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  title text not null check (char_length(title) between 1 and 300),
  description text check (char_length(description) <= 5000),
  slug text not null unique check (slug ~ '^[a-zA-Z0-9_-]{6,40}$'),
  status text not null default 'draft' check (status in ('draft', 'published', 'closed', 'archived')),
  cover_image_url text check (char_length(cover_image_url) <= 1000),
  logo_url text check (char_length(logo_url) <= 1000),
  theme jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  version int not null default 1,
  template_slug text,
  response_count int not null default 0,
  last_response_at timestamptz,
  published_at timestamptz,
  closed_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index forms_workspace_idx on public.forms (workspace_id, updated_at desc);
create index forms_created_by_idx on public.forms (created_by);

create table public.form_publication_settings (
  form_id uuid primary key references public.forms (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  is_public boolean not null default true,
  require_auth boolean not null default false,
  closes_at timestamptz,
  response_limit int check (response_limit is null or response_limit > 0),
  prevent_duplicates boolean not null default false,
  honeypot boolean not null default true,
  collect_respondent_email boolean not null default false,
  ai_analysis_enabled boolean not null default true,
  closed_message text check (char_length(closed_message) <= 1000),
  updated_at timestamptz not null default now()
);
create index form_publication_settings_ws_idx on public.form_publication_settings (workspace_id);

create table public.form_sections (
  id uuid primary key,
  form_id uuid not null references public.forms (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  position int not null,
  title text not null default '' check (char_length(title) <= 500),
  description text check (char_length(description) <= 4000),
  jumps jsonb not null default '[]'::jsonb check (jsonb_typeof(jumps) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index form_sections_form_idx on public.form_sections (form_id, position);
create index form_sections_ws_idx on public.form_sections (workspace_id);

create table public.form_questions (
  id uuid primary key,
  form_id uuid not null references public.forms (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  section_id uuid references public.form_sections (id) on delete set null,
  position int not null,
  type text not null check (type in ('short_text', 'long_text', 'single_choice', 'multiple_choice', 'dropdown', 'yes_no', 'number', 'email', 'phone', 'date', 'time', 'rating', 'linear_scale', 'likert', 'file_upload', 'image_choice', 'url', 'heading', 'statement')),
  title text not null default '' check (char_length(title) <= 1000),
  description text check (char_length(description) <= 4000),
  required boolean not null default false,
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object'),
  visibility jsonb,
  -- Questions removed after responses exist are archived (never deleted) so answers keep their meaning.
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index form_questions_form_idx on public.form_questions (form_id, position) where archived_at is null;
create index form_questions_section_idx on public.form_questions (section_id);
create index form_questions_ws_idx on public.form_questions (workspace_id);

-- ---------------------------------------------------------------- responses
create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.forms (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  status text not null default 'completed' check (status in ('completed', 'partial')),
  form_version int,
  started_at timestamptz,
  submitted_at timestamptz not null default now(),
  duration_seconds int check (duration_seconds >= 0),
  respondent_user_id uuid references public.profiles (id) on delete set null,
  respondent_email text check (char_length(respondent_email) <= 320),
  fingerprint text,
  review_status text not null default 'none' check (review_status in ('none', 'needs_review', 'reviewed')),
  is_flagged boolean not null default false,
  flag_reason text check (char_length(flag_reason) <= 500),
  is_sample boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index submissions_form_time_idx on public.submissions (form_id, submitted_at desc);
create index submissions_ws_time_idx on public.submissions (workspace_id, submitted_at desc);
create index submissions_fingerprint_idx on public.submissions (form_id, fingerprint) where fingerprint is not null;
create index submissions_respondent_idx on public.submissions (respondent_user_id) where respondent_user_id is not null;

create table public.submission_answers (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id) on delete cascade,
  form_id uuid not null references public.forms (id) on delete cascade,
  question_id uuid not null references public.form_questions (id) on delete cascade,
  value jsonb not null,
  value_text text,
  value_number numeric,
  value_options text[],
  other_text text check (char_length(other_text) <= 1000),
  unique (submission_id, question_id)
);
create index submission_answers_form_q_idx on public.submission_answers (form_id, question_id);
create index submission_answers_question_idx on public.submission_answers (question_id);
create index submission_answers_options_gin on public.submission_answers using gin (value_options);

create table public.response_flags (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  flag_type text not null check (flag_type in ('suspicious', 'incomplete', 'review', 'spam', 'note')),
  note text check (char_length(note) <= 2000),
  created_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index response_flags_submission_idx on public.response_flags (submission_id);
create index response_flags_ws_idx on public.response_flags (workspace_id);
create index response_flags_created_by_idx on public.response_flags (created_by);

-- ---------------------------------------------------------------- templates
create table public.form_templates (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  category text not null,
  title text not null,
  summary text,
  definition jsonb not null,
  question_count int not null default 0,
  is_published boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- reports
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  form_id uuid references public.forms (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  title text not null check (char_length(title) between 1 and 300),
  type text not null check (type in ('survey_summary', 'research_report', 'executive_summary', 'question_analysis', 'comparative_report', 'ai_findings')),
  status text not null default 'draft' check (status in ('draft', 'final')),
  meta jsonb not null default '{}'::jsonb,
  filters jsonb not null default '{}'::jsonb,
  sample_size int,
  generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index reports_ws_idx on public.reports (workspace_id, updated_at desc);
create index reports_form_idx on public.reports (form_id);
create index reports_created_by_idx on public.reports (created_by);

create table public.report_sections (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  position int not null,
  kind text not null check (kind in ('markdown', 'question', 'findings', 'crosstab', 'table')),
  title text not null default '' check (char_length(title) <= 300),
  body text check (char_length(body) <= 100000),
  data jsonb not null default '{}'::jsonb,
  source text not null default 'generated' check (source in ('generated', 'ai', 'user')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index report_sections_report_idx on public.report_sections (report_id, position);
create index report_sections_ws_idx on public.report_sections (workspace_id);

-- ---------------------------------------------------------------- AI
create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  form_id uuid references public.forms (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null default 'New analysis' check (char_length(title) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ai_conversations_ws_idx on public.ai_conversations (workspace_id);
create index ai_conversations_form_user_idx on public.ai_conversations (form_id, user_id, updated_at desc);
create index ai_conversations_user_idx on public.ai_conversations (user_id);

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) <= 50000),
  grounding jsonb,
  model text,
  status text not null default 'ok' check (status in ('ok', 'error')),
  created_at timestamptz not null default now()
);
create index ai_messages_conversation_idx on public.ai_messages (conversation_id, created_at);
create index ai_messages_ws_idx on public.ai_messages (workspace_id);

create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  feature text not null,
  provider text not null,
  model text,
  tokens_in int not null default 0,
  tokens_out int not null default 0,
  credits int not null default 0,
  success boolean not null,
  error_code text,
  created_at timestamptz not null default now()
);
create index ai_usage_ws_time_idx on public.ai_usage (workspace_id, created_at desc);
create index ai_usage_time_idx on public.ai_usage (created_at desc);
create index ai_usage_user_idx on public.ai_usage (user_id);

-- ---------------------------------------------------------------- media (Cloudinary references)
create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces (id) on delete cascade,
  uploaded_by uuid references public.profiles (id) on delete set null,
  form_id uuid references public.forms (id) on delete set null,
  purpose text not null check (purpose in ('form_cover', 'form_logo', 'workspace_logo', 'avatar', 'option_image', 'response_file')),
  public_id text not null unique,
  secure_url text not null,
  resource_type text not null default 'image',
  format text,
  bytes bigint,
  width int,
  height int,
  created_at timestamptz not null default now()
);
create index media_assets_ws_idx on public.media_assets (workspace_id);
create index media_assets_form_idx on public.media_assets (form_id);
create index media_assets_uploaded_by_idx on public.media_assets (uploaded_by);

-- ---------------------------------------------------------------- governance & operations
create table public.audit_logs (
  id bigint generated always as identity primary key,
  workspace_id uuid references public.workspaces (id) on delete set null,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  is_platform boolean not null default false,
  created_at timestamptz not null default now()
);
create index audit_logs_ws_time_idx on public.audit_logs (workspace_id, created_at desc);
create index audit_logs_time_idx on public.audit_logs (created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  emailed_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_ws_idx on public.notifications (workspace_id);

create table public.platform_settings (
  key text primary key check (key ~ '^[a-z0-9_.]{2,80}$'),
  value jsonb not null,
  description text,
  is_public boolean not null default false,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.abuse_reports (
  id uuid primary key default gen_random_uuid(),
  form_id uuid references public.forms (id) on delete set null,
  form_slug text,
  reason text not null check (reason in ('phishing', 'spam', 'harassment', 'illegal', 'privacy', 'other')),
  details text check (char_length(details) <= 4000),
  reporter_email text check (char_length(reporter_email) <= 320),
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  resolution_note text,
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index abuse_reports_status_idx on public.abuse_reports (status, created_at desc);
create index abuse_reports_form_idx on public.abuse_reports (form_id);
create index abuse_reports_resolved_by_idx on public.abuse_reports (resolved_by);

create table public.error_events (
  id bigint generated always as identity primary key,
  source text not null,
  code text,
  message text not null check (char_length(message) <= 2000),
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index error_events_time_idx on public.error_events (created_at desc);

-- private infrastructure tables (never exposed through the API)
create table private.app_secrets (
  name text primary key,
  value text not null,
  created_at timestamptz not null default now()
);

create table private.rate_limits (
  bucket text not null,
  window_start timestamptz not null,
  hits int not null default 0,
  primary key (bucket, window_start)
);

-- updated_at triggers
do $$
declare t text;
begin
  foreach t in array array['profiles','workspaces','subscription_plans','subscriptions','forms','form_sections','form_questions','form_templates','reports','report_sections','ai_conversations','form_publication_settings','platform_settings','usage_records'] loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function private.set_updated_at()', t);
  end loop;
end $$;

-- RLS on every public table. Policies are defined in the next migration.
do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', r.tablename);
  end loop;
end $$;
