import { Hono } from "hono";
import { z } from "zod";
import { MAX_SUBMISSION_BYTES, submissionPayloadSchema, validateSubmission, type FileRef, type FormDefinition } from "@datalab/shared";
import type { AppEnv } from "../env";
import { Db, verifyUser } from "../lib/supabase";
import { ApiError } from "../lib/errors";
import { clientIp, rateLimit, readJson, sha256Hex } from "../lib/util";
import { cloudinaryConfigured, createSignedUpload, fetchResource } from "../lib/cloudinary";

interface PublicForm {
  id: string;
  slug: string;
  version: number;
  available: boolean;
  unavailableReason: string | null;
  requireAuth: boolean;
  honeypot: boolean;
  collectRespondentEmail: boolean;
  definition: FormDefinition;
}

async function getPublicForm(db: Db, slug: string): Promise<PublicForm> {
  if (!/^[a-zA-Z0-9_-]{6,40}$/.test(slug)) throw new ApiError(404, "not_found", "This form does not exist or is no longer available.");
  const f = await db.rpc<PublicForm | null>("get_public_form", { p_slug: slug });
  if (!f) throw new ApiError(404, "not_found", "This form does not exist or is no longer available.");
  return f;
}

export const publicRoutes = new Hono<AppEnv>();

publicRoutes.get("/forms/:slug", async (c) => {
  const f = await getPublicForm(new Db(c.env), c.req.param("slug"));
  c.header("Cache-Control", "no-store");
  return c.json(f);
});

publicRoutes.post("/forms/:slug/submit", async (c) => {
  const ip = clientIp(c);
  const slug = c.req.param("slug");
  await rateLimit(c.env, `submit:${ip}:${slug}`, 10, 60);
  await rateLimit(c.env, `submit:${ip}`, 120, 3600);
  const raw = await readJson<unknown>(c, MAX_SUBMISSION_BYTES);
  const parsed = submissionPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    // Honeypot field filled → silently accept without storing (do not teach bots).
    if (typeof (raw as { website?: unknown })?.website === "string" && (raw as { website: string }).website.length > 0) return c.json({ ok: true });
    throw new ApiError(400, "invalid_submission", "The submission could not be read.");
  }
  const body = parsed.data;
  const db = new Db(c.env);
  const form = await getPublicForm(db, slug);
  if (!form.available) throw new ApiError(410, form.unavailableReason ?? "closed", form.unavailableReason === "limit_reached" ? "This form has reached its response limit." : "This form is closed and no longer accepts responses.");
  if (form.honeypot && body.startedAt && Date.now() - body.startedAt < 1500) throw new ApiError(429, "too_fast", "That was quick! Please review your answers and submit again.");

  let respondentUserId: string | null = null;
  const authz = c.req.header("authorization");
  if (authz?.startsWith("Bearer ")) {
    const u = await verifyUser(c.env, authz.slice(7));
    respondentUserId = u?.id ?? null;
  }
  if (form.requireAuth && !respondentUserId) throw new ApiError(401, "auth_required", "Please sign in to respond to this form.");

  const result = validateSubmission(form.definition, body.answers, body.otherText ?? {});
  if (!result.ok) return c.json({ error: { code: "validation_failed", message: "Please correct the highlighted answers.", details: result.errors } }, 422);

  // Verify uploaded files with Cloudinary — never trust client-reported size or type.
  for (const q of form.definition.questions.filter((x) => x.type === "file_upload")) {
    const files = result.answers[q.id] as FileRef[] | undefined;
    if (!files?.length) continue;
    if (!cloudinaryConfigured(c.env)) throw new ApiError(503, "uploads_unavailable", "File uploads are not available right now.");
    const verified: FileRef[] = [];
    for (const f of files) {
      if (!f.publicId.startsWith(`datalab/responses/${form.id}/${q.id}/`)) throw new ApiError(422, "invalid_upload", "An uploaded file could not be verified.");
      const r = await fetchResource(c.env, f.publicId);
      if (!r) throw new ApiError(422, "invalid_upload", "An uploaded file could not be found. Please upload it again.");
      const allowed = (q.config.allowedFileTypes ?? []).map((t) => t.toLowerCase());
      const fmt = (r.format ?? f.name?.split(".").pop() ?? "").toLowerCase();
      if (allowed.length && !allowed.includes(fmt)) throw new ApiError(422, "invalid_upload", `Allowed file types: ${allowed.join(", ")}.`);
      if (r.bytes > (q.config.maxFileSizeMb ?? 5) * 1024 * 1024) throw new ApiError(422, "invalid_upload", "An uploaded file is too large.");
      verified.push({ publicId: r.public_id, url: r.secure_url, bytes: r.bytes, format: fmt, name: f.name?.slice(0, 300) });
    }
    result.answers[q.id] = verified;
  }

  const ua = c.req.header("user-agent") ?? "";
  const fingerprint = await sha256Hex(`${c.env.FINGERPRINT_SALT ?? c.env.GATEWAY_KEY}|${form.id}|${ip}|${ua}`);
  let referrerHost: string | null = null;
  try {
    referrerHost = c.req.header("referer") ? new URL(c.req.header("referer")!).host : null;
  } catch {
    referrerHost = null;
  }
  const meta = { device: /mobile|android|iphone/i.test(ua) ? "mobile" : /ipad|tablet/i.test(ua) ? "tablet" : "desktop", referrerHost, country: (c.req.raw as { cf?: { country?: string } }).cf?.country ?? null };
  const out = await db.rpc<{ submissionId: string }>("submit_response", {
    p_gateway: c.env.GATEWAY_KEY,
    p_form_id: form.id,
    p_answers: result.answers,
    p_other: result.otherText,
    p_meta: meta,
    p_fingerprint: fingerprint,
    p_respondent_user: respondentUserId,
    p_respondent_email: body.respondentEmail ?? null,
    p_started_at: body.startedAt ? new Date(body.startedAt).toISOString() : null,
    p_form_version: form.version,
  });
  return c.json({ ok: true, submissionId: out.submissionId }, 201);
});

const uploadSchema = z.object({ questionId: z.string().uuid(), fileName: z.string().max(300), fileSize: z.number().int().positive() });

publicRoutes.post("/forms/:slug/upload", async (c) => {
  const ip = clientIp(c);
  await rateLimit(c.env, `upload:${ip}`, 30, 3600);
  if (!cloudinaryConfigured(c.env)) throw new ApiError(503, "uploads_unavailable", "File uploads are not available for this form right now.");
  const body = uploadSchema.safeParse(await readJson(c, 4096));
  if (!body.success) throw new ApiError(400, "invalid_request", "Invalid upload request.");
  const form = await getPublicForm(new Db(c.env), c.req.param("slug"));
  if (!form.available) throw new ApiError(410, "closed", "This form is closed.");
  const q = form.definition.questions.find((x) => x.id === body.data.questionId && x.type === "file_upload");
  if (!q) throw new ApiError(404, "not_found", "Upload question not found.");
  const allowed = (q.config.allowedFileTypes ?? ["pdf", "jpg", "png"]).map((t) => t.toLowerCase().replace(/^\./, ""));
  const ext = body.data.fileName.split(".").pop()?.toLowerCase() ?? "";
  if (!allowed.includes(ext)) throw new ApiError(422, "invalid_upload", `Allowed file types: ${allowed.join(", ")}.`);
  const maxBytes = (q.config.maxFileSizeMb ?? 5) * 1024 * 1024;
  if (body.data.fileSize > maxBytes) throw new ApiError(422, "invalid_upload", `Files must be ${q.config.maxFileSizeMb ?? 5} MB or smaller.`);
  const signed = await createSignedUpload(c.env, { folder: `datalab/responses/${form.id}/${q.id}`, allowedFormats: allowed, maxBytes, resourceType: "auto" });
  return c.json(signed);
});

const abuseSchema = z.object({
  slug: z.string().regex(/^[a-zA-Z0-9_-]{6,40}$/),
  reason: z.enum(["phishing", "spam", "harassment", "illegal", "privacy", "other"]),
  details: z.string().max(4000).optional(),
  email: z.string().email().max(320).optional().or(z.literal("")),
});

publicRoutes.post("/abuse-reports", async (c) => {
  await rateLimit(c.env, `abuse:${clientIp(c)}`, 5, 3600);
  const body = abuseSchema.safeParse(await readJson(c, 8192));
  if (!body.success) throw new ApiError(422, "invalid_request", "Please choose a reason for your report.");
  await new Db(c.env).rpc("submit_abuse_report", { p_gateway: c.env.GATEWAY_KEY, p_slug: body.data.slug, p_reason: body.data.reason, p_details: body.data.details ?? null, p_email: body.data.email || null });
  return c.json({ ok: true }, 201);
});
