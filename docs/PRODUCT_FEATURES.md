# Product features

## Implemented and working end-to-end
- **Accounts:** sign up, sign in, email verification callback, forgot/reset password, onboarding (name, workspace, intended use, organisation type; skippable), profile, password change, data export, account deletion requests, suspension handling.
- **Workspaces & teams:** multiple workspaces per user, switcher, roles (owner, admin, editor, analyst, viewer), invitations with copyable links (+ email when configured), role changes, removal, leaving, ownership transfer, workspace logo, AI opt-out, retention policy, activity log, deletion.
- **Dashboard:** real totals, active/draft forms, 30-day trend with period comparison, most active forms, drafts, recent reports, usage meters, recent activity, quick actions.
- **Form builder:** 19 question types; sections/pages; drag-and-drop (pointer, touch, keyboard); duplicate/delete with undo; inline option editing, paste lists, “Other”; validation settings; conditional visibility and section skip rules in plain language, validated before publishing; autosave with status, retry, conflict detection, undo/redo, local backup restore; form settings (welcome, instructions, thank-you, redirect, layout, progress); theme (accent, background, font, corners); cover/logo images; desktop/mobile preview; import from text; AI drafts (when configured); 20 templates.
- **Publishing:** draft/published/closed/archived; link, WhatsApp/email share, QR code PNG, embed code; close date, response limit, one response per device, require sign-in, respondent email, spam protection, AI permission, closed message.
- **Respondents:** mobile-first single-page or paged forms, progress bar, accessible controls, conditional questions, required/format validation, file uploads (when configured), thank-you screen, closed/limit pages, abuse reporting.
- **Responses:** server-paginated table, search, filters (date, answer, review status), sort, detail drawer, flags and review status with history, bulk actions, deletion with confirmation, CSV and Excel export.
- **Analytics:** completion rate, durations, daily trend, per-question charts and tables (choice, numeric, rating/scale, Likert, text keywords, date, time), outliers, “Other” answers, filters, cross-tabulation with chi-square & Cramér's V, group comparison, print.
- **AI Data Analyst** (requires an AI provider): grounded Q&A with evidence and unverified-figure warnings, conversations, summaries, executive summaries, recommendations, themes with calculated counts, sentiment, AI form drafts, AI report sections; usage tracking and limits.
- **Reports:** six report types built from calculated results; objectives/methodology only if supplied; optional AI sections labelled; inline editing; mark final; print/PDF; results as CSV/XLSX.
- **Plans & billing:** configurable plans/limits/features enforced in the database; usage tracking; Paystack checkout + webhook + verification (when configured); manual plan assignment by admins; payment history.
- **Notifications:** in-app notifications for invitations, acceptance, role/ownership changes, response milestones, response limits, subscription changes, account status; invitation emails via Resend when configured.
- **Platform administration:** overview metrics & charts, users (search, suspend/reactivate), workspaces & plan assignment, plan editor, AI consumption, audit log, abuse reports (close form & resolve), system health (API/DB/errors/table sizes), platform settings.
- **Marketing site:** landing, features, templates, pricing (from the database), about, contact, privacy, terms, 404; SEO titles/descriptions per page, Open Graph, JSON-LD, sitemap, robots, favicon, web manifest.

## Requires configuration (implemented, not yet active)
AI provider · Cloudinary · email provider · Paystack. See ENVIRONMENT.md.

## Known limitations
- PDF export uses the browser's print-to-PDF on a print-optimised layout rather than server-generated PDFs.
- Email notifications are sent for invitations; other notifications are in-app only.
- Response retention is a recorded policy; automatic purging is not scheduled.
- Account deletion is a request processed by a platform admin, not instant self-service.
- Theme analysis and sentiment run on a sample (most recent 300 / 120 answers) and say so.
- Realtime updates are not used; dashboards refresh on navigation and notifications poll every minute.
