# Security

## Controls implemented
| Area | Implementation |
|---|---|
| Authentication | Supabase Auth (email + password, email verification, PKCE). The API verifies tokens with Supabase Auth on every request (60 s cache). |
| Authorisation | RLS on all 28 public tables; `SECURITY DEFINER` RPCs with explicit role checks and `search_path = ''`; admin RPCs check `platform_admins` in the database. UI guards are convenience only. |
| Tenant isolation / IDOR | Every query is scoped by RLS; child rows inherit `workspace_id` by trigger; IDs from other workspaces return "not found". Verified by `supabase/tests/rls_security.test.sql`. |
| No privileged keys | No service-role key is used anywhere. Gateway-only functions require a secret held by the API Worker (`GATEWAY_KEY`) and stored in `private.app_secrets` (constant-time comparison). |
| Input validation | Zod on every API body; shared answer validator (types, ranges, lengths, options, files, conditional visibility); SQL constraints and length limits. |
| Public endpoint abuse | Database-backed rate limiting, honeypot field, minimum completion time, 256 KB payload cap, optional one-response-per-device (salted hash, no raw IP stored), response limits and close dates enforced atomically. |
| Output encoding / XSS | React escaping; a custom Markdown renderer builds elements (no `dangerouslySetInnerHTML`); links restricted to http(s) with `rel=noopener noreferrer nofollow`. |
| CSRF | Bearer tokens in headers (no cookies) → not CSRF-able; CORS allow-list for private routes. |
| Security headers | CSP (`script-src 'self'`, no inline scripts), HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, frame protection (forms under `/f/` are embeddable). API responses use `default-src 'none'`. |
| Uploads | Signed Cloudinary uploads restricted to folder and allowed formats; respondent files re-verified via the Admin API (real size/format) before being stored; image assets registered only with editor role and matching folder prefix. |
| Exports | CSV cells beginning with `= + - @` are neutralised; XLSX uses inline strings only. |
| AI safety | Controlled operations instead of SQL; respondent text wrapped as untrusted data; PII redaction; contact questions excluded; workspace/form opt-out; usage limits; unverified-figure detection. |
| Payments | Webhook HMAC verification and server-side verification of amount + currency before activating a plan. |
| Audit | `audit_logs` records workspace and platform actions (role changes, plan changes, suspensions, deletions…). |
| Secrets | Server secrets are Worker secrets; only public values (`VITE_*`) reach the browser; `.env`/`.dev.vars` are git-ignored. |
| Errors | Database errors are mapped to safe messages; unexpected errors are logged to `error_events` without request bodies or tokens. |

## Supabase advisor notes
The security advisor reports "SECURITY DEFINER function executable by anon/authenticated" for the intended RPC surface. Each function performs its own authorisation (role check, platform-admin check or gateway key); this is deliberate.

## Recommended follow-ups
- Set **Site URL** and **Redirect URLs** in Supabase Auth (see DEPLOYMENT.md).
- Configure a custom SMTP provider in Supabase Auth for production email volume.
- Enable leaked-password protection and MFA options in Supabase Auth settings.
- Run `pnpm audit` regularly and keep Wrangler/Vite up to date.
- Have the privacy policy and terms reviewed by a lawyer before launch (they are not certified legal documents).
