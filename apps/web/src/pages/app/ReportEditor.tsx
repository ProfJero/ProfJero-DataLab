import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Download, Edit3, FileSpreadsheet, Printer, Sparkles } from "lucide-react";
import { REPORT_TYPE_LABELS, type QuestionSummary, type ReportType } from "@datalab/shared";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Badge, ErrorState, Spinner } from "@/components/ui/misc";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { QuestionSummaryView } from "@/components/charts/Charts";
import { Markdown } from "@/lib/markdown";
import { buildXlsx } from "@/lib/xlsx";
import { dbMessage, supabase } from "@/lib/supabase";
import { useWorkspace } from "@/hooks/useWorkspace";
import { downloadBlob, fmtDate } from "@/lib/utils";
import { LogoFull } from "@/components/brand/Logo";

interface Section { id: string; position: number; kind: string; title: string; body: string | null; data: Record<string, unknown>; source: string }
interface Report { id: string; title: string; type: ReportType; status: string; meta: Record<string, string>; sample_size: number; generated_at: string; report_sections: Section[] }

function statRows(sections: Section[]): string[][] {
  const rows: string[][] = [];
  for (const s of sections) {
    const sum = s.data.summary as QuestionSummary | undefined;
    if (!sum) continue;
    if (sum.kind === "choice") sum.options.forEach((o) => rows.push([sum.title, o.label, String(o.count), `${o.percent}%`, String(sum.answered)]));
    else if (sum.kind === "numeric") rows.push([sum.title, "Mean / median", String(sum.stats.mean ?? ""), String(sum.stats.median ?? ""), String(sum.answered)]);
    else if (sum.kind === "likert") sum.rows.forEach((r) => rows.push([sum.title, r.label, String(r.stats.mean ?? ""), "mean", String(r.stats.n)]));
    else rows.push([sum.title, "Answered", String(sum.answered), "", String(sum.answered)]);
  }
  return rows;
}

function SectionBlock({ s, editable, onSave }: { s: Section; editable: boolean; onSave: (p: { title: string; body: string }) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(s.title);
  const [body, setBody] = useState(s.body ?? "");
  const [busy, setBusy] = useState(false);
  const summary = s.data.summary as QuestionSummary | undefined;
  const table = s.data.rows as string[][] | undefined;
  const header = s.data.header as string[] | undefined;
  const ct = s.data.crosstab as { rows: { label: string }[]; cols: { label: string }[]; counts: number[][]; rowPercents: number[][]; rowTotals: number[] } | undefined;
  return (
    <section className="group relative break-inside-avoid py-5">
      {editing ? (
        <div className="space-y-2 no-print">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Section title" />
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} className="min-h-[160px]" aria-label="Section text" />
          <div className="flex gap-2"><Button size="sm" loading={busy} onClick={async () => { setBusy(true); await onSave({ title, body }); setBusy(false); setEditing(false); }}>Save</Button><Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button></div>
        </div>
      ) : (
        <>
          <div className="flex items-start gap-2">
            <h2 className="flex-1 text-lg font-semibold">{s.title}</h2>
            {s.source === "ai" && <Badge tone="brand"><Sparkles /> AI-assisted</Badge>}
            {editable && <button onClick={() => setEditing(true)} className="no-print rounded p-1 text-ink-subtle opacity-0 hover:bg-slate-100 group-hover:opacity-100 focus:opacity-100" aria-label={`Edit ${s.title}`}><Edit3 className="h-4 w-4" /></button>}
          </div>
          {s.body && <div className="mt-2 text-[15px] text-slate-700"><Markdown text={s.body} /></div>}
          {table && (
            <table className="mt-3 w-full text-sm">
              {header && <thead><tr className="border-b border-line text-left text-xs text-ink-muted">{header.map((h) => <th key={h} className="py-1.5 pr-3 font-medium">{h}</th>)}</tr></thead>}
              <tbody>{table.map((r, i) => <tr key={i} className="border-b border-line/60">{r.map((c, j) => <td key={j} className={j === 0 ? "py-1.5 pr-3 text-ink-muted" : "py-1.5 pr-3 font-medium tabular-nums text-navy"}>{c}</td>)}</tr>)}</tbody>
            </table>
          )}
          {ct && (
            <table className="mt-3 w-full text-sm">
              <thead><tr className="border-b border-line text-xs text-ink-muted"><th />{ct.cols.map((c) => <th key={c.label} className="px-2 py-1.5 text-right font-medium">{c.label}</th>)}<th className="px-2 text-right">n</th></tr></thead>
              <tbody>{ct.rows.map((r, i) => <tr key={r.label} className="border-b border-line/60"><th className="py-1.5 pr-2 text-left font-medium text-navy">{r.label}</th>{ct.cols.map((c, j) => <td key={c.label} className="px-2 py-1.5 text-right tabular-nums">{ct.rowPercents[i][j]}% <span className="text-[11px] text-ink-subtle">({ct.counts[i][j]})</span></td>)}<td className="px-2 text-right tabular-nums">{ct.rowTotals[i]}</td></tr>)}</tbody>
            </table>
          )}
          {summary && summary.answered > 0 && <div className="mt-4"><QuestionSummaryView s={summary} /></div>}
        </>
      )}
    </section>
  );
}

export default function ReportEditor() {
  const { id = "" } = useParams();
  const { can } = useWorkspace();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["report", id], queryFn: async () => { const { data, error } = await supabase.from("reports").select("id,title,type,status,meta,sample_size,generated_at,report_sections(id,position,kind,title,body,data,source)").eq("id", id).single(); if (error) throw new Error(dbMessage(error)); return data as unknown as Report; } });
  if (q.isLoading) return <Spinner />;
  if (q.isError || !q.data) return <ErrorState error={q.error} />;
  const r = q.data;
  const sections = [...r.report_sections].sort((a, b) => a.position - b.position);
  const editable = can("reports.edit");
  const save = async (sid: string, p: { title: string; body: string }) => {
    const { error } = await supabase.from("report_sections").update({ title: p.title, body: p.body, source: "user" }).eq("id", sid);
    if (error) toast.error(dbMessage(error));
    else toast.success("Section updated");
    qc.invalidateQueries({ queryKey: ["report", id] });
  };
  const name = r.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 60);
  const head = ["Question", "Option / measure", "Count / value", "Percent / note", "n"];
  return (
    <div>
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" asChild><Link to="/app/reports"><ArrowLeft /> Reports</Link></Button>
        <div className="flex flex-wrap gap-2">
          {editable && r.status !== "final" && <Button variant="secondary" size="sm" onClick={async () => { await supabase.from("reports").update({ status: "final" }).eq("id", id); qc.invalidateQueries({ queryKey: ["report", id] }); toast.success("Marked as final"); }}><CheckCircle2 /> Mark final</Button>}
          <Menu>
            <MenuTrigger asChild><Button size="sm"><Download /> Export</Button></MenuTrigger>
            <MenuContent>
              <MenuItem onSelect={() => window.print()}><Printer /> PDF (print → Save as PDF)</MenuItem>
              <MenuItem onSelect={() => { const csv = "﻿" + [head, ...statRows(sections)].map((row) => row.map((c) => `"${(/^[=+\-@]/.test(c) ? "'" : "") + c.replace(/"/g, '""')}"`).join(",")).join("\r\n"); downloadBlob(new Blob([csv], { type: "text/csv" }), `${name}.csv`); }}><Download /> Results table (CSV)</MenuItem>
              <MenuItem onSelect={() => downloadBlob(buildXlsx("Results", head, statRows(sections)), `${name}.xlsx`)}><FileSpreadsheet /> Results table (XLSX)</MenuItem>
            </MenuContent>
          </Menu>
        </div>
      </div>
      <article className="print-page mx-auto max-w-[820px] rounded-2xl border border-line bg-white px-6 py-10 shadow-card sm:px-14">
        <header className="border-b border-line pb-8">
          <div className="flex items-center justify-between"><LogoFull width={170} /><span className="text-xs text-ink-muted">{REPORT_TYPE_LABELS[r.type]}</span></div>
          <h1 className="mt-8 text-3xl font-semibold leading-tight">{r.title}</h1>
          <dl className="mt-4 grid grid-cols-2 gap-y-1 text-sm text-ink-muted sm:grid-cols-4">
            {r.meta.organisation && <><dt className="sr-only">Organisation</dt><dd>{r.meta.organisation}</dd></>}
            <dt className="sr-only">Survey</dt><dd>{r.meta.formTitle}</dd>
            <dt className="sr-only">Sample</dt><dd>n = {r.sample_size}</dd>
            <dt className="sr-only">Generated</dt><dd>Generated {fmtDate(r.generated_at)}</dd>
          </dl>
          {r.status !== "final" && <p className="no-print mt-4 text-xs text-ink-subtle">Draft — hover a section and click the pencil to edit. Figures come from calculated results; AI-assisted sections are labelled.</p>}
        </header>
        <div className="divide-y divide-line">{sections.map((s) => <SectionBlock key={s.id} s={s} editable={editable} onSave={(p) => save(s.id, p)} />)}</div>
        <footer className="mt-8 border-t border-line pt-4 text-xs text-ink-muted">Generated with ProfJero DataLab · A product of ProfJero Digital Studio</footer>
      </article>
    </div>
  );
}
