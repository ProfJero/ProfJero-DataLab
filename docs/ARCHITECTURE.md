# Architecture

```
Browser (React SPA)
   │  static assets + /api/*            ┌──────────────────────────────┐
   ▼                                     │ Supabase                     │
Edge Worker "profjero-datalab" ──service binding──► API Worker "profjero-datalab-api" ──► PostgREST / RPC (RLS)  │
   │  (KV release store, CSP, SEO)        (Hono, Zod, shared logic)      │ Auth, Postgres, RLS          │
   │                                        │  │  │                      └──────────────────────────────┘
   └── supabase-js (anon key + user JWT) ───┼──┼──┼──────────────────────────► (direct, RLS-protected reads/writes)
                                            │  │  └─► AI provider (OpenAI / Anthropic / compatible)
                                            │  └────► Cloudinary (signed uploads, Admin API verification)
                                            └───────► Resend (email), Paystack (payments)
```

## Principles
- **The database is the security boundary.** Every table has Row Level Security; privileged operations are `SECURITY DEFINER` functions with explicit authorisation checks. The frontend and API both act *as the user* (their JWT), so a bug in either cannot bypass tenant isolation.
- **No service-role key anywhere.** Operations that must not be callable directly by clients (public submissions, rate limiting, AI/usage accounting, billing confirmation) require a *gateway key* known only to the API Worker and stored in `private.app_secrets`.
- **One source of truth for form logic.** `packages/shared` holds the form schema (Zod), conditional-logic evaluation, answer validation, statistics and templates. The builder, respondent renderer and API use the same code, so client and server validation can't drift.
- **Aggregate in the database.** Analytics functions return compact distributions (value → count), never raw response sets. TypeScript turns distributions into tested statistics (mean, median, quartiles, chi-square).

## Layers
| Concern | Location |
|---|---|
| Presentation | `apps/web/src/pages`, `components` |
| Application logic | `packages/shared` (logic, validation, stats), `apps/api/src/routes` |
| Data access | `apps/web/src/lib/supabase.ts`, `apps/api/src/lib/supabase.ts` (minimal REST client) |
| Authn/authz | Supabase Auth; RLS + `private.has_role()`; API verifies JWT via `/auth/v1/user` |
| Analytics | SQL: `analytics_*` functions; TS: `shared/analytics.ts`, `shared/stats.ts`, `api/lib/analytics.ts` |
| AI | `apps/api/src/ai` (provider abstraction, analyst, themes, form generation) |
| Uploads | `apps/api/src/lib/cloudinary.ts`, `apps/web/src/lib/uploads.ts` |
| Billing | `apps/api/src/routes/billing.ts` + `billing_*` SQL functions; plans in `subscription_plans` |

## Form builder
`useBuilder` keeps the whole definition in memory, autosaves 1.2 s after the last edit through `save_form_definition` (atomic, with optimistic concurrency via `version`), retries transient failures with backoff, keeps a local backup offered for restore after a crash, and supports undo/redo. Questions keep stable UUIDs; removing a question that has answers archives it instead of deleting it.

## AI Data Analyst (grounded)
1. The API computes all statistics for the form and turns them into plain-language *verified facts*.
2. A planning call lets the model choose up to three **controlled operations** (`crosstab`, `compare_numeric`, `subgroup`, `text_samples`) — never SQL.
3. The API executes them with trusted functions and appends the results to the facts.
4. The answering call receives only verified facts plus redacted respondent text wrapped in `<untrusted_respondent_text>` tags, with rules to cite figures and separate evidence, interpretation and recommendations.
5. Every number in the answer is checked against the facts; unmatched figures are shown to the user as warnings. The evidence used is stored with the message.
Theme analysis: the model proposes themes and keywords; **DataLab counts** matching answers itself.

## Data visualisation
Single-series charts use brand blue; Likert uses a diverging scale with a neutral midpoint; the categorical order (`#2864C5, #20A47A, #E08A1E, #8B5CF6, #0EA5B7, #D9488F`) was checked with a colour-vision-deficiency validator and every chart offers a table view.

## Deployment model
See [DEPLOYMENT.md](DEPLOYMENT.md). The web Worker serves releases from Workers KV (uploaded through an authenticated `/__deploy` endpoint) because this environment has no Cloudflare API token; with a token you can switch to Workers Static Assets.

## Brand assets
The official logo (supplied by ProfJero Digital Studio) is in `apps/web/public/brand/`: `logo-full.png` (lockup with tagline, transparent — light backgrounds only), `logo-mark.png` (symbol), `icon-32/48/192/512.png` (white app tiles), plus `favicon.ico`, `apple-touch-icon.png` and `og-image.png` in `public/`. `components/brand/Logo.tsx` renders the mark with a live-text wordmark (ProfJero navy, Data blue, Lab green); on dark surfaces the mark sits on a white tile so the navy “J” stays visible.
