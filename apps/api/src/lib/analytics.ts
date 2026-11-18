import {
  buildCrosstab,
  chiSquare,
  describe,
  dimensionCategories,
  formDefinitionSchema,
  round,
  summariseQuestion,
  type AggregateRow,
  type AnalyticsFilters,
  type Crosstab,
  type FormDefinition,
  type Question,
  type QuestionSummary,
} from "@datalab/shared";
import type { Db } from "./supabase";
import { ApiError } from "./errors";

export interface FormRecord {
  id: string;
  workspaceId: string;
  slug: string;
  status: string;
  version: number;
  responseCount: number;
  definition: FormDefinition;
  publication: Record<string, unknown> & { aiAnalysisEnabled?: boolean };
  answeredQuestionIds: string[];
}

export async function loadForm(db: Db, formId: string): Promise<FormRecord> {
  const raw = await db.rpc<FormRecord & { definition: unknown }>("get_form_definition", { p_form_id: formId });
  const parsed = formDefinitionSchema.safeParse(raw.definition);
  // Stored definitions are written through validated RPCs; fall back to raw if older fields fail strict parsing.
  return { ...raw, definition: (parsed.success ? parsed.data : raw.definition) as FormDefinition };
}

export function filtersToJson(f: AnalyticsFilters | undefined): Record<string, unknown> {
  if (!f) return {};
  const out: Record<string, unknown> = {};
  if (f.from) out.from = f.from;
  if (f.to) out.to = f.to;
  if (f.excludeFlagged) out.excludeFlagged = true;
  if (f.answer?.questionId && f.answer.value !== undefined) out.answer = f.answer;
  return out;
}

export interface Overview {
  total: number;
  completed: number;
  partial: number;
  flagged: number;
  avgDurationSeconds: number | null;
  medianDurationSeconds: number | null;
  firstAt: string | null;
  lastAt: string | null;
  daily: { day: string; count: number }[];
  byWeekday: { weekday: number; count: number }[];
  byHour: { hour: number; count: number }[];
}

export interface AnalyticsBundle {
  form: FormRecord;
  overview: Overview;
  completionRate: number;
  summaries: QuestionSummary[];
}

export async function computeAnalytics(db: Db, formId: string, filters?: AnalyticsFilters, preloaded?: FormRecord): Promise<AnalyticsBundle> {
  const fj = filtersToJson(filters);
  const [form, overview, rows] = await Promise.all([
    preloaded ? Promise.resolve(preloaded) : loadForm(db, formId),
    db.rpc<Overview>("analytics_overview", { p_form_id: formId, p_filters: fj }),
    db.rpc<AggregateRow[]>("analytics_question_aggregates", { p_form_id: formId, p_filters: fj }),
  ]);
  const summaries = form.definition.questions.map((q) => summariseQuestion(q, rows, overview.completed)).filter((s): s is QuestionSummary => s !== null);
  const completionRate = overview.total ? Math.round((overview.completed / overview.total) * 1000) / 10 : 0;
  return { form, overview, completionRate, summaries };
}

export interface CrosstabResult extends Crosstab {
  test: { chi2: number; df: number; pValue: number; cramersV: number; lowExpected: boolean } | null;
}

export async function computeCrosstab(db: Db, form: FormRecord, rowId: string, colId: string, filters?: AnalyticsFilters): Promise<CrosstabResult> {
  const rowQ = form.definition.questions.find((q) => q.id === rowId);
  const colQ = form.definition.questions.find((q) => q.id === colId);
  if (!rowQ || !colQ) throw new ApiError(422, "invalid_question", "Choose two questions from this form.");
  if (!dimensionCategories(rowQ).length || !dimensionCategories(colQ).length) throw new ApiError(422, "invalid_question", "Cross-tabulation needs choice, yes/no, rating or scale questions.");
  const data = await db.rpc<{ row_key: string; col_key: string; cnt: number }[]>("analytics_crosstab", { p_form_id: form.id, p_row_question: rowId, p_col_question: colId, p_filters: filtersToJson(filters) });
  const ct = buildCrosstab(rowQ, colQ, data);
  const t = chiSquare(ct.counts);
  return { ...ct, test: t ? { chi2: round(t.chi2, 3)!, df: t.df, pValue: round(t.pValue, 4)!, cramersV: round(t.cramersV, 3)!, lowExpected: t.lowExpected } : null };
}

export interface GroupComparison {
  groupQuestion: { id: string; title: string };
  valueQuestion: { id: string; title: string };
  groups: { id: string; label: string; n: number; mean: number | null; median: number | null; stdDev: number | null; min: number | null; max: number | null }[];
  overall: { n: number; mean: number | null };
}

export async function computeGroupComparison(db: Db, form: FormRecord, groupId: string, valueId: string, filters?: AnalyticsFilters): Promise<GroupComparison> {
  const gq = form.definition.questions.find((q) => q.id === groupId);
  const vq = form.definition.questions.find((q) => q.id === valueId);
  if (!gq || !vq || !dimensionCategories(gq).length || !["number", "rating", "linear_scale"].includes(vq.type)) {
    throw new ApiError(422, "invalid_question", "Compare a numeric, rating or scale question across the categories of a choice question.");
  }
  const rows = await db.rpc<{ group_key: string; n: number; mean: number | null; median: number | null; stddev: number | null; min: number | null; max: number | null }[]>("analytics_group_numeric", {
    p_form_id: form.id,
    p_group_question: groupId,
    p_value_question: valueId,
    p_filters: filtersToJson(filters),
  });
  const by = new Map(rows.map((r) => [r.group_key, r]));
  const groups = dimensionCategories(gq).map((cat) => {
    const r = by.get(cat.id);
    return { id: cat.id, label: cat.label, n: r?.n ?? 0, mean: r ? round(Number(r.mean)) : null, median: r ? round(Number(r.median)) : null, stdDev: r && r.stddev !== null ? round(Number(r.stddev)) : null, min: r ? Number(r.min) : null, max: r ? Number(r.max) : null };
  });
  const n = groups.reduce((s, g) => s + g.n, 0);
  const mean = n ? round(groups.reduce((s, g) => s + (g.mean ?? 0) * g.n, 0) / n) : null;
  return { groupQuestion: { id: gq.id, title: gq.title }, valueQuestion: { id: vq.id, title: vq.title }, groups, overall: { n, mean } };
}

export function questionById(form: FormRecord, id: string): Question | undefined {
  return form.definition.questions.find((q) => q.id === id);
}

export { describe };
