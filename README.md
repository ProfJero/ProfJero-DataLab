# ProfJero DataLab

**Smarter Surveys. Better Decisions.** — a product of ProfJero Digital Studio.

ProfJero DataLab is a data collection and intelligence platform: **Create. Collect. Analyse. Understand.**
Build forms with conditional logic, collect responses on any device, analyse them with verified statistics,
cross-tabulation and an AI Data Analyst, and export professional reports.

| | |
|---|---|
| Web app | https://profjero-datalab.profjerodigitalstudio.workers.dev |
| API | https://profjero-datalab-api.profjerodigitalstudio.workers.dev (also served same-origin at `/api`) |
| Database / Auth | Supabase project `nxbduxtrngxaxmrebjic` (eu-west-2) |

## Repository layout

```
apps/web          React + TypeScript + Vite SPA (Tailwind, Radix/shadcn-style UI, TanStack Query/Table, Recharts, dnd-kit)
apps/web/edge     Edge Worker: serves the SPA, security headers, SEO metadata, /api proxy (service binding)
apps/api          Cloudflare Worker (Hono): public submissions, analytics, AI, reports, exports, uploads, billing
packages/shared   Form schema, conditional logic, validation, statistics, templates, plans (used by web + API)
supabase/         Versioned SQL migrations, RLS test suite, optional seeds
tests/e2e         Playwright end-to-end suite (runs against a deployed environment)
docs/             Architecture, database, API, security, deployment, environment, testing, features
```

## Quick start (local)

```bash
pnpm install
```

```bash
cp apps/web/.env.example apps/web/.env.local   # fill in public Supabase URL + anon key
```

```bash
cp apps/api/.dev.vars.example apps/api/.dev.vars   # fill in server secrets
```

```bash
pnpm --filter @datalab/api dev     # API on http://127.0.0.1:8787
```

```bash
pnpm --filter @datalab/web dev     # web on http://localhost:5173 (proxies /api to the local API)
```

## Tests

```bash
pnpm --filter @datalab/shared test   # statistics, logic, validation, templates (33)
```

```bash
pnpm --filter @datalab/api test      # API routes, AI grounding, provider failures (26)
```

```bash
PGHOST=... PGUSER=postgres pnpm test:rls   # migrations + RLS/tenant isolation on local Postgres (89)
```

```bash
E2E_OWNER_EMAIL=... E2E_PASSWORD=... node tests/e2e/run.mjs main   # end-to-end workflow (17)
```

See [docs/TESTING.md](docs/TESTING.md) for details and the latest results.

## Documentation

[Architecture](docs/ARCHITECTURE.md) · [Database](docs/DATABASE.md) · [API](docs/API.md) · [Security](docs/SECURITY.md) ·
[Deployment](docs/DEPLOYMENT.md) · [Environment](docs/ENVIRONMENT.md) · [Testing](docs/TESTING.md) · [Product features](docs/PRODUCT_FEATURES.md)

## Integrations status

| Integration | Status |
|---|---|
| Supabase (Postgres, Auth, RLS) | ✅ Configured and verified |
| Cloudflare Workers (web + API) | ✅ Deployed and verified |
| Cloudinary (media) | ⏳ Implemented; needs `CLOUDINARY_*` credentials |
| AI provider (OpenAI / Anthropic / OpenAI-compatible) | ⏳ Implemented; needs `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL` |
| Email (Resend) | ⏳ Implemented; needs `EMAIL_API_KEY`, `EMAIL_FROM` (invites fall back to copyable links) |
| Payments (Paystack) | ⏳ Implemented; needs `PAYSTACK_SECRET_KEY` (admins can assign plans manually meanwhile) |
