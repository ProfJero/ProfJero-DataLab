import { Hono, type Context } from "hono";
import { z } from "zod";
import {
  aiAskSchema,
  aiGenerateFormSchema,
  choiceOptions,
  DISPLAY_TYPES,
  inviteSchema,
  OTHER_OPTION_ID,
  publishIssues,
  reportGenerateSchema,
  uploadSignSchema,
  type AnalyticsFilters,
  type Entitlements,
  type Question,
} from "@datalab/shared";
import type { AppEnv } from "../env";
import { ApiError } from "../lib/errors";
import { db, isConfigured, rateLimit, readJson, recordError } from "../lib/util";
import { Db } from "../lib/supabase";
import { computeAnalytics, computeCrosstab, computeGroupComparison, loadForm, type FormRecord } from "../lib/analytics";
import { AIError, getProvider, type AIProvider } from "../ai/provider";
import { classifySentiment, identifyThemes, runAnalyst } from "../ai/analyst";
import { generateFormDraft } from "../ai/generate";
import { buildReportSections } from "../lib/reports";
import { cloudinaryConfigured, createSignedUpload } from "../lib/cloudinary";
import { emailConfigured, invitationEmail, sendEmail } from "../lib/email";

export const appRoutes = new Hono<AppEnv>();

function parseFilters(c: Context<AppEnv>): AnalyticsFilters {
  const q = c.req.query();
  const iso = (v?: string) => (v && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null);
  return {
    from: iso(q.from),
    to: iso(q.to),
    excludeFlagged: q.excludeFlagged === "true",
    answer: q.answerQuestion && q.answerValue ? { questionId: q.answerQuestion, value: q.answerValue.slice(0, 500) } : null,
  };
}

const filtersSchema = z
  .object({
    from: z.string().datetime({ offset: true }).nullish(),
    to: z.string().datetime({ offset: true }).nullish(),
    excludeFlagged: z.boolean().optional(),
    answer: z.object({ questionId: z.string().uuid(), value: z.string().max(500) }).nullish(),
  })
  .optional();

async function entitlements(d: Db, workspaceId: string): Promise<Entitlements> {
  return d.rpc<Entitlements>("workspace_entitlements", { p_workspace_id: workspaceId });
}

async function myRole(d: Db, workspaceId: string, userId: string): Promise<string | null> {
  const rows = await d.select<{ role: string }[]>("workspace_members", `select=role&workspace_id=eq.${workspaceId}&user_id=eq.${userId}`);
  return rows[0]?.role ?? null;
}

const RANK: Record<string, number> = { viewer: 1, analyst: 2, editor: 3, admin: 4, owner: 5 };
function requireRole(role: string | null, min: keyof typeof RANK) {
  if (!role || RANK[role] < RANK[min]) throw new ApiError(403, "forbidden", "You do not have permission to do that.");
}

/* ------------------------------------------------------------------ capabilities */

appRoutes.get("/config", async (c) => {
  return c.json({
    ai: { configured: !!getProvider(c.env), provider: getProvider(c.env)?.name ?? null },
    uploads: { configured: cloudinaryConfigured(c.env) },
    email: { configured: emailConfigured(c.env) },
    payments: { configured: c.env.PAYMENT_PROVIDER === "paystack" && isConfigured(c.env.PAYSTACK_SECRET_KEY), provider: c.env.PAYMENT_PROVIDER ?? "none" },
  });
});

/* ------------------------------------------------------------------ forms */

appRoutes.post("/forms/:id/publish", async (c) => {
  const d = db(c);
  const form = await loadForm(d, c.req.param("id"));
  const issues = publishIssues(form.definition);
  if (issues.length) return c.json({ error: { code: "publish_blocked", message: "Fix these issues before publishing.", details: issues } }, 422);
  const out = await d.rpc<{ status: string }>("set_form_status", { p_form_id: form.id, p_status: "published" });
  return c.json(out);
});

/* ------------------------------------------------------------------ analytics */

appRoutes.get("/forms/:id/analytics", async (c) => {
  const bundle = await computeAnalytics(db(c), c.req.param("id"), parseFilters(c));
  return c.json({ overview: bundle.overview, completionRate: bundle.completionRate, summaries: bundle.summaries, formTitle: bundle.form.definition.title });
});

const crosstabSchema = z.object({ rowQuestion: z.string().uuid(), colQuestion: z.string().uuid(), filters: filtersSchema });
appRoutes.post("/forms/:id/crosstab", async (c) => {
  const body = crosstabSchema.parse(await readJson(c, 8192));
  const d = db(c);
  const form = await loadForm(d, c.req.param("id"));
  const e = await entitlements(d, form.workspaceId);
  if (!e.features.crosstab) throw new ApiError(402, "plan_feature", "Cross-tabulation is available on the Research and Organisation plans.", { feature: "crosstab" });
  return c.json(await computeCrosstab(d, form, body.rowQuestion, body.colQuestion, body.filters ?? undefined));
});

const compareSchema = z.object({ groupQuestion: z.string().uuid(), valueQuestion: z.string().uuid(), filters: filtersSchema });
appRoutes.post("/forms/:id/compare", async (c) => {
  const body = compareSchema.parse(await readJson(c, 8192));
  const d = db(c);
  const form = await loadForm(d, c.req.param("id"));
  const e = await entitlements(d, form.workspaceId);
  if (!e.features.crosstab) throw new ApiError(402, "plan_feature", "Group comparison is available on the Research and Organisation plans.", { feature: "crosstab" });
  return c.json(await computeGroupComparison(d, form, body.groupQuestion, body.valueQuestion, body.filters ?? undefined));
});

/* ------------------------------------------------------------------ AI */

interface AiGate {
  provider: AIProvider;
  workspaceId: string;
  cost: number;
}

async function aiGate(c: Context<AppEnv>, workspaceId: string, feature: string, form?: FormRecord): Promise<AiGate> {
  const provider = getProvider(c.env);
  if (!provider) throw new ApiError(503, "ai_not_configured", "AI analysis is not configured on this platform yet. An administrator needs to add an AI provider.");
  const d = db(c);
  const user = c.get("user");
  await rateLimit(c.env, `ai:${user.id}`, 20, 60);
  const [e, settings, ws, role] = await Promise.all([
    entitlements(d, workspaceId),
    d.select<{ key: string; value: unknown }[]>("platform_settings", "select=key,value&key=in.(ai.global_enabled,ai.credit_costs)"),
    d.select<{ ai_enabled: boolean }[]>("workspaces", `select=ai_enabled&id=eq.${workspaceId}`),
    myRole(d, workspaceId, user.id),
  ]);
  requireRole(role, "analyst");
  if (settings.find((s) => s.key === "ai.global_enabled")?.value === false) throw new ApiError(503, "ai_disabled", "AI features are temporarily disabled by the platform administrator.");
  if (ws[0] && !ws[0].ai_enabled) throw new ApiError(403, "ai_disabled_workspace", "AI analysis is turned off for this workspace. An admin can enable it in workspace settings.");
  if (form && form.publication.aiAnalysisEnabled === false) throw new ApiError(403, "ai_disabled_form", "AI analysis is turned off for this form.");
  if (!e.features.ai_analyst) throw new ApiError(402, "plan_feature", "The AI Data Analyst is not included in your plan.", { feature: "ai_analyst" });
  const costs = (settings.find((s) => s.key === "ai.credit_costs")?.value ?? {}) as Record<string, number>;
  const cost = Math.max(0, Number(costs[feature] ?? 1));
  const limit = e.limits.ai_credits_per_month;
  if (limit !== null && limit !== undefined && (e.usage.ai_credits_per_month ?? 0) + cost > limit) {
    throw new ApiError(402, "plan_limit", `Your workspace has used its ${limit} AI credits for this month. Upgrade or wait until next month.`, { limit: "ai_credits_per_month" });
  }
  return { provider, workspaceId, cost };
}

async function recordAi(c: Context<AppEnv>, g: AiGate, feature: string, usage: { tokensIn: number; tokensOut: number; model: string } | null, error?: string) {
  await new Db(c.env)
    .rpc("record_ai_usage", {
      p_gateway: c.env.GATEWAY_KEY,
      p_workspace_id: g.workspaceId,
      p_user_id: c.get("user").id,
      p_feature: feature,
      p_provider: g.provider.name,
      p_model: usage?.model ?? g.provider.model,
      p_tokens_in: usage?.tokensIn ?? 0,
      p_tokens_out: usage?.tokensOut ?? 0,
      p_credits: error ? 0 : g.cost,
      p_success: !error,
      p_error_code: error ?? null,
    })
    .catch((e) => console.error("record_ai_usage failed", e));
}

function aiFailure(e: unknown): ApiError {
  if (e instanceof AIError) {
    const status = e.code === "rate_limited" ? 429 : e.code === "context_too_large" ? 413 : 502;
    return new ApiError(status, `ai_${e.code}`, e.message);
  }
  return e instanceof ApiError ? e : new ApiError(500, "ai_failed", "The analysis could not be completed.");
}

async function withAi<T extends { usage: { tokensIn: number; tokensOut: number; model: string } }>(c: Context<AppEnv>, g: AiGate, feature: string, fn: () => Promise<T>): Promise<T> {
  try {
    const out = await fn();
    await recordAi(c, g, feature, out.usage);
    return out;
  } catch (e) {
    const code = e instanceof AIError ? e.code : "internal";
    await recordAi(c, g, feature, null, code);
    if (!(e instanceof AIError)) await recordError(c.env, "ai", code, String((e as Error)?.message ?? e), { feature });
    throw aiFailure(e);
  }
}

appRoutes.post("/forms/:id/ai/ask", async (c) => {
  const body = aiAskSchema.parse(await readJson(c, 16384));
  const d = db(c);
  const user = c.get("user");
  const form = await loadForm(d, c.req.param("id"));
  const g = await aiGate(c, form.workspaceId, "analyst_question", form);
  let conversationId = body.conversationId;
  let history: { role: "user" | "assistant"; content: string }[] = [];
  if (conversationId) {
    const conv = await d.select<{ id: string }[]>("ai_conversations", `select=id&id=eq.${conversationId}&form_id=eq.${form.id}`);
    if (!conv.length) throw new ApiError(404, "not_found", "Conversation not found.");
    const msgs = await d.select<{ role: "user" | "assistant"; content: string; status: string }[]>("ai_messages", `select=role,content,status&conversation_id=eq.${conversationId}&order=created_at.desc&limit=6`);
    history = msgs.filter((m) => m.status === "ok").reverse().map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
  } else {
    const created = await d.insert<{ id: string }[]>("ai_conversations", { workspace_id: form.workspaceId, form_id: form.id, user_id: user.id, title: body.question.slice(0, 120) });
    conversationId = created[0].id;
  }
  await d.insert("ai_messages", { conversation_id: conversationId, role: "user", content: body.question }, false);
  try {
    const result = await withAi(c, g, "analyst_question", () => runAnalyst(g.provider, d, form.id, body.question, history));
    const saved = await d.insert<{ id: string; created_at: string }[]>("ai_messages", { conversation_id: conversationId, role: "assistant", content: result.answer.slice(0, 49000), grounding: result.grounding, model: result.usage.model });
    await d.update("ai_conversations", `id=eq.${conversationId}`, { updated_at: new Date().toISOString() });
    return c.json({ conversationId, message: { id: saved[0].id, role: "assistant", content: result.answer, grounding: result.grounding, created_at: saved[0].created_at } });
  } catch (e) {
    const err = aiFailure(e);
    await d.insert("ai_messages", { conversation_id: conversationId, role: "assistant", content: err.message, status: "error" }, false).catch(() => undefined);
    throw err;
  }
});

const insightSchema = z.object({ mode: z.enum(["summary", "executive", "recommendations"]) });
appRoutes.post("/forms/:id/ai/insight", async (c) => {
  const { mode } = insightSchema.parse(await readJson(c, 1024));
  const d = db(c);
  const form = await loadForm(d, c.req.param("id"));
  const g = await aiGate(c, form.workspaceId, "summary", form);
  const result = await withAi(c, g, "summary", () => runAnalyst(g.provider, d, form.id, "", [], mode));
  return c.json({ content: result.answer, grounding: result.grounding });
});

const textQSchema = z.object({ questionId: z.string().uuid() });
async function textAnswers(d: Db, form: FormRecord, questionId: string, limit: number): Promise<{ q: Question; answers: string[] }> {
  const q = form.definition.questions.find((x) => x.id === questionId);
  if (!q || !["short_text", "long_text"].includes(q.type)) throw new ApiError(422, "invalid_question", "Choose a text question.");
  const rows = await d.rpc<{ answer: string }[]>("analytics_text_answers", { p_form_id: form.id, p_question_id: q.id, p_filters: {}, p_limit: limit, p_offset: 0 });
  return { q, answers: rows.map((r) => r.answer) };
}

appRoutes.post("/forms/:id/ai/themes", async (c) => {
  const { questionId } = textQSchema.parse(await readJson(c, 1024));
  const d = db(c);
  const form = await loadForm(d, c.req.param("id"));
  const g = await aiGate(c, form.workspaceId, "themes", form);
  const { q, answers } = await textAnswers(d, form, questionId, 300);
  if (!answers.length) throw new ApiError(422, "no_data", "There are no written answers to analyse yet.");
  return c.json(await withAi(c, g, "themes", () => identifyThemes(g.provider, answers, q.title)));
});

appRoutes.post("/forms/:id/ai/sentiment", async (c) => {
  const { questionId } = textQSchema.parse(await readJson(c, 1024));
  const d = db(c);
  const form = await loadForm(d, c.req.param("id"));
  const g = await aiGate(c, form.workspaceId, "themes", form);
  const { q, answers } = await textAnswers(d, form, questionId, 120);
  if (!answers.length) throw new ApiError(422, "no_data", "There are no written answers to analyse yet.");
  return c.json(await withAi(c, g, "sentiment", () => classifySentiment(g.provider, answers, q.title)));
});

appRoutes.post("/ai/generate-form", async (c) => {
  const body = aiGenerateFormSchema.parse(await readJson(c, 8192));
  const g = await aiGate(c, body.workspaceId, "generate_form");
  const out = await withAi(c, g, "generate_form", () => generateFormDraft(g.provider, body.prompt));
  return c.json({ definition: out.definition });
});

/* ------------------------------------------------------------------ reports */

appRoutes.post("/reports/generate", async (c) => {
  const body = reportGenerateSchema.parse(await readJson(c, 32768));
  const d = db(c);
  const user = c.get("user");
  const form = await loadForm(d, body.formId);
  const [e, role, wsRows] = await Promise.all([entitlements(d, form.workspaceId), myRole(d, form.workspaceId, user.id), d.select<{ name: string }[]>("workspaces", `select=name&id=eq.${form.workspaceId}`)]);
  requireRole(role, "analyst");
  if (!e.features.reports) throw new ApiError(402, "plan_feature", "Reports are not included in your plan.", { feature: "reports" });
  if (["research_report", "comparative_report", "ai_findings"].includes(body.type) && !e.features.advanced_reports) throw new ApiError(402, "plan_feature", "This report type is available on the Research and Organisation plans.", { feature: "advanced_reports" });
  const lim = e.limits.reports;
  if (lim !== null && lim !== undefined && (e.usage.reports ?? 0) >= lim) throw new ApiError(402, "plan_limit", `Your plan allows ${lim} report(s). Delete a report or upgrade.`, { limit: "reports" });

  const bundle = await computeAnalytics(d, form.id, undefined, form);
  const extras: Parameters<typeof buildReportSections>[3] = {};
  if (body.type === "comparative_report") {
    if (!body.compareQuestionId) throw new ApiError(422, "invalid_request", "Choose a question to compare groups by.");
    const others = form.definition.questions.filter((q) => q.id !== body.compareQuestionId && ["single_choice", "dropdown", "yes_no", "multiple_choice"].includes(q.type));
    const numeric = form.definition.questions.find((q) => ["rating", "linear_scale", "number"].includes(q.type));
    if (others[0]) extras.crosstab = await computeCrosstab(d, form, body.compareQuestionId, others[0].id);
    if (numeric) extras.comparison = await computeGroupComparison(d, form, body.compareQuestionId, numeric.id).catch(() => undefined);
  }
  const sections = buildReportSections(body.type, bundle, { description: body.description, objectives: body.objectives, methodology: body.methodology, organisation: wsRows[0]?.name ?? "" }, extras);

  if (body.useAi || body.type === "ai_findings") {
    const g = await aiGate(c, form.workspaceId, "report_ai", form);
    const mode = body.type === "executive_summary" ? "executive" : "summary";
    const ai = await withAi(c, g, "report_ai", () => runAnalyst(g.provider, d, form.id, "", [], mode));
    const rec = await withAi(c, g, "report_ai", () => runAnalyst(g.provider, d, form.id, "", [], "recommendations"));
    const note = (u: string[]) => (u.length ? `\n\n> ⚠️ Review before sharing: these figures could not be matched to calculated results: ${u.join(", ")}.` : "");
    sections.splice(sections.findIndex((s) => s.title === "Key findings") + 1, 0, { kind: "markdown", title: "AI-assisted analysis", body: ai.answer + note(ai.grounding.unverifiedFigures), data: { grounding: ai.grounding }, source: "ai" });
    const ri = sections.findIndex((s) => s.title === "Recommendations");
    if (ri >= 0) sections[ri] = { ...sections[ri], body: rec.answer + note(rec.grounding.unverifiedFigures), source: "ai", data: { grounding: rec.grounding } };
  }

  const report = await d.insert<{ id: string }[]>("reports", {
    workspace_id: form.workspaceId,
    form_id: form.id,
    created_by: user.id,
    title: body.title,
    type: body.type,
    meta: { description: body.description ?? "", objectives: body.objectives ?? "", methodology: body.methodology ?? "", organisation: wsRows[0]?.name ?? "", formTitle: form.definition.title },
    sample_size: bundle.overview.completed,
    generated_at: new Date().toISOString(),
  });
  await d.insert("report_sections", sections.map((s, i) => ({ report_id: report[0].id, position: i, kind: s.kind, title: s.title.slice(0, 300), body: s.body, data: s.data, source: s.source })), false);
  return c.json({ id: report[0].id }, 201);
});

/* ------------------------------------------------------------------ exports */

function formatAnswer(q: Question, v: unknown, other?: string): string {
  if (v === undefined || v === null) return "";
  const opts = new Map(choiceOptions(q).map((o) => [o.id, o.label]));
  if (Array.isArray(v)) {
    if (q.type === "file_upload") return (v as { url: string }[]).map((f) => f.url).join(" | ");
    return v.map((x) => (x === OTHER_OPTION_ID && other ? `Other: ${other}` : (opts.get(String(x)) ?? String(x)))).join("; ");
  }
  if (typeof v === "object") return Object.entries(v as Record<string, number>).map(([k, n]) => `${q.config.rows?.find((r) => r.id === k)?.label ?? k}: ${q.config.scaleLabels?.[n - 1] ?? n}`).join("; ");
  if (opts.size && typeof v === "string") return v === OTHER_OPTION_ID && other ? `Other: ${other}` : (opts.get(v) ?? v);
  return String(v);
}

function csvCell(s: string): string {
  // Neutralise spreadsheet formula injection, then quote.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

appRoutes.get("/forms/:id/export", async (c) => {
  const format = c.req.query("format") === "json" ? "json" : "csv";
  const d = db(c);
  const form = await loadForm(d, c.req.param("id"));
  const e = await entitlements(d, form.workspaceId);
  if (format === "json" && !e.features.xlsx_export) throw new ApiError(402, "plan_feature", "Excel export is available on paid plans.", { feature: "xlsx_export" });
  const lim = e.limits.exports_per_month;
  if (lim !== null && lim !== undefined && (e.usage.exports_per_month ?? 0) >= lim) throw new ApiError(402, "plan_limit", `Your workspace has reached its ${lim} exports this month.`, { limit: "exports_per_month" });
  await rateLimit(c.env, `export:${c.get("user").id}`, 20, 3600);
  const filters = parseFilters(c);
  const questions = form.definition.questions.filter((q) => !DISPLAY_TYPES.includes(q.type));
  const header = ["Response ID", "Submitted at", "Duration (s)", "Review status", "Flagged", ...questions.map((q) => q.title || "Untitled")];
  const rows: string[][] = [];
  let after: string | null = null;
  for (let page = 0; page < 200; page++) {
    const batch: { id: string; submitted_at: string; duration_seconds: number | null; review_status: string; is_flagged: boolean; answers: Record<string, unknown>; other: Record<string, string> }[] = await d.rpc("export_responses_page", {
      p_form_id: form.id,
      p_filters: { ...(filters.from ? { from: filters.from } : {}), ...(filters.to ? { to: filters.to } : {}), ...(filters.answer ? { answer: filters.answer } : {}) },
      p_after: after,
      p_limit: 1000,
    });
    for (const r of batch) rows.push([r.id, r.submitted_at, r.duration_seconds === null ? "" : String(r.duration_seconds), r.review_status, r.is_flagged ? "yes" : "no", ...questions.map((q) => formatAnswer(q, r.answers[q.id], r.other[q.id]))]);
    if (batch.length < 1000) break;
    after = batch[batch.length - 1].submitted_at;
  }
  await new Db(c.env).rpc("record_usage", { p_gateway: c.env.GATEWAY_KEY, p_workspace_id: form.workspaceId, p_metric: "exports", p_qty: 1 }).catch(() => undefined);
  const name = (form.definition.title || "responses").replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 60);
  if (format === "json") return c.json({ title: form.definition.title, header, rows });
  const csv = "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"`, "Cache-Control": "no-store" } });
});

/* ------------------------------------------------------------------ uploads */

appRoutes.post("/uploads/sign", async (c) => {
  if (!cloudinaryConfigured(c.env)) throw new ApiError(503, "uploads_unavailable", "Image uploads are not configured yet. An administrator needs to add Cloudinary credentials.");
  const body = uploadSignSchema.parse(await readJson(c, 4096));
  const user = c.get("user");
  await rateLimit(c.env, `upload:${user.id}`, 60, 3600);
  let folder: string;
  if (body.purpose === "avatar") folder = `datalab/users/${user.id}/avatar`;
  else {
    if (!body.workspaceId) throw new ApiError(422, "invalid_request", "workspaceId is required.");
    requireRole(await myRole(db(c), body.workspaceId, user.id), body.purpose === "workspace_logo" ? "admin" : "editor");
    folder = `datalab/workspaces/${body.workspaceId}/${body.purpose}`;
  }
  if (body.fileSize && body.fileSize > 5 * 1024 * 1024) throw new ApiError(422, "invalid_upload", "Images must be 5 MB or smaller.");
  return c.json(await createSignedUpload(c.env, { folder, allowedFormats: ["jpg", "jpeg", "png", "webp", "gif", "svg"], maxBytes: 5 * 1024 * 1024, resourceType: "image" }));
});

/* ------------------------------------------------------------------ team */

appRoutes.post("/workspaces/:id/invitations", async (c) => {
  const body = inviteSchema.parse(await readJson(c, 2048));
  const d = db(c);
  const user = c.get("user");
  await rateLimit(c.env, `invite:${user.id}`, 30, 3600);
  const inv = await d.rpc<{ id: string; token: string; workspaceName: string }>("create_invitation", { p_workspace_id: c.req.param("id"), p_email: body.email, p_role: body.role });
  const url = `${c.env.APP_BASE_URL}/invite/${inv.token}`;
  const profile = await d.select<{ full_name: string | null }[]>("profiles", `select=full_name&id=eq.${user.id}`);
  const msg = invitationEmail(inv.workspaceName, body.role, url, profile[0]?.full_name || user.email);
  const sent = await sendEmail(c.env, { ...msg, to: body.email });
  return c.json({ id: inv.id, inviteUrl: url, emailed: sent.sent, emailStatus: sent.reason ?? "sent" }, 201);
});
