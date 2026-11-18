import { afterEach, describe, expect, it, vi } from "vitest";
import app from "../src/index";
import type { Env } from "../src/env";

const env = { SUPABASE_URL: "https://db.test", SUPABASE_ANON_KEY: "anon", GATEWAY_KEY: "gw", APP_BASE_URL: "https://app.test", ALLOWED_ORIGINS: "https://app.test" } as Env;
const ctx = { waitUntil: () => undefined, passThroughOnException: () => undefined } as unknown as ExecutionContext;
const Q1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const S1 = "11111111-1111-4111-8111-111111111111";
const publicForm = {
  id: "ffffffff-ffff-4fff-8fff-ffffffffffff", slug: "abcdefgh12", version: 2, available: true, unavailableReason: null, requireAuth: false, honeypot: true, collectRespondentEmail: false,
  definition: { title: "T", theme: {}, settings: {}, sections: [{ id: S1, title: "", jumps: [] }], questions: [{ id: Q1, sectionId: S1, type: "single_choice", title: "Network", required: true, config: { options: [{ id: "mtn", label: "MTN" }] }, visibility: null }] },
};

function mockDb(handlers: Record<string, (body: any) => unknown>) {
  const calls: { url: string; body: any }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url, body });
    for (const [k, h] of Object.entries(handlers)) if (url.includes(k)) return new Response(JSON.stringify(h(body)), { status: 200 });
    return new Response(JSON.stringify({ message: "not mocked" }), { status: 500 });
  }));
  return calls;
}
const req = (path: string, init: RequestInit = {}) => app.fetch(new Request(`https://api.test${path}`, init), env, ctx);
afterEach(() => vi.unstubAllGlobals());

describe("API", () => {
  it("rejects unauthenticated requests to protected endpoints", async () => {
    const r = await req("/v1/config");
    expect(r.status).toBe(401);
  });
  it("rejects invalid sessions", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));
    const r = await req("/v1/config", { headers: { Authorization: "Bearer bad" } });
    expect(r.status).toBe(401);
  });
  it("sets security headers", async () => {
    const r = await req("/");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.headers.get("x-frame-options")).toBe("DENY");
  });
  it("refuses CORS preflight from unknown origins on private routes", async () => {
    const r = await req("/v1/config", { method: "OPTIONS", headers: { Origin: "https://evil.test" } });
    expect(r.status).toBe(403);
    const ok = await req("/v1/config", { method: "OPTIONS", headers: { Origin: "https://app.test" } });
    expect(ok.status).toBe(204);
  });
  it("returns 404 for unknown public forms", async () => {
    mockDb({ get_public_form: () => null });
    expect((await req("/v1/public/forms/unknown123")).status).toBe(404);
  });
  it("rejects invalid submissions with field errors and does not store them", async () => {
    const calls = mockDb({ gateway_rate_limit: () => true, get_public_form: () => publicForm, submit_response: () => ({ submissionId: "x" }) });
    const r = await req(`/v1/public/forms/abcdefgh12/submit`, { method: "POST", body: JSON.stringify({ answers: { [Q1]: "vodafone" } }) });
    expect(r.status).toBe(422);
    const j = (await r.json()) as any;
    expect(j.error.details[Q1]).toBeTruthy();
    expect(calls.some((c) => c.url.includes("submit_response"))).toBe(false);
  });
  it("enforces required fields", async () => {
    mockDb({ gateway_rate_limit: () => true, get_public_form: () => publicForm });
    const r = await req(`/v1/public/forms/abcdefgh12/submit`, { method: "POST", body: JSON.stringify({ answers: {} }) });
    expect(r.status).toBe(422);
  });
  it("silently drops honeypot submissions", async () => {
    const calls = mockDb({ gateway_rate_limit: () => true, get_public_form: () => publicForm });
    const r = await req(`/v1/public/forms/abcdefgh12/submit`, { method: "POST", body: JSON.stringify({ answers: { [Q1]: "mtn" }, website: "http://spam" }) });
    expect(r.status).toBe(200);
    expect(calls.some((c) => c.url.includes("submit_response"))).toBe(false);
  });
  it("stores valid submissions via the gateway RPC with normalised answers", async () => {
    const calls = mockDb({ gateway_rate_limit: () => true, get_public_form: () => publicForm, submit_response: () => ({ submissionId: "sub-1" }) });
    const r = await req(`/v1/public/forms/abcdefgh12/submit`, { method: "POST", body: JSON.stringify({ answers: { [Q1]: "mtn" }, startedAt: Date.now() - 60000 }) });
    expect(r.status).toBe(201);
    const sub = calls.find((c) => c.url.includes("submit_response"))!;
    expect(sub.body.p_gateway).toBe("gw");
    expect(sub.body.p_answers).toEqual({ [Q1]: "mtn" });
    expect(sub.body.p_fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });
  it("rejects closed forms", async () => {
    mockDb({ gateway_rate_limit: () => true, get_public_form: () => ({ ...publicForm, available: false, unavailableReason: "closed" }) });
    const r = await req(`/v1/public/forms/abcdefgh12/submit`, { method: "POST", body: JSON.stringify({ answers: { [Q1]: "mtn" } }) });
    expect(r.status).toBe(410);
  });
  it("enforces rate limits", async () => {
    mockDb({ gateway_rate_limit: () => false });
    const r = await req(`/v1/public/forms/abcdefgh12/submit`, { method: "POST", body: JSON.stringify({ answers: {} }) });
    expect(r.status).toBe(429);
  });
  it("rejects oversized payloads", async () => {
    mockDb({ gateway_rate_limit: () => true });
    const r = await req(`/v1/public/forms/abcdefgh12/submit`, { method: "POST", body: JSON.stringify({ answers: { [Q1]: "x".repeat(300_000) } }) });
    expect(r.status).toBe(413);
  });
  it("reports AI as unavailable when not configured (no fake success)", async () => {
    mockDb({ "/auth/v1/user": () => ({ id: "u1", email: "u@test" }), get_form_definition: () => ({ id: "f", workspaceId: "w", definition: publicForm.definition, publication: {} }) });
    const r = await req(`/v1/forms/ffffffff-ffff-4fff-8fff-ffffffffffff/ai/ask`, { method: "POST", headers: { Authorization: "Bearer good" }, body: JSON.stringify({ question: "What is most common?" }) });
    expect(r.status).toBe(503);
    expect(((await r.json()) as any).error.code).toBe("ai_not_configured");
  });
  it("maps database permission errors to 403/404 without leaking details", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (url.includes("/auth/v1/user") ? new Response(JSON.stringify({ id: "u2", email: "o@test" })) : new Response(JSON.stringify({ message: "not_found", code: "P0002" }), { status: 400 }))));
    const r = await req(`/v1/forms/ffffffff-ffff-4fff-8fff-ffffffffffff/analytics`, { headers: { Authorization: "Bearer other" } });
    expect(r.status).toBe(404);
  });
});
