import { Hono } from "hono";
import { ZodError } from "zod";
import type { AppEnv } from "./env";
import { ApiError } from "./lib/errors";
import { verifyUser } from "./lib/supabase";
import { recordError } from "./lib/util";
import { publicRoutes } from "./routes/public";
import { appRoutes } from "./routes/app";
import { billingRoutes, paystackWebhook } from "./routes/billing";

export const VERSION = "1.0.0";

const app = new Hono<AppEnv>();

// Request id + security headers on every response.
app.use("*", async (c, next) => {
  c.set("requestId", crypto.randomUUID());
  await next();
  c.header("X-Request-Id", c.get("requestId"));
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("X-Frame-Options", "DENY");
  c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  c.header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
});

// CORS: only the configured app origins. Public form endpoints also allow any origin
// (forms can be embedded), but never with credentials.
app.use("*", async (c, next) => {
  const origin = c.req.header("origin");
  const allowed = (c.env.ALLOWED_ORIGINS ?? c.env.APP_BASE_URL).split(",").map((s) => s.trim()).filter(Boolean);
  const isPublic = c.req.path.startsWith("/v1/public/");
  const allow = origin && (allowed.includes(origin) || isPublic) ? origin : null;
  if (c.req.method === "OPTIONS") {
    if (!allow) return c.body(null, 403);
    return c.body(null, 204, {
      "Access-Control-Allow-Origin": allow,
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Authorization,Content-Type",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    });
  }
  await next();
  if (allow) {
    c.header("Access-Control-Allow-Origin", allow);
    c.header("Vary", "Origin");
    c.header("Access-Control-Expose-Headers", "Content-Disposition,X-Request-Id");
  }
});

app.get("/", (c) => c.json({ name: "ProfJero DataLab API", version: VERSION, docs: "/v1/health" }));
app.get("/v1/health", async (c) => {
  const started = Date.now();
  let database = "unknown";
  try {
    const r = await fetch(`${c.env.SUPABASE_URL}/rest/v1/subscription_plans?select=code&limit=1`, { headers: { apikey: c.env.SUPABASE_ANON_KEY, Authorization: `Bearer ${c.env.SUPABASE_ANON_KEY}` } });
    database = r.ok ? "ok" : `error_${r.status}`;
  } catch {
    database = "unreachable";
  }
  return c.json({ ok: database === "ok", version: VERSION, database, latencyMs: Date.now() - started, time: new Date().toISOString() });
});

app.route("/v1/public", publicRoutes);
app.post("/v1/billing/webhooks/paystack", (c) => paystackWebhook(c.env, c.req.raw));

// Everything below requires a valid Supabase session.
app.use("/v1/*", async (c, next) => {
  const h = c.req.header("authorization");
  if (!h?.startsWith("Bearer ")) throw new ApiError(401, "unauthenticated", "Please sign in.");
  const jwt = h.slice(7);
  const u = await verifyUser(c.env, jwt);
  if (!u) throw new ApiError(401, "unauthenticated", "Your session has expired. Please sign in again.");
  c.set("user", { ...u, jwt });
  await next();
});
app.route("/v1", appRoutes);
app.route("/v1/billing", billingRoutes);

app.notFound((c) => c.json({ error: { code: "not_found", message: "Endpoint not found." } }, 404));

app.onError(async (err, c) => {
  if (err instanceof ApiError) return c.json({ error: { code: err.code, message: err.message, details: err.details } }, err.status);
  if (err instanceof ZodError) return c.json({ error: { code: "invalid_request", message: "The request contains invalid data.", details: err.issues.slice(0, 10).map((i) => ({ path: i.path.join("."), message: i.message })) } }, 422);
  console.error("unhandled", err);
  c.executionCtx.waitUntil(recordError(c.env, "api", "unhandled", String(err?.message ?? err), { path: c.req.path, requestId: c.get("requestId") }));
  return c.json({ error: { code: "internal_error", message: "Something went wrong. Please try again." } }, 500);
});

export default app;
