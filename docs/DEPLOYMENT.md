# Deployment

## Current production
| Component | Location |
|---|---|
| Web (edge Worker) | `profjero-datalab` → https://profjero-datalab.profjerodigitalstudio.workers.dev |
| API Worker | `profjero-datalab-api` → https://profjero-datalab-api.profjerodigitalstudio.workers.dev |
| KV release store | namespace `profjero-datalab-site` |
| Supabase | project `nxbduxtrngxaxmrebjic` (eu-west-2), migrations `000100`–`000800` applied |

## Database
Apply migrations in order (Supabase CLI: `supabase link --project-ref <ref>` then `supabase db push`, or paste each file into the SQL editor). Then store the gateway key:

```sql
insert into private.app_secrets (name, value) values ('gateway_key', '<random 64-hex>')
on conflict (name) do update set value = excluded.value;
```

## Supabase Auth settings (manual — not available through the tools used)
In **Authentication → URL Configuration**:
- **Site URL:** `https://profjero-datalab.profjerodigitalstudio.workers.dev`
- **Redirect URLs:** `https://profjero-datalab.profjerodigitalstudio.workers.dev/**` and `http://localhost:5173/**`

Until this is done, confirmation and password-reset emails redirect to Supabase's default site URL. Clicking the link still verifies the account, and users can then sign in normally. For production email volume, configure custom SMTP under **Authentication → Emails**.

## API Worker
With a Cloudflare API token (CI or a workstation):

```bash
cd apps/api && npx wrangler deploy
```

```bash
npx wrangler secret put GATEWAY_KEY
```

Repeat `wrangler secret put` for each secret in ENVIRONMENT.md.

## Web app
Option A — **KV release flow (used for the current deployment):**

```bash
DEPLOY_KEY=<edge deploy key> scripts/deploy-web.sh
```

This builds `apps/web`, uploads `dist/` to a new release, activates it atomically, and removes old releases (current and previous are kept for rollback). Roll back with:

```bash
curl -X POST -H "x-deploy-key: $DEPLOY_KEY" -d '{"release":"<previous id>"}' https://profjero-datalab.profjerodigitalstudio.workers.dev/__deploy/activate
```

Option B — **Workers Static Assets** (recommended once you have an API token): create a wrangler config for `apps/web/edge/worker.js` with `assets = { directory = "../dist", binding = "ASSETS", not_found_handling = "single-page-application" }`, keep the `API` service binding, and swap the KV lookups for `env.ASSETS.fetch(request)`.

## Verification checklist
`GET /api/v1/health` returns `{"ok":true,"database":"ok"}`; `/`, `/pricing`, `/f/<slug>` return 200 with CSP headers; run `node tests/e2e/run.mjs public`.
