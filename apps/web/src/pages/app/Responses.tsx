import { useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable, type RowSelectionState } from "@tanstack/react-table";
import { toast } from "sonner";
import { CheckCircle2, ChevronLeft, ChevronRight, Download, FileSpreadsheet, Filter, Flag, Inbox, Search, Trash2, X } from "lucide-react";
import * as D from "@radix-ui/react-dialog";
import { choiceOptions, DISPLAY_TYPES, type Question } from "@datalab/shared";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Badge, Card, EmptyState, ErrorState, Skeleton } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { rpc } from "@/lib/supabase";
import { api, isPlanError } from "@/lib/api";
import { AnswerView, formatAnswer } from "@/lib/answers";
import { buildXlsx } from "@/lib/xlsx";
import { useWorkspace } from "@/hooks/useWorkspace";
import { cn, downloadBlob, fmtDateTime, fmtDuration, fmtNumber } from "@/lib/utils";
import { useFormContext } from "./FormLayout";

interface Row { id: string; submitted_at: string; status: string; review_status: string; is_flagged: boolean; flag_reason: string | null; duration_seconds: number | null; respondent_email: string | null; is_sample: boolean; answers: Record<string, unknown>; other: Record<string, string> }
interface Detail extends Omit<Row, "submitted_at" | "review_status" | "is_flagged" | "flag_reason" | "duration_seconds" | "respondent_email" | "is_sample"> { isSample: boolean; submittedAt: string; durationSeconds: number | null; reviewStatus: string; isFlagged: boolean; flagReason: string | null; respondentEmail: string | null; metadata: Record<string, unknown>; archivedQuestions: { id: string; title: string; type: string }[]; flags: { id: string; type: string; note: string | null; createdAt: string; by: string | null }[] }

const PAGE = 25;
const col = createColumnHelper<Row>();

function ResponseDrawer({ id, questions, onClose, canManage, onChanged }: { id: string; questions: Question[]; onClose: () => void; canManage: boolean; onChanged: () => void }) {
  const { form } = useFormContext();
  const q = useQuery({ queryKey: ["response", id], queryFn: () => rpc<Detail>("get_response", { p_submission_id: id }) });
  const d = q.data;
  const review = async (patch: { status?: string; flag?: boolean; reason?: string }) => {
    try {
      await rpc("update_responses_review", { p_form_id: form.id, p_ids: [id], p_review_status: patch.status ?? null, p_flagged: patch.flag ?? null, p_reason: patch.reason ?? null });
      q.refetch();
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <D.Root open onOpenChange={(o) => !o && onClose()}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-navy/30" />
        <D.Content className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col bg-white shadow-pop animate-fade-in focus:outline-none">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <div>
              <D.Title className="font-semibold text-navy">Response</D.Title>
              <D.Description className="text-xs text-ink-muted">{d ? `${fmtDateTime(d.submittedAt)} · ${fmtDuration(d.durationSeconds)}` : "Loading…"}</D.Description>
            </div>
            <D.Close className="rounded-lg p-2 hover:bg-slate-100" aria-label="Close"><X className="h-4 w-4" /></D.Close>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {!d ? <Skeleton className="h-64" /> : (
              <>
                <div className="mb-4 flex flex-wrap gap-2">
                  {d.isFlagged && <Badge tone="red"><Flag /> Flagged{d.flagReason ? `: ${d.flagReason}` : ""}</Badge>}
                  {d.reviewStatus === "needs_review" && <Badge tone="amber">Needs review</Badge>}
                  {d.reviewStatus === "reviewed" && <Badge tone="green"><CheckCircle2 /> Reviewed</Badge>}
                  {d.isSample && <Badge tone="amber">Sample data</Badge>}
                  {d.respondentEmail && <Badge>{d.respondentEmail}</Badge>}
                  {typeof d.metadata?.device === "string" && <Badge>{String(d.metadata.device)}</Badge>}
                </div>
                <dl className="space-y-5">
                  {questions.map((qq, i) => (
                    <div key={qq.id}>
                      <dt className="text-xs font-medium uppercase tracking-wide text-ink-muted">Q{i + 1}. {qq.title}</dt>
                      <dd className="mt-1 text-sm"><AnswerView q={qq} v={d.answers[qq.id]} other={d.other[qq.id]} /></dd>
                    </div>
                  ))}
                  {d.archivedQuestions.map((aq) => (
                    <div key={aq.id}>
                      <dt className="text-xs font-medium uppercase tracking-wide text-ink-muted">{aq.title} <span className="normal-case">(removed question)</span></dt>
                      <dd className="mt-1 text-sm"><AnswerView q={undefined} v={d.answers[aq.id]} /></dd>
                    </div>
                  ))}
                </dl>
                {d.flags.length > 0 && (
                  <div className="mt-6 border-t border-line pt-4">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">Review history</p>
                    <ul className="space-y-1 text-sm">{d.flags.map((f) => <li key={f.id} className="text-ink-muted">{fmtDateTime(f.createdAt)} · {f.by ?? "Someone"} flagged as {f.type}{f.note ? ` — ${f.note}` : ""}</li>)}</ul>
                  </div>
                )}
              </>
            )}
          </div>
          {canManage && d && (
            <div className="flex flex-wrap gap-2 border-t border-line px-5 py-3">
              {d.reviewStatus !== "reviewed" ? <Button size="sm" variant="secondary" onClick={() => review({ status: "reviewed" })}><CheckCircle2 /> Mark reviewed</Button> : <Button size="sm" variant="ghost" onClick={() => review({ status: "none" })}>Clear review</Button>}
              {d.isFlagged ? <Button size="sm" variant="ghost" onClick={() => review({ flag: false })}>Unflag</Button> : <Button size="sm" variant="secondary" onClick={() => { const reason = window.prompt("Why are you flagging this response? (optional)") ?? ""; review({ flag: true, reason }); }}><Flag /> Flag as suspicious</Button>}
              {d.reviewStatus === "none" && <Button size="sm" variant="ghost" onClick={() => review({ status: "needs_review" })}>Needs review</Button>}
            </div>
          )}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

export default function Responses() {
  const { form } = useFormContext();
  const { can } = useWorkspace();
  const qc = useQueryClient();
  const questions = useMemo(() => form.definition.questions.filter((q) => !DISPLAY_TYPES.includes(q.type)), [form]);
  const filterable = questions.filter((q) => choiceOptions(q).length > 0 || ["rating", "linear_scale"].includes(q.type));
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("");
  const [fq, setFq] = useState("");
  const [fv, setFv] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [sel, setSel] = useState<RowSelectionState>({});
  const [exporting, setExporting] = useState<string | null>(null);
  const filters = { from: from ? new Date(from).toISOString() : undefined, to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined, search: applied || undefined, status: status || undefined, answer: fq && fv ? { questionId: fq, value: fv } : undefined };
  const key = ["responses", form.id, page, sort, JSON.stringify(filters)];
  const q = useQuery({ queryKey: key, placeholderData: keepPreviousData, queryFn: () => rpc<{ total: number; rows: Row[] }>("list_responses", { p_form_id: form.id, p_filters: filters, p_sort: sort, p_limit: PAGE, p_offset: page * PAGE }) });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["responses", form.id] });
    qc.invalidateQueries({ queryKey: ["form", form.id] });
    setSel({});
  };
  const bulk = useMutation({
    mutationFn: async (op: "delete" | "reviewed" | "flag") => {
      const ids = Object.keys(sel).filter((k) => sel[k]);
      if (op === "delete") return rpc<number>("delete_responses", { p_form_id: form.id, p_ids: ids });
      return rpc<number>("update_responses_review", { p_form_id: form.id, p_ids: ids, p_review_status: op === "reviewed" ? "reviewed" : null, p_flagged: op === "flag" ? true : null, p_reason: op === "flag" ? "Flagged in bulk" : null });
    },
    onSuccess: (n, op) => {
      toast.success(`${n} response${n === 1 ? "" : "s"} ${op === "delete" ? "deleted" : "updated"}`);
      refresh();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const visibleQs = questions.slice(0, 6);
  const columns = useMemo(
    () => [
      ...(can("responses.manage") ? [col.display({ id: "sel", header: ({ table }) => <input type="checkbox" aria-label="Select all on this page" className="h-4 w-4 accent-brand" checked={table.getIsAllRowsSelected()} onChange={table.getToggleAllRowsSelectedHandler()} />, cell: ({ row }) => <input type="checkbox" aria-label="Select response" className="h-4 w-4 accent-brand" checked={row.getIsSelected()} onClick={(e) => e.stopPropagation()} onChange={row.getToggleSelectedHandler()} /> })] : []),
      col.accessor("submitted_at", { header: "Submitted", cell: (c) => <span className="whitespace-nowrap">{fmtDateTime(c.getValue())}</span> }),
      col.display({ id: "status", header: "Status", cell: ({ row }) => <span className="flex gap-1">{row.original.is_flagged && <Badge tone="red"><Flag /></Badge>}{row.original.review_status === "reviewed" && <Badge tone="green">Reviewed</Badge>}{row.original.review_status === "needs_review" && <Badge tone="amber">Review</Badge>}{row.original.review_status === "none" && !row.original.is_flagged && <span className="text-ink-subtle">—</span>}</span> }),
      ...visibleQs.map((qq) => col.display({ id: qq.id, header: () => <span className="block max-w-[180px] truncate" title={qq.title}>{qq.title || "Untitled"}</span>, cell: ({ row }) => <span className="block max-w-[220px] truncate" title={formatAnswer(qq, row.original.answers[qq.id], row.original.other[qq.id])}>{formatAnswer(qq, row.original.answers[qq.id], row.original.other[qq.id]) || <span className="text-ink-subtle">—</span>}</span> })),
    ],
    [visibleQs, can],
  );
  const table = useReactTable({ data: q.data?.rows ?? [], columns, getCoreRowModel: getCoreRowModel(), getRowId: (r) => r.id, state: { rowSelection: sel }, onRowSelectionChange: setSel, enableRowSelection: true });
  const total = q.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const selectedCount = Object.values(sel).filter(Boolean).length;
  const qsFilter = new URLSearchParams({ ...(filters.from ? { from: filters.from } : {}), ...(filters.to ? { to: filters.to } : {}), ...(fq && fv ? { answerQuestion: fq, answerValue: fv } : {}) });

  async function exportAs(fmt: "csv" | "xlsx") {
    setExporting(fmt);
    try {
      if (fmt === "csv") {
        const blob = await api<Blob>(`/forms/${form.id}/export?format=csv&${qsFilter}`);
        downloadBlob(blob, `${form.definition.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "responses"}.csv`);
      } else {
        const data = await api<{ title: string; header: string[]; rows: string[][] }>(`/forms/${form.id}/export?format=json&${qsFilter}`);
        downloadBlob(buildXlsx(data.title, data.header, data.rows), `${data.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "responses"}.xlsx`);
      }
      toast.success("Export ready");
    } catch (e) {
      toast.error(isPlanError(e) ? (e as Error).message : `Export failed: ${(e as Error).message}`);
    } finally {
      setExporting(null);
    }
  }

  const fQ = questions.find((x) => x.id === fq);
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <form className="relative flex-1" onSubmit={(e) => { e.preventDefault(); setApplied(search.trim()); setPage(0); }}>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
          <Input className="pl-9" placeholder="Search text answers and press Enter" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search responses" />
        </form>
        <div className="flex flex-wrap gap-2">
          <Button variant={showFilters ? "subtle" : "secondary"} onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters}><Filter /> Filters</Button>
          <Select className="w-36" value={sort} onChange={(e) => { setSort(e.target.value as typeof sort); setPage(0); }} aria-label="Sort"><option value="newest">Newest first</option><option value="oldest">Oldest first</option></Select>
          <Menu>
            <MenuTrigger asChild><Button variant="secondary" loading={!!exporting}><Download /> Export</Button></MenuTrigger>
            <MenuContent>
              <MenuItem onSelect={() => exportAs("csv")}><Download /> CSV (all matching)</MenuItem>
              <MenuItem onSelect={() => exportAs("xlsx")}><FileSpreadsheet /> Excel (.xlsx)</MenuItem>
            </MenuContent>
          </Menu>
        </div>
      </div>
      {showFilters && (
        <Card className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-xs font-medium text-ink-muted">From<Input type="date" className="mt-1" value={from} onChange={(e) => { setFrom(e.target.value); setPage(0); }} /></label>
          <label className="text-xs font-medium text-ink-muted">To<Input type="date" className="mt-1" value={to} onChange={(e) => { setTo(e.target.value); setPage(0); }} /></label>
          <label className="text-xs font-medium text-ink-muted">Review status<Select className="mt-1" value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }}><option value="">Any</option><option value="flagged">Flagged</option><option value="needs_review">Needs review</option><option value="reviewed">Reviewed</option></Select></label>
          <label className="text-xs font-medium text-ink-muted">Answer to<Select className="mt-1" value={fq} onChange={(e) => { setFq(e.target.value); setFv(""); setPage(0); }}><option value="">Any question</option>{filterable.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</Select></label>
          <label className="text-xs font-medium text-ink-muted">is<Select className="mt-1" value={fv} disabled={!fQ} onChange={(e) => { setFv(e.target.value); setPage(0); }}><option value="">Any answer</option>{fQ && (choiceOptions(fQ).length ? choiceOptions(fQ).map((o) => <option key={o.id} value={o.id}>{o.label}</option>) : Array.from({ length: (fQ.config.scaleMax ?? 5) - (fQ.config.scaleMin ?? 1) + 1 }, (_, i) => (fQ.config.scaleMin ?? 1) + i).map((n) => <option key={n} value={n}>{n}</option>))}</Select></label>
        </Card>
      )}
      {selectedCount > 0 && can("responses.manage") && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-navy px-4 py-2.5 text-sm text-white">
          <span className="mr-2 font-medium">{selectedCount} selected</span>
          <Button size="sm" variant="ghost" className="text-white hover:bg-white/10" onClick={() => bulk.mutate("reviewed")}><CheckCircle2 /> Mark reviewed</Button>
          <Button size="sm" variant="ghost" className="text-white hover:bg-white/10" onClick={() => bulk.mutate("flag")}><Flag /> Flag</Button>
          <ConfirmDialog title={`Delete ${selectedCount} response${selectedCount > 1 ? "s" : ""}?`} description="Deleted responses are removed from analytics and exports permanently." destructive confirmLabel="Delete" onConfirm={() => bulk.mutateAsync("delete")} trigger={<Button size="sm" variant="ghost" className="text-red-200 hover:bg-white/10"><Trash2 /> Delete</Button>} />
          <button className="ml-auto text-xs underline" onClick={() => setSel({})}>Clear selection</button>
        </div>
      )}
      {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {q.isLoading ? <Skeleton className="h-96 rounded-xl" /> : total === 0 ? (
        <EmptyState icon={<Inbox />} title={form.responseCount ? "No responses match these filters" : "No responses yet"} description={form.responseCount ? "Adjust your search or filters." : form.status === "published" ? "Share your form link to start collecting responses." : "Publish your form to start collecting responses."} />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
                {table.getHeaderGroups().map((hg) => <tr key={hg.id}>{hg.headers.map((h) => <th key={h.id} className="whitespace-nowrap px-4 py-3 font-medium">{flexRender(h.column.columnDef.header, h.getContext())}</th>)}</tr>)}
              </thead>
              <tbody className={cn("divide-y divide-line", q.isFetching && "opacity-60")}>
                {table.getRowModel().rows.map((r) => (
                  <tr key={r.id} tabIndex={0} onClick={() => setOpen(r.id)} onKeyDown={(e) => e.key === "Enter" && setOpen(r.id)} className={cn("cursor-pointer hover:bg-brand-50/40 focus:bg-brand-50/60 focus:outline-none", r.getIsSelected() && "bg-brand-50/60")}>
                    {r.getVisibleCells().map((c) => <td key={c.id} className="px-4 py-3 text-navy">{flexRender(c.column.columnDef.cell, c.getContext())}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm text-ink-muted">
            <span>{fmtNumber(page * PAGE + 1)}–{fmtNumber(Math.min(total, (page + 1) * PAGE))} of {fmtNumber(total)}{questions.length > visibleQs.length && ` · showing ${visibleQs.length} of ${questions.length} questions (open a response to see all)`}</span>
            <div className="flex gap-1">
              <Button variant="secondary" size="icon-sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)} aria-label="Previous page"><ChevronLeft /></Button>
              <Button variant="secondary" size="icon-sm" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)} aria-label="Next page"><ChevronRight /></Button>
            </div>
          </div>
        </Card>
      )}
      {open && <ResponseDrawer id={open} questions={questions} onClose={() => setOpen(null)} canManage={can("responses.manage")} onChanged={() => qc.invalidateQueries({ queryKey: ["responses", form.id] })} />}
    </div>
  );
}
