import { supabase } from "./supabase";

const BASE = ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api").replace(/\/$/, "");

export class ApiRequestError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

/** Calls the DataLab API Worker with the current session token. */
export async function api<T>(path: string, init: RequestInit & { json?: unknown; anonymous?: boolean } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!init.anonymous) {
    const { data } = await supabase.auth.getSession();
    if (data.session) headers.set("Authorization", `Bearer ${data.session.access_token}`);
  }
  let body = init.body;
  if (init.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(init.json);
  }
  let res: Response;
  try {
    res = await fetch(`${BASE}/v1${path}`, { ...init, headers, body });
  } catch {
    throw new ApiRequestError(0, "network", "Can't reach DataLab right now. Check your connection and try again.");
  }
  if (res.ok) {
    const ct = res.headers.get("content-type") ?? "";
    return (ct.includes("application/json") ? await res.json() : await res.blob()) as T;
  }
  let err: { error?: { code?: string; message?: string; details?: unknown } } = {};
  try {
    err = await res.json();
  } catch {
    /* non-JSON error */
  }
  throw new ApiRequestError(res.status, err.error?.code ?? "error", err.error?.message ?? `Request failed (${res.status}).`, err.error?.details);
}

export const isPlanError = (e: unknown) => e instanceof ApiRequestError && e.status === 402;
