# API

Base URL: `https://profjero-datalab-api.profjerodigitalstudio.workers.dev/v1` — also available same-origin as `/api/v1` on the web app.
Authenticated endpoints require `Authorization: Bearer <Supabase access token>`. Errors are `{ "error": { "code", "message", "details?" } }`.
Plan restrictions return **402** with `code` `plan_feature` or `plan_limit`.

Most reads/writes go directly to Supabase (PostgREST/RPC, protected by RLS). The Worker handles work that needs secrets, cross-cutting validation, rate limiting or external services.

## Public (no auth)
| Method | Path | Description |
|---|---|---|
| GET | `/health` | API + database health |
| GET | `/public/forms/:slug` | Published form definition and availability |
| POST | `/public/forms/:slug/submit` | Submit `{ answers, otherText?, respondentEmail?, startedAt?, website? }`. Validated with the shared validator honouring conditional logic; 422 with per-question errors. Rate limited (10/min per IP+form, 120/h per IP), honeypot + timing check, 256 KB max, duplicate prevention. |
| POST | `/public/forms/:slug/upload` | Signed Cloudinary upload for a file question (type/size checked; file re-verified via Admin API at submit) |
| POST | `/public/abuse-reports` | Report a form |
| POST | `/billing/webhooks/paystack` | Paystack webhook (HMAC-SHA512 verified; payment re-verified server-to-server) |

## Authenticated
| Method | Path | Description |
|---|---|---|
| GET | `/config` | Which integrations are configured (AI, uploads, email, payments) |
| POST | `/forms/:id/publish` | Validates structure + logic with `publishIssues`, then publishes (entitlements re-checked in SQL) |
| GET | `/forms/:id/analytics?from&to&excludeFlagged&answerQuestion&answerValue` | Overview + per-question summaries |
| POST | `/forms/:id/crosstab` | `{ rowQuestion, colQuestion, filters? }` → counts, row %, chi-square, Cramér's V (Research+) |
| POST | `/forms/:id/compare` | `{ groupQuestion, valueQuestion, filters? }` → per-group mean/median/sd (Research+) |
| GET | `/forms/:id/export?format=csv\|json` | All matching responses (CSV with formula-injection protection; JSON for client-side XLSX) |
| POST | `/forms/:id/ai/ask` | `{ question, conversationId? }` grounded analyst answer with evidence |
| POST | `/forms/:id/ai/insight` | `{ mode: summary\|executive\|recommendations }` |
| POST | `/forms/:id/ai/themes` | `{ questionId }` AI themes with platform-calculated counts |
| POST | `/forms/:id/ai/sentiment` | `{ questionId }` sentiment classification (labelled as AI classification) |
| POST | `/ai/generate-form` | `{ workspaceId, prompt }` validated draft definition |
| POST | `/reports/generate` | `{ formId, type, title, description?, objectives?, methodology?, compareQuestionId?, useAi }` |
| POST | `/uploads/sign` | Signed Cloudinary upload for covers, logos, avatars |
| POST | `/workspaces/:id/invitations` | `{ email, role }` creates invitation, emails it if configured, returns the link |
| POST | `/billing/checkout` | Paystack checkout (owner only) |
| POST | `/billing/verify` | `{ reference }` verify payment and activate plan |

AI errors map to `ai_not_configured` (503), `ai_rate_limited` (429), `ai_context_too_large` (413), `ai_provider_error`/`ai_invalid_response`/`ai_timeout`/`ai_network`/`ai_auth_failed` (502). Failures are recorded in `ai_usage` and consume no credits.

## Database RPCs used by the web app
`get_form_definition`, `create_form`, `save_form_definition`, `set_form_status`, `update_publication_settings`, `list_responses`, `get_response`, `delete_responses`, `update_responses_review`, `analytics_text_answers`, `analytics_other_answers`, `dashboard_stats`, `workspace_entitlements`, `complete_onboarding`, `create_invitation`, `get_invitation`, `accept_invitation`, `revoke_invitation`, `update_member_role`, `remove_member`, `transfer_workspace_ownership`, `register_media_asset`, `export_my_data`, `request_account_deletion`, and `admin_*` (platform admins only).
