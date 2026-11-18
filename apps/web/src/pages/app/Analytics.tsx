import { useState } from "react";
import { Link } from "react-router-dom";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { BarChart3, CheckCircle2, Clock, Filter, Grid3x3, Inbox, Lock, MessageSquareText, Printer, Scale, Sparkles, Users } from "lucide-react";
import { choiceOptions, dimensionCategories, DISPLAY_TYPES, isDimension, type Question, type QuestionSummary } from "@datalab/shared";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Badge, Card, CardHeader, EmptyState, ErrorState, Skeleton, Stat, Switch } from "@/components/ui/misc";
import { QuestionSummaryView, TrendChart } from "@/components/charts/Charts";
import { api } from "@/lib/api";
import { rpc } from "@/lib/supabase";
import { useWorkspace } from "@/hooks/useWorkspace";
import { usePlatformConfig } from "@/hooks/useConfig";
import { cn, fmtDate, fmtDuration, fmtNumber } from "@/lib/utils";
import { useFormContext } from "./FormLayout";

interface AnalyticsResponse {
  overview: { total: number; completed: number; partial: number; flagged: number; avgDurationSeconds: number | null; medianDurationSeconds: number | null; firstAt: string | null; lastAt: string | null; daily: { day: string; count: number }[] };
  completionRate: number;
  summaries: QuestionSummary[];
}
interface CrosstabResult { rows: { id: string; label: string }[]; cols: { id: string; label: string }[]; counts: number[][]; rowTotals: number[]; colTotals: number[]; total: number; rowPercents: number[][]; test: { chi2: number; df: number; pValue: number; cramersV: number; lowExpected: boolean } | null }
interface Compare { groups: { id: string; label: string; n: number; mean: number | null; median: number | null; stdDev: number | null; min: number | null; max: number | null }[]; overall: { n: number; mean: number | null } }

function UpgradeNote({ feature }: { feature: string }) {
  return (
    <div className="flex flex-col items-start gap-3 p-5 text-sm text-ink-muted sm:flex-row sm:items-center">
      <Lock className="h-5 w-5 text-brand" />
      <p className="flex-1">{feature} is available on the Research and Organisation plans.</p>
      <Button size="sm" asChild><Link to="/app/settings/billing">View plans</Link></Button>
    </div>
  );
}

function CrossTab({ formId, questions, filters }: { formId: string; questions: Question[]; filters: Record<string, unknown> }) {
  const dims = questions.filter(isDimension);
  const [row, setRow] = useState(dims[0]?.id ?? "");
  const [colQ, setCol] = useState(dims[1]?.id ?? "");
  const [pct, setPct] = useState(true);
  const m = useMutation({ mutationFn: () => api<CrosstabResult>(`/forms/${formId}/crosstab`, { method: "POST", json: { rowQuestion: row, colQuestion: colQ, filters } }) });
  if (dims.length < 2) return <p className="p-5 text-sm text-ink-muted">Cross-tabulation needs at least two choice, yes/no, rating or scale questions.</p>;
  const r = m.data;
  return (
    <div className="p-5">
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <label className="text-xs font-medium text-ink-muted">Rows (groups)<Select className="mt-1" value={row} onChange={(e) => setRow(e.target.value)}>{dims.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}</Select></label>
        <label className="text-xs font-medium text-ink-muted">Columns<Select className="mt-1" value={colQ} onChange={(e) => setCol(e.target.value)}>{dims.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}</Select></label>
        <Button className="self-end" onClick={() => m.mutate()} loading={m.isPending} disabled={row === colQ}>Calculate</Button>
      </div>
      {m.isError && <p className="mt-3 text-sm text-red-600">{(m.error as Error).message}</p>}
      {r && (
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between"><p className="text-xs text-ink-muted">n = {fmtNumber(r.total)} respondents who answered both questions</p><Switch checked={pct} onCheckedChange={setPct} label={<span className="text-xs">Row %</span>} /></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-line text-left text-xs text-ink-muted"><th className="py-2 pr-3" />{r.cols.map((c) => <th key={c.id} className="px-3 py-2 text-right font-medium">{c.label}</th>)}<th className="px-3 py-2 text-right font-medium">Total</th></tr></thead>
              <tbody>
                {r.rows.map((rw, i) => {
                  const max = Math.max(...r.rowPercents[i]);
                  return (
                    <tr key={rw.id} className="border-b border-line/70">
                      <th className="py-2 pr-3 text-left font-medium text-navy">{rw.label}</th>
                      {r.cols.map((c, j) => (
                        <td key={c.id} className="px-3 py-2 text-right tabular-nums" title={`${r.counts[i][j]} of ${r.rowTotals[i]} (${r.rowPercents[i][j]}%)`}>
                          <span className={cn("inline-block min-w-[3.5rem] rounded px-1.5 py-0.5", r.rowTotals[i] && r.rowPercents[i][j] === max && max > 0 ? "bg-brand-50 font-semibold text-brand-700" : "")}>{pct ? `${r.rowPercents[i][j]}%` : r.counts[i][j]}</span>
                          {pct && <span className="block text-[11px] text-ink-subtle">{r.counts[i][j]}</span>}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right font-medium tabular-nums">{r.rowTotals[i]}</td>
                    </tr>
                  );
                })}
                <tr><th className="py-2 pr-3 text-left text-xs text-ink-muted">Total</th>{r.colTotals.map((t, j) => <td key={j} className="px-3 py-2 text-right text-xs tabular-nums text-ink-muted">{t}</td>)}<td className="px-3 py-2 text-right text-xs font-semibold tabular-nums">{r.total}</td></tr>
              </tbody>
            </table>
          </div>
          {r.test ? (
            <div className={cn("mt-4 rounded-lg p-3 text-sm", r.test.pValue < 0.05 ? "bg-insight-50 text-insight-700" : "bg-slate-50 text-ink-muted")}>
              <p className="font-medium">Chi-square test of independence: χ² = {r.test.chi2}, df = {r.test.df}, p = {r.test.pValue < 0.0001 ? "< 0.0001" : r.test.pValue}, Cramér's V = {r.test.cramersV}</p>
              <p className="mt-1 text-xs">{r.test.pValue < 0.05 ? "The association is statistically significant at the 5% level." : "No statistically significant association at the 5% level."} {r.test.lowExpected && "Caution: some expected counts are below 5, so the test may be unreliable."}</p>
            </div>
          ) : <p className="mt-4 text-xs text-ink-muted">Not enough variation to run a significance test.</p>}
        </div>
      )}
    </div>
  );
}

function GroupCompare({ formId, questions, filters }: { formId: string; questions: Question[]; filters: Record<string, unknown> }) {
  const groups = questions.filter((q) => dimensionCategories(q).length && choiceOptions(q).length);
  const values = questions.filter((q) => ["number", "rating", "linear_scale"].includes(q.type));
  const [g, setG] = useState(groups[0]?.id ?? "");
  const [v, setV] = useState(values[0]?.id ?? "");
  const m = useMutation({ mutationFn: () => api<Compare>(`/forms/${formId}/compare`, { method: "POST", json: { groupQuestion: g, valueQuestion: v, filters } }) });
  if (!groups.length || !values.length) return <p className="p-5 text-sm text-ink-muted">Group comparison needs a choice question (groups) and a number, rating or scale question (values).</p>;
  const max = Math.max(1, ...(m.data?.groups.map((x) => x.mean ?? 0) ?? [1]));
  return (
    <div className="p-5">
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <label className="text-xs font-medium text-ink-muted">Compare<Select className="mt-1" value={v} onChange={(e) => setV(e.target.value)}>{values.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}</Select></label>
        <label className="text-xs font-medium text-ink-muted">Across groups of<Select className="mt-1" value={g} onChange={(e) => setG(e.target.value)}>{groups.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}</Select></label>
        <Button className="self-end" onClick={() => m.mutate()} loading={m.isPending}>Compare</Button>
      </div>
      {m.isError && <p className="mt-3 text-sm text-red-600">{(m.error as Error).message}</p>}
      {m.data && (
        <div className="mt-5 space-y-3">
          {m.data.groups.map((x) => (
            <div key={x.id}>
              <div className="mb-1 flex justify-between text-sm"><span className="text-navy">{x.label}</span><span className="tabular-nums text-ink-muted">mean <strong className="text-navy">{x.mean ?? "—"}</strong> · median {x.median ?? "—"} · n={x.n}</span></div>
              <div className="h-2.5 rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand" style={{ width: `${((x.mean ?? 0) / max) * 100}%` }} /></div>
            </div>
          ))}
          <p className="text-xs text-ink-muted">Overall mean {m.data.overall.mean ?? "—"} (n = {m.data.overall.n}). Small groups (n &lt; 10) can produce unstable averages.</p>
        </div>
      )}
    </div>
  );
}

function TextInsights({ formId, q, aiReady }: { formId: string; q: Question; aiReady: boolean }) {
  const [show, setShow] = useState(false);
  const answers = useQuery({ queryKey: ["text-answers", formId, q.id], enabled: show, queryFn: () => rpc<{ submission_id: string; submitted_at: string; answer: string }[]>("analytics_text_answers", { p_form_id: formId, p_question_id: q.id, p_filters: {}, p_limit: 20, p_offset: 0 }) });
  const themes = useMutation({ mutationFn: () => api<{ sampleSize: number; unmatched: number; themes: { name: string; description: string; count: number; percent: number; examples: string[]; keywords: string[] }[] }>(`/forms/${formId}/ai/themes`, { method: "POST", json: { questionId: q.id } }) });
  return (
    <div className="mt-4 space-y-3 border-t border-line pt-4">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => setShow((s) => !s)}><MessageSquareText /> {show ? "Hide" : "Read"} recent answers</Button>
        {aiReady && <Button size="sm" variant="subtle" onClick={() => themes.mutate()} loading={themes.isPending}><Sparkles /> Identify themes with AI</Button>}
      </div>
      {show && (answers.data ?? []).length > 0 && <ul className="max-h-64 space-y-2 overflow-y-auto">{answers.data!.map((a) => <li key={a.submission_id} className="rounded-lg bg-canvas px-3 py-2 text-sm text-navy">{a.answer}<span className="mt-0.5 block text-[11px] text-ink-subtle">{fmtDate(a.submitted_at)}</span></li>)}</ul>}
      {themes.isError && <p className="text-sm text-red-600">{(themes.error as Error).message}</p>}
      {themes.data && (
        <div className="rounded-xl border border-brand-100 bg-brand-50/40 p-4">
          <p className="mb-3 text-xs text-ink-muted"><Sparkles className="mr-1 inline h-3.5 w-3.5 text-brand" />Themes suggested by AI from the {themes.data.sampleSize} most recent answers. Counts are calculated by DataLab by matching each theme's keywords — they are not generated by the AI. {themes.data.unmatched} answers matched no theme.</p>
          <ul className="space-y-3">
            {themes.data.themes.map((t) => (
              <li key={t.name}>
                <div className="flex justify-between gap-3 text-sm"><span className="font-semibold text-navy">{t.name}</span><span className="tabular-nums text-ink-muted">{t.count} answers ({t.percent}%)</span></div>
                {t.description && <p className="text-xs text-ink-muted">{t.description}</p>}
                {t.examples[0] && <p className="mt-1 border-l-2 border-brand-200 pl-2 text-xs italic text-ink-muted">“{t.examples[0]}”</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function Analytics() {
  const { form } = useFormContext();
  const { has } = useWorkspace();
  const cfg = usePlatformConfig();
  const questions = form.definition.questions.filter((q) => !DISPLAY_TYPES.includes(q.type));
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [exclude, setExclude] = useState(false);
  const [fq, setFq] = useState("");
  const [fv, setFv] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const params = new URLSearchParams({ ...(from ? { from: new Date(from).toISOString() } : {}), ...(to ? { to: new Date(`${to}T23:59:59`).toISOString() } : {}), ...(exclude ? { excludeFlagged: "true" } : {}), ...(fq && fv ? { answerQuestion: fq, answerValue: fv } : {}) });
  const filters = { ...(from ? { from: new Date(from).toISOString() } : {}), ...(to ? { to: new Date(`${to}T23:59:59`).toISOString() } : {}), ...(exclude ? { excludeFlagged: true } : {}), ...(fq && fv ? { answer: { questionId: fq, value: fv } } : {}) };
  const q = useQuery({ queryKey: ["analytics", form.id, params.toString()], placeholderData: keepPreviousData, queryFn: () => api<AnalyticsResponse>(`/forms/${form.id}/analytics?${params}`) });
  const filtered = params.toString().length > 0;
  const fQ = questions.find((x) => x.id === fq);
  const aiReady = !!cfg.data?.ai.configured && has("ai_analyst") && form.publication.aiAnalysisEnabled;

  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant={showFilters || filtered ? "subtle" : "secondary"} size="sm" onClick={() => setShowFilters((s) => !s)}><Filter /> Filters{filtered && " (active)"}</Button>
          {filtered && <button className="text-xs font-medium text-brand" onClick={() => { setFrom(""); setTo(""); setExclude(false); setFq(""); setFv(""); }}>Clear filters</button>}
        </div>
        <div className="flex gap-2 no-print">
          {aiReady && <Button size="sm" variant="subtle" asChild><Link to="../ai"><Sparkles /> Ask the AI Analyst</Link></Button>}
          <Button size="sm" variant="secondary" onClick={() => window.print()}><Printer /> Print</Button>
        </div>
      </div>
      {showFilters && (
        <Card className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-xs font-medium text-ink-muted">From<Input type="date" className="mt-1" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="text-xs font-medium text-ink-muted">To<Input type="date" className="mt-1" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <label className="text-xs font-medium text-ink-muted">Only respondents whose answer to<Select className="mt-1" value={fq} onChange={(e) => { setFq(e.target.value); setFv(""); }}><option value="">—</option>{questions.filter(isDimension).map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</Select></label>
          <label className="text-xs font-medium text-ink-muted">is<Select className="mt-1" value={fv} disabled={!fQ} onChange={(e) => setFv(e.target.value)}><option value="">—</option>{fQ && dimensionCategories(fQ).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</Select></label>
          <div className="flex items-end pb-2"><Switch checked={exclude} onCheckedChange={setExclude} label={<span className="text-xs">Exclude flagged</span>} /></div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {!d ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[118px] rounded-xl" />) : (
          <>
            <Stat label="Completed responses" value={fmtNumber(d.overview.completed)} hint={filtered ? "Matching current filters" : "In analysed scope"} icon={<Inbox />} />
            <Stat label="Completion rate" value={`${d.completionRate}%`} hint={`${fmtNumber(d.overview.total)} submissions in range`} icon={<CheckCircle2 />} tone="green" />
            <Stat label="Median time" value={fmtDuration(d.overview.medianDurationSeconds)} hint={`Average ${fmtDuration(d.overview.avgDurationSeconds)}`} icon={<Clock />} tone="navy" />
            <Stat label="Flagged" value={fmtNumber(d.overview.flagged)} hint={d.overview.lastAt ? `Latest ${fmtDate(d.overview.lastAt)}` : "No responses yet"} icon={<Users />} tone="amber" />
          </>
        )}
      </div>

      {d && d.overview.completed === 0 ? (
        <EmptyState icon={<BarChart3 />} title={filtered ? "No responses match these filters" : "No responses to analyse yet"} description={filtered ? "Try widening the date range or removing filters." : "Analytics update automatically as responses arrive."} />
      ) : (
        <>
          <Card>
            <CardHeader title="Responses over time" description={d?.overview.firstAt ? `${fmtDate(d.overview.firstAt)} – ${fmtDate(d.overview.lastAt)}` : undefined} />
            <div className="p-5">{d ? <TrendChart data={d.overview.daily} /> : <Skeleton className="h-[220px]" />}</div>
          </Card>
          <div className="grid gap-6 xl:grid-cols-2">
            <Card className="break-inside-avoid">
              <CardHeader title={<span className="flex items-center gap-2"><Grid3x3 className="h-4 w-4 text-brand" /> Cross-tabulation</span>} description="See how answers to one question vary across another." action={!has("crosstab") && <Badge tone="brand">Research</Badge>} />
              {has("crosstab") ? <CrossTab formId={form.id} questions={questions} filters={filters} /> : <UpgradeNote feature="Cross-tabulation" />}
            </Card>
            <Card className="break-inside-avoid">
              <CardHeader title={<span className="flex items-center gap-2"><Scale className="h-4 w-4 text-brand" /> Compare groups</span>} description="Compare averages across respondent groups." action={!has("crosstab") && <Badge tone="brand">Research</Badge>} />
              {has("crosstab") ? <GroupCompare formId={form.id} questions={questions} filters={filters} /> : <UpgradeNote feature="Group comparison" />}
            </Card>
          </div>
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Question by question</h2>
            {!d ? <Skeleton className="h-64 rounded-xl" /> : d.summaries.map((s, i) => {
              const qq = questions.find((x) => x.id === s.questionId)!;
              return (
                <Card key={s.questionId} className="break-inside-avoid">
                  <CardHeader title={<span><span className="mr-2 text-ink-subtle">Q{i + 1}</span>{s.title || "Untitled question"}</span>} description={<>Answered by <strong className="text-navy">{fmtNumber(s.answered)}</strong>{s.skipped > 0 && <> · skipped by {fmtNumber(s.skipped)}</>}</>} />
                  <div className="p-5">
                    <QuestionSummaryView s={s} />
                    {s.kind === "text" && s.answered > 0 && qq && <TextInsights formId={form.id} q={qq} aiReady={aiReady} />}
                    {s.kind === "choice" && choiceOptions(qq).some((o) => o.id === "__other__") && <OtherAnswers formId={form.id} qid={qq.id} />}
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function OtherAnswers({ formId, qid }: { formId: string; qid: string }) {
  const [show, setShow] = useState(false);
  const q = useQuery({ queryKey: ["other", formId, qid], enabled: show, queryFn: () => rpc<{ answer: string; cnt: number }[]>("analytics_other_answers", { p_form_id: formId, p_question_id: qid, p_filters: {}, p_limit: 30 }) });
  return (
    <div className="mt-4 border-t border-line pt-3">
      <button className="text-xs font-medium text-brand" onClick={() => setShow((s) => !s)}>{show ? "Hide" : "Show"} “Other” answers</button>
      {show && <ul className="mt-2 flex flex-wrap gap-1.5">{(q.data ?? []).map((o) => <li key={o.answer}><Badge>{o.answer} · {o.cnt}</Badge></li>)}{q.data?.length === 0 && <li className="text-xs text-ink-muted">None yet.</li>}</ul>}
    </div>
  );
}
