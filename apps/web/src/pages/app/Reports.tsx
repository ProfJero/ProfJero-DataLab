import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileBarChart, Lock, Plus, Sparkles, Trash2 } from "lucide-react";
import { REPORT_TYPE_LABELS, type ReportType } from "@datalab/shared";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Badge, Card, EmptyState, PageHeader, Skeleton, Switch } from "@/components/ui/misc";
import { ConfirmDialog, Dialog, DialogContent } from "@/components/ui/dialog";
import { dbMessage, supabase } from "@/lib/supabase";
import { api } from "@/lib/api";
import { getForm } from "@/lib/forms";
import { useWorkspace } from "@/hooks/useWorkspace";
import { usePlatformConfig } from "@/hooks/useConfig";
import { fmtDate, fmtNumber } from "@/lib/utils";

const DESCRIPTIONS: Record<ReportType, string> = {
  survey_summary: "Overview, key findings and every question's results.",
  executive_summary: "A concise brief for decision-makers.",
  question_analysis: "Detailed question-by-question statistics.",
  research_report: "Academic structure with objectives and methodology.",
  comparative_report: "Compare results across respondent groups.",
  ai_findings: "Verified findings plus AI-written interpretation.",
};
const ADVANCED: ReportType[] = ["research_report", "comparative_report", "ai_findings"];

function GenerateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { current, has } = useWorkspace();
  const cfg = usePlatformConfig();
  const nav = useNavigate();
  const forms = useQuery({ queryKey: ["forms-min", current?.id], enabled: open, queryFn: async () => (await supabase.from("forms").select("id,title,response_count").eq("workspace_id", current!.id).neq("status", "draft").order("updated_at", { ascending: false })).data ?? [] });
  const [formId, setFormId] = useState("");
  const [type, setType] = useState<ReportType>("survey_summary");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [objectives, setObjectives] = useState("");
  const [methodology, setMethodology] = useState("");
  const [compare, setCompare] = useState("");
  const [useAi, setUseAi] = useState(false);
  const [busy, setBusy] = useState(false);
  const fq = useQuery({ queryKey: ["form", formId], enabled: !!formId && type === "comparative_report", queryFn: () => getForm(formId) });
  const groupQs = (fq.data?.definition.questions ?? []).filter((q) => ["single_choice", "dropdown", "yes_no"].includes(q.type));
  const aiAvailable = !!cfg.data?.ai.configured && has("ai_analyst");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Generate a report" description="Reports are built from your actual results. You can edit every section before exporting." wide>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const r = await api<{ id: string }>("/reports/generate", { method: "POST", json: { formId, type, title: title || `${REPORT_TYPE_LABELS[type]} — ${forms.data?.find((f) => f.id === formId)?.title ?? ""}`.slice(0, 300), description: description || undefined, objectives: objectives || undefined, methodology: methodology || undefined, compareQuestionId: compare || undefined, useAi: useAi || type === "ai_findings" } });
              toast.success("Report generated");
              nav(`/app/reports/${r.id}`);
            } catch (er) {
              toast.error((er as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Form" required>{(id) => <Select id={id} value={formId} onChange={(e) => setFormId(e.target.value)} required><option value="">Choose a form…</option>{(forms.data ?? []).map((f) => <option key={f.id} value={f.id}>{f.title} ({fmtNumber(f.response_count)} responses)</option>)}</Select>}</Field>
          <div>
            <p className="label mb-2">Report type</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {(Object.keys(REPORT_TYPE_LABELS) as ReportType[]).map((t) => {
                const locked = (ADVANCED.includes(t) && !has("advanced_reports")) || (t === "ai_findings" && !aiAvailable);
                return (
                  <button type="button" key={t} disabled={locked} onClick={() => setType(t)} className={`rounded-lg border p-3 text-left text-sm transition disabled:opacity-50 ${type === t ? "border-brand bg-brand-50" : "border-line hover:border-brand-200"}`}>
                    <span className="flex items-center gap-1.5 font-medium text-navy">{REPORT_TYPE_LABELS[t]}{locked && <Lock className="h-3.5 w-3.5 text-ink-subtle" />}</span>
                    <span className="mt-0.5 block text-xs text-ink-muted">{DESCRIPTIONS[t]}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <Field label="Report title">{(id) => <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Leave blank for an automatic title" maxLength={300} />}</Field>
          <Field label="Study description (optional)">{(id) => <Textarea id={id} value={description} onChange={(e) => setDescription(e.target.value)} />}</Field>
          {type !== "executive_summary" && <Field label="Research objectives (optional)" hint="Only what you provide is included — DataLab never invents objectives.">{(id) => <Textarea id={id} value={objectives} onChange={(e) => setObjectives(e.target.value)} />}</Field>}
          {ADVANCED.includes(type) && <Field label="Methodology / data collection (optional)" hint="Describe sampling, timeframe and distribution. Not invented if left blank.">{(id) => <Textarea id={id} value={methodology} onChange={(e) => setMethodology(e.target.value)} />}</Field>}
          {type === "comparative_report" && <Field label="Compare groups by" required>{(id) => <Select id={id} value={compare} onChange={(e) => setCompare(e.target.value)} required><option value="">Choose a question…</option>{groupQs.map((q) => <option key={q.id} value={q.id}>{q.title}</option>)}</Select>}</Field>}
          {aiAvailable && type !== "ai_findings" && <Switch checked={useAi} onCheckedChange={setUseAi} label={<span className="flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-brand" /> Add AI-assisted analysis and recommendations</span>} description="AI sections are clearly labelled and grounded in calculated results. Uses AI credits." />}
          <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" loading={busy} disabled={!formId}>Generate report</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Reports() {
  const { current, can } = useWorkspace();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const q = useQuery({ queryKey: ["reports", current?.id], queryFn: async () => (await supabase.from("reports").select("id,title,type,status,sample_size,updated_at,forms(title)").eq("workspace_id", current!.id).order("updated_at", { ascending: false })).data ?? [] });
  return (
    <div>
      <PageHeader title="Reports" description="Professional, editable reports generated from your survey results." actions={can("reports.edit") && <Button onClick={() => setOpen(true)}><Plus /> Generate report</Button>} />
      {q.isLoading ? <Skeleton className="h-48 rounded-xl" /> : (q.data ?? []).length === 0 ? (
        <EmptyState icon={<FileBarChart />} title="No reports yet" description="Generate a survey summary, executive brief or research report from any published form." action={can("reports.edit") && <Button onClick={() => setOpen(true)}><Plus /> Generate report</Button>} />
      ) : (
        <Card className="divide-y divide-line">
          {q.data!.map((r) => (
            <div key={r.id} className="flex items-center gap-4 px-5 py-4">
              <Link to={`/app/reports/${r.id}`} className="min-w-0 flex-1">
                <p className="truncate font-medium text-navy">{r.title}</p>
                <p className="mt-0.5 text-xs text-ink-muted">{REPORT_TYPE_LABELS[r.type as ReportType]} · {(r.forms as unknown as { title: string } | null)?.title ?? "Form deleted"} · n = {r.sample_size ?? 0} · updated {fmtDate(r.updated_at)}</p>
              </Link>
              <Badge tone={r.status === "final" ? "green" : "default"}>{r.status}</Badge>
              {can("reports.edit") && <ConfirmDialog title="Delete this report?" description="This cannot be undone." destructive confirmLabel="Delete" onConfirm={async () => { const { error } = await supabase.from("reports").delete().eq("id", r.id); if (error) toast.error(dbMessage(error)); qc.invalidateQueries({ queryKey: ["reports"] }); qc.invalidateQueries({ queryKey: ["entitlements"] }); }} trigger={<Button variant="ghost" size="icon-sm" aria-label="Delete report"><Trash2 /></Button>} />}
            </div>
          ))}
        </Card>
      )}
      {open && <GenerateDialog open={open} onOpenChange={setOpen} />}
      <p className="mt-4 text-xs text-ink-muted">Layout blocks and contact-detail questions are omitted from report summaries.</p>
    </div>
  );
}
