# Environment variables

## Frontend (`apps/web`) — public only
Everything prefixed `VITE_` is bundled into JavaScript that browsers download. **Never put secrets here.**

| Variable | Example | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://nxbduxtrngxaxmrebjic.supabase.co` | Public |
| `VITE_SUPABASE_ANON_KEY` | `sb_publishable_…` | Public publishable key (RLS protects data) |
| `VITE_API_BASE_URL` | `/api` | Same-origin through the edge Worker, or the API URL |
| `VITE_APP_URL` | `https://profjero-datalab.profjerodigitalstudio.workers.dev` | Used for auth redirect links |

Production values are committed in `apps/web/.env.production` (all public).

## API Worker (`apps/api`)
Plain variables (`wrangler.toml [vars]`):

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `APP_BASE_URL` | Web app URL (links in emails, payment callbacks) |
| `ALLOWED_ORIGINS` | Comma-separated CORS allow-list |
| `AI_PROVIDER` | `openai`, `anthropic`, `openai_compatible` or `none` |
| `AI_MODEL` | Model id for the provider |
| `AI_BASE_URL` | Required for `openai_compatible`; optional override otherwise |
| `EMAIL_PROVIDER` | `resend` or `none` |
| `EMAIL_FROM` | Verified sender, e.g. `DataLab <hello@yourdomain>` |
| `PAYMENT_PROVIDER` | `paystack` or `none` |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name |

Secrets (`wrangler secret put NAME`):

| Secret | Required | Purpose |
|---|---|---|
| `SUPABASE_ANON_KEY` | yes | Anon JWT key (sent as `apikey`) |
| `GATEWAY_KEY` | yes | Must equal `private.app_secrets` row `gateway_key` |
| `FINGERPRINT_SALT` | yes | Salt for duplicate-prevention hashes |
| `AI_API_KEY` | for AI | Provider API key |
| `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | for uploads | Signed uploads + Admin API verification |
| `EMAIL_API_KEY` | for email | Resend API key |
| `PAYSTACK_SECRET_KEY` | for payments | Paystack secret key (also used to verify webhooks) |

Rotating the gateway key: generate a new value, update `private.app_secrets` (`update private.app_secrets set value = '…' where name = 'gateway_key'`) and the Worker secret together.

Local development: copy `apps/api/.dev.vars.example` to `apps/api/.dev.vars`.

## Edge Worker (`profjero-datalab`)
| Binding | Type | Purpose |
|---|---|---|
| `SITE` | KV namespace | Release store for built assets |
| `API` | Service binding → `profjero-datalab-api` | Same-origin `/api` proxy |
| `DEPLOY_KEY` | Secret | Authorises `/__deploy/*` uploads |
