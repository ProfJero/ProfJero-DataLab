# Database

PostgreSQL on Supabase. Migrations live in `supabase/migrations` and were applied to project `nxbduxtrngxaxmrebjic` in order:

| Migration | Purpose |
|---|---|
| `…000100_core_schema` | Tables, indexes, constraints, `updated_at` triggers, RLS enabled everywhere |
| `…000200_access_control` | Role helpers, identity/workspace/form integrity triggers, all RLS policies, table privileges |
| `…000300_core_rpcs` | Gateway + rate limiting, entitlements, form definition save/publish, public form + submission, team management, dashboard |
| `…000400_analytics` | Scoped filters, overview, per-question aggregates, crosstab, group comparison, text answers, response listing/export |
| `…000500_admin_billing` | Platform admin RPCs, provider-neutral billing, plan + settings seeds |
| `…000600_seed_stopwords` | Stopwords for keyword analysis |
| `…000700_anon_catalogue_access` | Lets anonymous visitors read the public plan/template catalogue |
| `…000800_theme_for_all_plans` | Custom themes available on every plan |

`supabase/seed/templates.sql` (optional) copies the built-in template library into `form_templates`; built-in templates otherwise ship with the app from `packages/shared/src/templates.ts`.

## Tables
**Identity & tenancy:** `profiles` (1:1 `auth.users`), `platform_admins`, `workspaces`, `workspace_members` (role: owner/admin/editor/analyst/viewer), `workspace_invitations` (hashed tokens).
**Forms:** `forms` (status, version, theme/settings JSONB, response counter), `form_publication_settings`, `form_sections` (jumps JSONB), `form_questions` (stable UUID, type, config/visibility JSONB, `archived_at`).
**Responses:** `submissions`, `submission_answers` (one row per answered question: `value` JSONB plus typed `value_text`, `value_number`, `value_options text[]` for indexed analytics), `response_flags`.
**Content:** `form_templates`, `reports`, `report_sections`, `media_assets` (Cloudinary references only).
**AI:** `ai_conversations`, `ai_messages` (with grounding JSON), `ai_usage`.
**Billing & usage:** `subscription_plans` (features + limits JSONB), `subscriptions`, `payment_transactions`, `usage_records` (monthly counters).
**Governance:** `audit_logs`, `notifications`, `platform_settings`, `abuse_reports`, `error_events`.
**Private schema (not exposed):** `app_secrets`, `rate_limits`, `stopwords`.

Answers never depend on question position: they reference `form_questions.id`. No columns are created per question.

## Row Level Security
- `private.has_role(workspace_id, min_role)` compares the caller's membership role (active accounts only) using ranks viewer < analyst < editor < admin < owner. Policies wrap it in `(select …)` so it is evaluated once per statement.
- Members read their workspace's data; editors write forms and triage responses; analysts create reports and AI conversations (which are private to their author); admins manage members and settings; owners manage billing and deletion.
- Child tables inherit `workspace_id` from their parent through triggers, so a client cannot spoof tenancy.
- `submissions` cannot be inserted by clients at all — only `submit_response()` with the gateway key.
- Trigger guards block clients from changing protected columns (account status, owners, response counters, form status outside `set_form_status`).

## Initial platform administrator
There is no default admin. After the owner signs up, run in the Supabase SQL editor:

```sql
insert into public.platform_admins (user_id, note)
select id, 'initial platform administrator' from public.profiles where email = 'owner@example.com';
```

Revoke with `delete from public.platform_admins where user_id = '…';`.

## Demonstration data
Workspaces have an `is_demo` flag (settable only by platform admins) and submissions an `is_sample` flag; the app labels both. To seed a demo workspace in a non-production project, create a workspace as an admin, set `is_demo = true`, create forms from templates and submit responses through the public form (or `submit_response`) so all invariants hold.
