import type { StatusCode } from "hono/utils/http-status";
type ContentfulStatusCode = Exclude<StatusCode, 101 | 204 | 205 | 304>;

export class ApiError extends Error {
  constructor(
    public status: ContentfulStatusCode,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

/** Human messages for known database error codes raised by RPCs. */
const DB_MESSAGES: Record<string, [ContentfulStatusCode, string]> = {
  not_found: [404, "Not found."],
  forbidden: [403, "You do not have permission to do that."],
  gateway_denied: [500, "Server configuration error."],
  version_conflict: [409, "This form was changed elsewhere. Reload to get the latest version."],
  question_type_locked: [409, "A question that already has responses cannot change type."],
  form_unavailable: [404, "This form is not available."],
  form_closed: [410, "This form is closed and no longer accepts responses."],
  limit_reached: [410, "This form has reached its response limit."],
  duplicate: [409, "A response has already been submitted from this device."],
  quota_exceeded: [429, "This form cannot accept responses right now. Please try again later."],
  auth_required: [401, "Please sign in to respond to this form."],
  no_questions: [422, "Add at least one question before publishing."],
  invitation_invalid: [410, "This invitation is no longer valid."],
  invitation_email_mismatch: [403, "This invitation was sent to a different email address."],
  already_member: [409, "This person is already a member of the workspace."],
  invalid_email: [422, "Enter a valid email address."],
  form_archived: [409, "Archived forms cannot be edited. Restore it first."],
  plan_not_found: [404, "That plan is not available."],
  plan_not_purchasable: [422, "That plan cannot be purchased online."],
};

export function fromDbError(raw: { message?: string; hint?: string; code?: string; details?: string }): ApiError {
  const msg = raw.message ?? "";
  if (msg.startsWith("plan_limit:")) return new ApiError(402, "plan_limit", raw.hint || `Your plan limit for ${msg.slice(11)} has been reached. Upgrade to continue.`, { limit: msg.slice(11) });
  if (msg.startsWith("plan_feature:")) return new ApiError(402, "plan_feature", raw.hint || "This feature is not included in your plan.", { feature: msg.slice(13) });
  const known = DB_MESSAGES[msg];
  if (known) return new ApiError(known[0], msg, raw.hint || known[1]);
  if (raw.code === "42501") return new ApiError(403, "forbidden", "You do not have permission to do that.");
  if (raw.code === "P0002" || raw.code === "PGRST116") return new ApiError(404, "not_found", "Not found.");
  if (raw.code === "22023" || raw.code === "22P02" || raw.code === "23514") return new ApiError(422, "invalid_input", "The request contains invalid data.");
  return new ApiError(500, "database_error", "Something went wrong. Please try again.");
}
