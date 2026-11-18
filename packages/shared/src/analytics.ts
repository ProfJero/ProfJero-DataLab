import { choiceOptions, DISPLAY_TYPES, isMultiSelect, OTHER_OPTION_ID, PII_TYPES, type Question } from "./form";
import { describe, outliers, percent, round, type Bucket, type Descriptive } from "./stats";

/**
 * A row produced by the database aggregation function `analytics_question_aggregates`.
 * metric: 'answered' | 'opt' | 'num' | 'likert' | 'word' | 'date' | 'hour'
 */
export interface AggregateRow {
  question_id: string;
  metric: string;
  key: string | null;
  num: number | null;
  cnt: number;
  docs?: number | null;
}

export interface OptionStat {
  id: string;
  label: string;
  count: number;
  /** Share of respondents who answered the question. */
  percent: number;
}

export type QuestionSummary =
  | { kind: "choice"; questionId: string; title: string; type: Question["type"]; answered: number; skipped: number; multi: boolean; totalSelections: number; options: OptionStat[] }
  | { kind: "numeric"; questionId: string; title: string; type: Question["type"]; answered: number; skipped: number; stats: RoundedDescriptive; distribution: Bucket[]; outliers: Bucket[]; scale?: [number, number] }
  | { kind: "likert"; questionId: string; title: string; type: Question["type"]; answered: number; skipped: number; scaleLabels: string[]; rows: { id: string; label: string; stats: RoundedDescriptive; distribution: { value: number; label: string; count: number; percent: number }[] }[] }
  | { kind: "text"; questionId: string; title: string; type: Question["type"]; answered: number; skipped: number; keywords: { word: string; count: number; documents: number }[] }
  | { kind: "date"; questionId: string; title: string; type: Question["type"]; answered: number; skipped: number; earliest: string | null; latest: string | null; byMonth: { month: string; count: number }[] }
  | { kind: "time"; questionId: string; title: string; type: Question["type"]; answered: number; skipped: number; byHour: { hour: number; count: number }[] }
  | { kind: "count"; questionId: string; title: string; type: Question["type"]; answered: number; skipped: number; sensitive: boolean };

export type RoundedDescriptive = Omit<Descriptive, "mode"> & { mode: number[] };

function roundDesc(d: Descriptive): RoundedDescriptive {
  return { ...d, mean: round(d.mean), median: round(d.median), stdDev: round(d.stdDev), q1: round(d.q1), q3: round(d.q3), sum: round(d.sum) ?? 0 };
}

/** Build a per-question summary from database aggregates. `respondents` = submissions in scope. */
export function summariseQuestion(q: Question, rows: AggregateRow[], respondents: number): QuestionSummary | null {
  if (DISPLAY_TYPES.includes(q.type)) return null;
  const mine = rows.filter((r) => r.question_id === q.id);
  const answered = mine.find((r) => r.metric === "answered")?.cnt ?? 0;
  const skipped = Math.max(0, respondents - answered);
  const base = { questionId: q.id, title: q.title, type: q.type, answered, skipped };

  switch (q.type) {
    case "single_choice":
    case "multiple_choice":
    case "dropdown":
    case "yes_no":
    case "image_choice": {
      const counts = new Map(mine.filter((r) => r.metric === "opt").map((r) => [r.key ?? "", r.cnt]));
      const opts = choiceOptions(q);
      const known = new Set(opts.map((o) => o.id));
      const options: OptionStat[] = opts.map((o) => ({ id: o.id, label: o.label, count: counts.get(o.id) ?? 0, percent: percent(counts.get(o.id) ?? 0, answered) }));
      // Options removed after responses were collected are still reported honestly.
      for (const [id, c] of counts) if (!known.has(id)) options.push({ id, label: id === OTHER_OPTION_ID ? "Other" : `Removed option (${id})`, count: c, percent: percent(c, answered) });
      return { kind: "choice", ...base, multi: isMultiSelect(q), totalSelections: options.reduce((s, o) => s + o.count, 0), options };
    }
    case "number":
    case "rating":
    case "linear_scale": {
      const dist: Bucket[] = mine.filter((r) => r.metric === "num" && r.num !== null).map((r) => ({ value: Number(r.num), count: r.cnt }));
      const scale: [number, number] | undefined = q.type === "rating" ? [1, q.config.scaleMax ?? 5] : q.type === "linear_scale" ? [q.config.scaleMin ?? 1, q.config.scaleMax ?? 5] : undefined;
      let distribution = dist.sort((a, b) => a.value - b.value);
      if (scale) {
        const m = new Map(dist.map((b) => [b.value, b.count]));
        distribution = [];
        for (let v = scale[0]; v <= scale[1]; v++) distribution.push({ value: v, count: m.get(v) ?? 0 });
      }
      return { kind: "numeric", ...base, stats: roundDesc(describe(dist)), distribution, outliers: q.type === "number" ? outliers(dist).buckets : [], scale };
    }
    case "likert": {
      const labels = q.config.scaleLabels?.length ? q.config.scaleLabels : ["1", "2", "3", "4", "5"];
      const rowsOut = (q.config.rows ?? []).map((row) => {
        const dist = mine.filter((r) => r.metric === "likert" && r.key === row.id && r.num !== null).map((r) => ({ value: Number(r.num), count: r.cnt }));
        const n = dist.reduce((s, b) => s + b.count, 0);
        const m = new Map(dist.map((b) => [b.value, b.count]));
        return {
          id: row.id,
          label: row.label,
          stats: roundDesc(describe(dist)),
          distribution: labels.map((label, i) => ({ value: i + 1, label, count: m.get(i + 1) ?? 0, percent: percent(m.get(i + 1) ?? 0, n) })),
        };
      });
      return { kind: "likert", ...base, scaleLabels: labels, rows: rowsOut };
    }
    case "short_text":
    case "long_text": {
      const keywords = mine
        .filter((r) => r.metric === "word" && r.key)
        .map((r) => ({ word: r.key as string, count: r.cnt, documents: r.docs ?? r.cnt }))
        .sort((a, b) => b.documents - a.documents || b.count - a.count || a.word.localeCompare(b.word));
      return { kind: "text", ...base, keywords };
    }
    case "date": {
      const days = mine.filter((r) => r.metric === "date" && r.key).map((r) => ({ d: r.key as string, c: r.cnt })).sort((a, b) => a.d.localeCompare(b.d));
      const months = new Map<string, number>();
      for (const x of days) months.set(x.d.slice(0, 7), (months.get(x.d.slice(0, 7)) ?? 0) + x.c);
      return { kind: "date", ...base, earliest: days[0]?.d ?? null, latest: days[days.length - 1]?.d ?? null, byMonth: [...months.entries()].map(([month, count]) => ({ month, count })) };
    }
    case "time": {
      const m = new Map(mine.filter((r) => r.metric === "hour").map((r) => [Number(r.key), r.cnt]));
      return { kind: "time", ...base, byHour: Array.from({ length: 24 }, (_, hour) => ({ hour, count: m.get(hour) ?? 0 })) };
    }
    default:
      return { kind: "count", ...base, sensitive: PII_TYPES.includes(q.type) };
  }
}

export interface CrosstabRow {
  row_key: string;
  col_key: string;
  cnt: number;
}

export interface Crosstab {
  rowQuestion: { id: string; title: string };
  colQuestion: { id: string; title: string };
  rows: { id: string; label: string }[];
  cols: { id: string; label: string }[];
  counts: number[][];
  rowTotals: number[];
  colTotals: number[];
  total: number;
  /** Row percentages (each row sums to 100). */
  rowPercents: number[][];
}

/** Category labels for a question used as a crosstab dimension. */
export function dimensionCategories(q: Question): { id: string; label: string }[] {
  if (["single_choice", "multiple_choice", "dropdown", "yes_no", "image_choice"].includes(q.type)) return choiceOptions(q).map((o) => ({ id: o.id, label: o.label }));
  if (q.type === "rating") return Array.from({ length: q.config.scaleMax ?? 5 }, (_, i) => ({ id: String(i + 1), label: String(i + 1) }));
  if (q.type === "linear_scale") {
    const lo = q.config.scaleMin ?? 1;
    const hi = q.config.scaleMax ?? 5;
    return Array.from({ length: hi - lo + 1 }, (_, i) => ({ id: String(lo + i), label: String(lo + i) }));
  }
  return [];
}

export function isDimension(q: Question): boolean {
  return dimensionCategories(q).length > 0;
}

export function buildCrosstab(rowQ: Question, colQ: Question, data: CrosstabRow[]): Crosstab {
  const rows = dimensionCategories(rowQ);
  const cols = dimensionCategories(colQ);
  const ri = new Map(rows.map((r, i) => [r.id, i]));
  const ci = new Map(cols.map((c, i) => [c.id, i]));
  const counts = rows.map(() => cols.map(() => 0));
  for (const d of data) {
    const i = ri.get(d.row_key);
    const j = ci.get(d.col_key);
    if (i === undefined || j === undefined) continue;
    counts[i][j] += d.cnt;
  }
  const rowTotals = counts.map((r) => r.reduce((a, b) => a + b, 0));
  const colTotals = cols.map((_, j) => counts.reduce((s, r) => s + r[j], 0));
  const total = rowTotals.reduce((a, b) => a + b, 0);
  return {
    rowQuestion: { id: rowQ.id, title: rowQ.title },
    colQuestion: { id: colQ.id, title: colQ.title },
    rows,
    cols,
    counts,
    rowTotals,
    colTotals,
    total,
    rowPercents: counts.map((r, i) => r.map((c) => percent(c, rowTotals[i]))),
  };
}

export interface AnalyticsFilters {
  from?: string | null;
  to?: string | null;
  /** Restrict to submissions whose answer to questionId matches value (option id or exact text/number). */
  answer?: { questionId: string; value: string } | null;
  excludeFlagged?: boolean;
}

export interface OverviewStats {
  total: number;
  completed: number;
  partial: number;
  flagged: number;
  completionRate: number;
  avgDurationSeconds: number | null;
  firstAt: string | null;
  lastAt: string | null;
  daily: { day: string; count: number }[];
}
