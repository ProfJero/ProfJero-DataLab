import { useState, type ReactNode } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Table2, BarChart3 } from "lucide-react";
import type { QuestionSummary } from "@datalab/shared";
import { fmtDate, fmtNumber } from "@/lib/utils";

/** Validated categorical order (see docs/ARCHITECTURE.md → Data visualisation). Never cycled. */
export const SERIES = ["#2864C5", "#20A47A", "#E08A1E", "#8B5CF6", "#0EA5B7", "#D9488F"];
/** Diverging scale for agreement scales: warm (disagree) → neutral grey → cool (agree). */
export const DIVERGING = ["#C2410C", "#F0A35E", "#CBD5E1", "#7FA9EC", "#1F51A6"];
const AXIS = { fontSize: 12, fill: "#64748B" };
const GRID = "#EEF1F6";

function TooltipBox({ title, rows }: { title: ReactNode; rows: [string, ReactNode][] }) {
  return (
    <div className="rounded-lg border border-line bg-white px-3 py-2 text-xs shadow-pop">
      <p className="mb-1 font-semibold text-navy">{title}</p>
      {rows.map(([k, v]) => (
        <p key={k} className="flex justify-between gap-6 text-ink-muted"><span>{k}</span><span className="font-medium tabular-nums text-navy">{v}</span></p>
      ))}
    </div>
  );
}

export function TrendChart({ data, height = 220, label = "Responses" }: { data: { day: string; count: number }[]; height?: number; label?: string }) {
  return (
    <div style={{ height }} role="img" aria-label={`${label} over time`}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2864C5" stopOpacity={0.18} />
              <stop offset="100%" stopColor="#2864C5" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="day" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(d) => fmtDate(d, "d MMM")} minTickGap={24} />
          <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} width={40} />
          <Tooltip cursor={{ stroke: "#94A3B8", strokeDasharray: "3 3" }} content={({ active, payload }) => (active && payload?.[0] ? <TooltipBox title={fmtDate(payload[0].payload.day)} rows={[[label, fmtNumber(payload[0].payload.count)]]} /> : null)} />
          <Area type="monotone" dataKey="count" stroke="#2864C5" strokeWidth={2} fill="url(#trendFill)" activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Horizontal bars for categorical answers — labels on the left, count and % on the right. */
export function CategoryBars({ items, total, multi }: { items: { label: string; count: number; percent: number }[]; total: number; multi?: boolean }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <ul className="space-y-3" aria-label="Answer distribution">
      {items.map((it) => (
        <li key={it.label} className="group">
          <div className="mb-1 flex items-baseline justify-between gap-4 text-sm">
            <span className="min-w-0 truncate text-navy" title={it.label}>{it.label}</span>
            <span className="shrink-0 tabular-nums text-ink-muted"><span className="font-semibold text-navy">{it.percent}%</span> · {fmtNumber(it.count)}</span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-slate-100" title={`${it.label}: ${it.count} of ${total} (${it.percent}%)`}>
            <div className="h-full rounded-full bg-brand transition-all group-hover:bg-brand-600" style={{ width: `${(it.count / max) * 100}%`, minWidth: it.count ? 4 : 0 }} />
          </div>
        </li>
      ))}
      {multi && <li className="pt-1 text-xs text-ink-muted">Respondents could choose more than one option, so percentages can add up to more than 100%.</li>}
    </ul>
  );
}

export function ColumnChart({ data, xLabel, height = 200, valueLabel = "Responses" }: { data: { x: string; count: number }[]; xLabel?: string; height?: number; valueLabel?: string }) {
  return (
    <div style={{ height }} role="img" aria-label={`Distribution${xLabel ? ` by ${xLabel}` : ""}`}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} barCategoryGap="22%">
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="x" tick={AXIS} tickLine={false} axisLine={{ stroke: "#E2E8F0" }} interval="preserveStartEnd" />
          <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} width={40} />
          <Tooltip cursor={{ fill: "rgba(40,100,197,0.06)" }} content={({ active, payload }) => (active && payload?.[0] ? <TooltipBox title={`${xLabel ? `${xLabel}: ` : ""}${payload[0].payload.x}`} rows={[[valueLabel, fmtNumber(payload[0].payload.count)]]} /> : null)} />
          <Bar dataKey="count" fill="#2864C5" radius={[4, 4, 0, 0]} maxBarSize={48} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** 100% stacked bars for Likert statements, diverging colours with a neutral midpoint. */
export function LikertChart({ rows, labels }: { rows: { id: string; label: string; stats: { n: number; mean: number | null }; distribution: { label: string; count: number; percent: number }[] }[]; labels: string[] }) {
  const palette = labels.length === 5 ? DIVERGING : labels.map((_, i) => SERIES[i % SERIES.length]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted" aria-label="Legend">
        {labels.map((l, i) => <span key={l} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: palette[i] }} />{l}</span>)}
      </div>
      {rows.map((r) => (
        <div key={r.id}>
          <div className="mb-1.5 flex justify-between gap-4 text-sm"><span className="text-navy">{r.label}</span><span className="shrink-0 text-xs text-ink-muted">mean {r.stats.mean ?? "—"} · n={r.stats.n}</span></div>
          <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full bg-slate-100">
            {r.distribution.map((d, i) => d.percent > 0 && <div key={d.label} title={`${d.label}: ${d.count} (${d.percent}%)`} style={{ width: `${d.percent}%`, background: palette[i] }} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

function DataTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">{head.map((h) => <th key={h} className="py-2 pr-4 font-medium">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-b border-line/70 last:border-0">{r.map((c, j) => <td key={j} className={j ? "py-2 pr-4 tabular-nums" : "py-2 pr-4 text-navy"}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function StatGrid({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-3 gap-3 sm:grid-cols-6">
      {items.map(([k, v]) => (
        <div key={k} className="rounded-lg bg-canvas px-3 py-2">
          <dt className="text-[11px] uppercase tracking-wide text-ink-muted">{k}</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-navy">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Picks an appropriate visualisation for each question type (never a misleading chart). */
export function QuestionSummaryView({ s }: { s: QuestionSummary }) {
  const [table, setTable] = useState(false);
  let chart: ReactNode = null;
  let tableView: ReactNode = null;
  if (s.answered === 0) chart = <p className="py-6 text-center text-sm text-ink-muted">No answers yet.</p>;
  else if (s.kind === "choice") {
    const items = [...s.options].sort((a, b) => (s.type === "yes_no" ? 0 : b.count - a.count));
    chart = <CategoryBars items={items} total={s.answered} multi={s.multi} />;
    tableView = <DataTable head={["Option", "Count", "% of respondents"]} rows={items.map((o) => [o.label, o.count, `${o.percent}%`])} />;
  } else if (s.kind === "numeric") {
    chart = (
      <div className="space-y-4">
        <StatGrid items={[["Mean", s.stats.mean ?? "—"], ["Median", s.stats.median ?? "—"], ["Min", s.stats.min ?? "—"], ["Max", s.stats.max ?? "—"], ["Std dev", s.stats.stdDev ?? "—"], ["n", s.stats.n]]} />
        {s.distribution.length <= 40 && <ColumnChart data={s.distribution.map((b) => ({ x: String(b.value), count: b.count }))} xLabel="Value" />}
        {s.outliers.length > 0 && <p className="text-xs text-ink-muted">Possible outliers (outside 1.5×IQR): {s.outliers.map((o) => `${o.value} (×${o.count})`).join(", ")}</p>}
      </div>
    );
    tableView = <DataTable head={["Value", "Count"]} rows={s.distribution.map((b) => [b.value, b.count])} />;
  } else if (s.kind === "likert") {
    chart = <LikertChart rows={s.rows} labels={s.scaleLabels} />;
    tableView = <DataTable head={["Statement", "n", "Mean", ...s.scaleLabels]} rows={s.rows.map((r) => [r.label, r.stats.n, r.stats.mean ?? "—", ...r.distribution.map((d) => `${d.count} (${d.percent}%)`)])} />;
  } else if (s.kind === "text") {
    const top = s.keywords.slice(0, 12);
    chart = top.length ? (
      <div>
        <p className="mb-3 text-xs text-ink-muted">Most frequent words, by number of answers that mention them.</p>
        <CategoryBars items={top.map((k) => ({ label: k.word, count: k.documents, percent: Math.round((k.documents / s.answered) * 1000) / 10 }))} total={s.answered} />
      </div>
    ) : <p className="text-sm text-ink-muted">{s.answered} written answers. Not enough repeated words to summarise.</p>;
    tableView = <DataTable head={["Word", "Answers mentioning", "Total mentions"]} rows={s.keywords.map((k) => [k.word, k.documents, k.count])} />;
  } else if (s.kind === "date") {
    chart = (
      <div className="space-y-3">
        <StatGrid items={[["Earliest", s.earliest ?? "—"], ["Latest", s.latest ?? "—"], ["n", s.answered]]} />
        <ColumnChart data={s.byMonth.map((m) => ({ x: m.month, count: m.count }))} xLabel="Month" />
      </div>
    );
    tableView = <DataTable head={["Month", "Count"]} rows={s.byMonth.map((m) => [m.month, m.count])} />;
  } else if (s.kind === "time") {
    chart = <ColumnChart data={s.byHour.map((h) => ({ x: `${h.hour}:00`, count: h.count }))} xLabel="Hour" />;
    tableView = <DataTable head={["Hour", "Count"]} rows={s.byHour.filter((h) => h.count).map((h) => [`${h.hour}:00`, h.count])} />;
  } else {
    chart = <p className="text-sm text-ink-muted">{fmtNumber(s.answered)} answer(s).{s.sensitive ? " Contact details are shown in the responses table, not summarised." : ""}</p>;
  }
  return (
    <div>
      {tableView && s.answered > 0 && (
        <div className="mb-3 flex justify-end no-print">
          <button onClick={() => setTable((t) => !t)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-ink-muted hover:bg-slate-100" aria-pressed={table}>
            {table ? <BarChart3 className="h-3.5 w-3.5" /> : <Table2 className="h-3.5 w-3.5" />}
            {table ? "Chart view" : "Table view"}
          </button>
        </div>
      )}
      {table && tableView ? tableView : chart}
    </div>
  );
}

export { Cell };
