import type { Env } from "../env";
import { ApiError, fromDbError } from "./errors";

/**
 * Minimal Supabase REST client. Requests carry either the end user's JWT (so RLS and
 * in-function authorisation apply) or only the anon key (public/gateway operations).
 * The Worker never uses a service-role key.
 */
export class Db {
  constructor(
    private env: Env,
    private jwt?: string,
  ) {}

  private headers(extra: Record<string, string> = {}) {
    return {
      apikey: this.env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${this.jwt ?? this.env.SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      ...extra,
    };
  }

  async rpc<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
    const res = await fetch(`${this.env.SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: this.headers(), body: JSON.stringify(args) });
    return this.handle<T>(res);
  }

  /** Table access through PostgREST (RLS enforced with the user's JWT). */
  async select<T = unknown>(table: string, query: string): Promise<T> {
    const res = await fetch(`${this.env.SUPABASE_URL}/rest/v1/${table}?${query}`, { headers: this.headers() });
    return this.handle<T>(res);
  }

  async insert<T = unknown>(table: string, rows: unknown, returning = true): Promise<T> {
    const res = await fetch(`${this.env.SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: this.headers({ Prefer: returning ? "return=representation" : "return=minimal" }),
      body: JSON.stringify(rows),
    });
    return this.handle<T>(res);
  }

  async update<T = unknown>(table: string, query: string, patch: unknown): Promise<T> {
    const res = await fetch(`${this.env.SUPABASE_URL}/rest/v1/${table}?${query}`, {
      method: "PATCH",
      headers: this.headers({ Prefer: "return=representation" }),
      body: JSON.stringify(patch),
    });
    return this.handle<T>(res);
  }

  private async handle<T>(res: Response): Promise<T> {
    const text = await res.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    if (!res.ok) {
      if (res.status === 401) throw new ApiError(401, "unauthenticated", "Your session has expired. Please sign in again.");
      throw fromDbError((body ?? {}) as { message?: string; hint?: string; code?: string });
    }
    return body as T;
  }
}

const userCache = new Map<string, { id: string; email: string; exp: number }>();

/** Verify a Supabase access token by asking Supabase Auth (authoritative, handles revocation). */
export async function verifyUser(env: Env, jwt: string): Promise<{ id: string; email: string } | null> {
  const now = Date.now();
  const cached = userCache.get(jwt);
  if (cached && cached.exp > now) return cached;
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${jwt}` } });
  if (!res.ok) return null;
  const u = (await res.json()) as { id?: string; email?: string };
  if (!u.id) return null;
  const v = { id: u.id, email: u.email ?? "", exp: now + 60_000 };
  if (userCache.size > 500) userCache.clear();
  userCache.set(jwt, v);
  return v;
}
