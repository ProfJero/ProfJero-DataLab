// ProfJero DataLab — web edge Worker.
// Serves the built SPA, proxies /api/* to the API Worker (same origin), adds security
// headers, sets per-page SEO metadata, and supports an authenticated release upload
// flow (KV-backed) for environments without a Cloudflare API token.
// In CI with an API token you can instead deploy apps/web/dist with Workers Static Assets.

const TYPES = { html: "text/html; charset=utf-8", js: "text/javascript; charset=utf-8", css: "text/css; charset=utf-8", json: "application/json", svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", ico: "image/x-icon", txt: "text/plain; charset=utf-8", xml: "application/xml; charset=utf-8", woff2: "font/woff2", webmanifest: "application/manifest+json", map: "application/json" };

const SEO = {
  "/": ["ProfJero DataLab — Smarter Surveys. Better Decisions.", "Create powerful forms, collect meaningful responses and turn your data into actionable insights with built-in analytics and an AI Data Analyst."],
  "/features": ["Features — ProfJero DataLab", "Form builder, conditional logic, response management, analytics, cross-tabulation, AI Data Analyst and professional reports in one platform."],
  "/pricing": ["Pricing — ProfJero DataLab", "Start free. Upgrade for advanced analytics, AI analysis, research tools and team collaboration."],
  "/about": ["About — ProfJero DataLab", "ProfJero DataLab is a data collection and intelligence platform. A product of ProfJero Digital Studio."],
  "/contact": ["Contact — ProfJero DataLab", "Get in touch with the ProfJero DataLab team."],
  "/privacy": ["Privacy Policy — ProfJero DataLab", "How ProfJero DataLab collects, uses and protects personal data."],
  "/terms": ["Terms of Service — ProfJero DataLab", "The terms that govern use of ProfJero DataLab."],
  "/templates": ["Survey templates — ProfJero DataLab", "Ready-to-use templates for education, research, business and organisations."],
};

let currentCache = { id: null, at: 0 };
async function currentRelease(env) {
  if (currentCache.id && Date.now() - currentCache.at < 15000) return currentCache.id;
  const id = await env.SITE.get("current");
  currentCache = { id, at: Date.now() };
  return id;
}

function securityHeaders(h, path) {
  const embeddable = path.startsWith("/f/");
  h.set("X-Content-Type-Options", "nosniff");
  h.set("Referrer-Policy", "strict-origin-when-cross-origin");
  h.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  h.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  h.set("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  if (!embeddable) h.set("X-Frame-Options", "SAMEORIGIN");
  h.set("Content-Security-Policy", [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https://res.cloudinary.com https://*.supabase.co",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.cloudinary.com https://profjero-datalab-api.profjerodigitalstudio.workers.dev",
    "frame-src 'self' https://checkout.paystack.com",
    "base-uri 'self'",
    "form-action 'self'",
    `frame-ancestors ${embeddable ? "*" : "'self'"}`,
    "object-src 'none'",
  ].join("; "));
}

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function handleDeploy(req, env, url) {
  if (!env.DEPLOY_KEY || !timingSafeEqual(req.headers.get("x-deploy-key") || "", env.DEPLOY_KEY)) return new Response("forbidden", { status: 403 });
  const parts = url.pathname.split("/").filter(Boolean); // __deploy, op, ...
  const op = parts[1];
  if (op === "file" && req.method === "PUT") {
    const release = parts[2];
    const path = "/" + parts.slice(3).join("/");
    if (!/^[a-z0-9-]{4,40}$/.test(release)) return new Response("bad release", { status: 400 });
    const body = await req.arrayBuffer();
    if (body.byteLength > 20 * 1024 * 1024) return new Response("too large", { status: 413 });
    await env.SITE.put(`r/${release}${path}`, body, { metadata: { type: req.headers.get("content-type") || "" } });
    return Response.json({ ok: true, key: `r/${release}${path}`, bytes: body.byteLength });
  }
  if (op === "activate" && req.method === "POST") {
    const { release } = await req.json();
    if (!(await env.SITE.get(`r/${release}/index.html`))) return new Response("release missing index.html", { status: 400 });
    const previous = await env.SITE.get("current");
    await env.SITE.put("current", release);
    if (previous) await env.SITE.put("previous", previous);
    currentCache = { id: release, at: Date.now() };
    return Response.json({ ok: true, release, previous });
  }
  if (op === "cleanup" && req.method === "POST") {
    const keep = new Set([await env.SITE.get("current"), await env.SITE.get("previous")]);
    let cursor, deleted = 0;
    do {
      const list = await env.SITE.list({ prefix: "r/", cursor });
      for (const k of list.keys) {
        const rel = k.name.split("/")[1];
        if (!keep.has(rel)) { await env.SITE.delete(k.name); deleted++; }
      }
      cursor = list.list_complete ? undefined : list.cursor;
    } while (cursor);
    return Response.json({ ok: true, deleted });
  }
  return new Response("not found", { status: 404 });
}

class MetaRewriter {
  constructor(title, desc, url) { this.title = title; this.desc = desc; this.url = url; }
  element(el) {
    const n = el.tagName;
    if (n === "title") el.setInnerContent(this.title);
    else if (n === "meta") {
      const name = el.getAttribute("name") || el.getAttribute("property");
      if (name === "description" || name === "og:description" || name === "twitter:description") el.setAttribute("content", this.desc);
      if (name === "og:title" || name === "twitter:title") el.setAttribute("content", this.title);
      if (name === "og:url") el.setAttribute("content", this.url);
    } else if (n === "link" && el.getAttribute("rel") === "canonical") el.setAttribute("href", this.url);
  }
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/__deploy/")) return handleDeploy(req, env, url);

    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      if (!env.API) return Response.json({ error: { code: "api_unavailable", message: "API not bound" } }, { status: 503 });
      const target = new URL(url.pathname.replace(/^\/api/, "") || "/", "https://api.internal");
      target.search = url.search;
      return env.API.fetch(new Request(target, req));
    }
    if (req.method !== "GET" && req.method !== "HEAD") return new Response("Method not allowed", { status: 405 });

    const release = await currentRelease(env);
    if (!release) return new Response("ProfJero DataLab is being deployed. Please try again shortly.", { status: 503, headers: { "Retry-After": "30" } });

    let path = decodeURIComponent(url.pathname);
    if (path.endsWith("/")) path += "index.html";
    let obj = await env.SITE.getWithMetadata(`r/${release}${path}`, { type: "arrayBuffer", cacheTtl: 300 });
    let isFallback = false;
    if (!obj.value) {
      const hasExt = /\.[a-z0-9]{2,12}$/i.test(path);
      if (hasExt) return new Response("Not found", { status: 404 });
      obj = await env.SITE.getWithMetadata(`r/${release}/index.html`, { type: "arrayBuffer", cacheTtl: 60 });
      isFallback = true;
      if (!obj.value) return new Response("Not found", { status: 404 });
    }
    const ext = isFallback ? "html" : path.split(".").pop().toLowerCase();
    const headers = new Headers({ "Content-Type": TYPES[ext] || (obj.metadata && obj.metadata.type) || "application/octet-stream" });
    headers.set("Cache-Control", path.startsWith("/assets/") && !isFallback ? "public, max-age=31536000, immutable" : ext === "html" ? "no-cache" : "public, max-age=3600");
    securityHeaders(headers, url.pathname);
    let res = new Response(req.method === "HEAD" ? null : obj.value, { status: 200, headers });
    if (ext === "html") {
      const key = url.pathname.replace(/\/$/, "") || "/";
      const meta = SEO[key];
      const isApp = key.startsWith("/app") || key.startsWith("/admin") || key.startsWith("/auth") || key.startsWith("/invite");
      if (meta) res = new HTMLRewriter().on("title", new MetaRewriter(meta[0], meta[1], url.origin + key)).on("meta", new MetaRewriter(meta[0], meta[1], url.origin + key)).on("link", new MetaRewriter(meta[0], meta[1], url.origin + key)).transform(res);
      if (isApp) res.headers.set("X-Robots-Tag", "noindex");
    }
    return res;
  },
};
