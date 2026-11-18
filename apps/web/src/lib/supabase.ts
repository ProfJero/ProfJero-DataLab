import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
if (!url || !key) console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY");

/** Browser client: uses only the public anon/publishable key. All access is governed by RLS. */
export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" },
});

/** Turn PostgREST/RPC errors into friendly messages (mirrors the API's mapping). */
export function dbMessage(error: { message?: string; hint?: string; code?: string } | null | undefined): string {
  if (!error) return "Something went wrong.";
  const m = error.message ?? "";
  if (m.startsWith("plan_limit:")) return error.hint || "Your plan limit has been reached. Upgrade to continue.";
  if (m.startsWith("plan_feature:")) return error.hint || "This feature is not included in your plan.";
  const map: Record<string, string> = {
    version_conflict: "This form was changed in another tab or by a teammate. Reload to get the latest version.",
    question_type_locked: "A question that already has responses cannot change type.",
    forbidden: "You do not have permission to do that.",
    not_found: "Not found.",
    no_questions: "Add at least one question before publishing.",
    already_member: "This person is already a member.",
    invitation_invalid: "This invitation is no longer valid.",
    invitation_email_mismatch: "This invitation was sent to a different email address. Sign in with that address to accept it.",
    cannot_change_owner: "The owner's role can't be changed. Transfer ownership instead.",
    cannot_remove_owner: "The owner can't be removed.",
  };
  if (map[m]) return error.hint || map[m];
  if (error.code === "42501") return "You do not have permission to do that.";
  return error.hint || "Something went wrong. Please try again.";
}

export async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(dbMessage(error));
  return data as T;
}
