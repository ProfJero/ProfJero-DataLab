/** Feature keys and usage limit keys used by the entitlement system. Values live in the database (subscription_plans). */
export const FEATURE_KEYS = [
  "conditional_logic",
  "advanced_questions",
  "advanced_analytics",
  "crosstab",
  "ai_analyst",
  "reports",
  "advanced_reports",
  "xlsx_export",
  "remove_branding",
  "team_collaboration",
  "custom_theme",
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

export const LIMIT_KEYS = ["forms", "responses_per_month", "members", "ai_credits_per_month", "exports_per_month", "reports", "upload_mb"] as const;
export type LimitKey = (typeof LIMIT_KEYS)[number];

export interface Entitlements {
  plan_code: string;
  plan_name: string;
  status: string;
  features: Partial<Record<FeatureKey, boolean>>;
  limits: Partial<Record<LimitKey, number | null>>;
  usage: Partial<Record<LimitKey, number>>;
}

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  conditional_logic: "Conditional logic & branching",
  advanced_questions: "File upload, image choice & Likert questions",
  advanced_analytics: "Advanced analytics & filters",
  crosstab: "Cross-tabulation & group comparison",
  ai_analyst: "AI Data Analyst",
  reports: "Report generation",
  advanced_reports: "Research & comparative reports",
  xlsx_export: "Excel (XLSX) export",
  remove_branding: "Remove DataLab branding",
  team_collaboration: "Team collaboration & roles",
  custom_theme: "Custom form themes",
};

export const LIMIT_LABELS: Record<LimitKey, string> = {
  forms: "Forms",
  responses_per_month: "Responses / month",
  members: "Team members",
  ai_credits_per_month: "AI credits / month",
  exports_per_month: "Exports / month",
  reports: "Reports",
  upload_mb: "Upload storage (MB)",
};

/** null limit = unlimited. */
export function withinLimit(e: Entitlements, key: LimitKey, adding = 1): boolean {
  const limit = e.limits[key];
  if (limit === null || limit === undefined) return true;
  return (e.usage[key] ?? 0) + adding <= limit;
}

export function hasFeature(e: Entitlements | null | undefined, key: FeatureKey): boolean {
  return !!e?.features?.[key];
}

export type WorkspaceRole = "owner" | "admin" | "editor" | "analyst" | "viewer";
export const ROLE_RANK: Record<WorkspaceRole, number> = { viewer: 1, analyst: 2, editor: 3, admin: 4, owner: 5 };
export const ROLE_LABELS: Record<WorkspaceRole, string> = { owner: "Owner", admin: "Admin", editor: "Editor", analyst: "Analyst", viewer: "Viewer" };
export const ROLE_DESCRIPTIONS: Record<WorkspaceRole, string> = {
  owner: "Full control including billing, deletion and ownership transfer.",
  admin: "Manage members, settings, forms, responses and reports.",
  editor: "Create and edit forms, manage responses and reports.",
  analyst: "View forms and responses, run analytics, AI analysis and reports.",
  viewer: "Read-only access to forms, responses and reports.",
};

export type Permission = "workspace.manage" | "members.manage" | "billing.manage" | "forms.edit" | "responses.manage" | "analytics.run" | "reports.edit" | "read";
const MIN_ROLE: Record<Permission, WorkspaceRole> = {
  "workspace.manage": "admin",
  "members.manage": "admin",
  "billing.manage": "owner",
  "forms.edit": "editor",
  "responses.manage": "editor",
  "analytics.run": "analyst",
  "reports.edit": "analyst",
  read: "viewer",
};

/** Mirrors the SQL function `has_workspace_role`. UI hints only; enforcement is in the database. */
export function can(role: WorkspaceRole | null | undefined, p: Permission): boolean {
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[MIN_ROLE[p]];
}
