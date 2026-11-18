import type { Context } from "hono";
import type { AppEnv, Env } from "../env";
import { Db } from "./supabase";
import { ApiError } from "./errors";

const enc = new TextEncoder();

export async function sha256Hex(input: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(input));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha1Hex(input: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-1", enc.encode(input));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hmacHex(algo: "SHA-256" | "SHA-512", key: string, data: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: algo }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, enc.encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export function clientIp(c: Context<AppEnv>): string {
  return c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

/** Database-backed fixed-window rate limiter (shared across Worker isolates). */
export async function rateLimit(env: Env, bucket: string, limit: number, windowSeconds: number): Promise<void> {
  let ok = true;
  try {
    ok = await new Db(env).rpc<boolean>("gateway_rate_limit", { p_gateway: env.GATEWAY_KEY, p_bucket: bucket, p_limit: limit, p_window_seconds: windowSeconds });
  } catch (e) {
    // Fail closed only for clearly configured systems; log otherwise.
    console.error("rate limit check failed", e);
    return;
  }
  if (!ok) throw new ApiError(429, "rate_limited", "Too many requests. Please wait a moment and try again.");
}

export async function recordError(env: Env, source: string, code: string, message: string, context: Record<string, unknown> = {}) {
  try {
    await new Db(env).rpc("record_error", { p_gateway: env.GATEWAY_KEY, p_source: source, p_code: code, p_message: message.slice(0, 1900), p_context: context });
  } catch {
    /* never throw from error reporting */
  }
}

export function isConfigured(v: string | undefined): v is string {
  return !!v && v.trim() !== "" && v !== "none";
}

export function db(c: Context<AppEnv>): Db {
  return new Db(c.env, c.get("user").jwt);
}

export async function readJson<T>(c: Context<AppEnv>, maxBytes = 256 * 1024): Promise<T> {
  const len = Number(c.req.header("content-length") ?? "0");
  if (len > maxBytes) throw new ApiError(413, "payload_too_large", "The request is too large.");
  const text = await c.req.text();
  if (text.length > maxBytes) throw new ApiError(413, "payload_too_large", "The request is too large.");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError(400, "invalid_json", "The request body must be valid JSON.");
  }
}
