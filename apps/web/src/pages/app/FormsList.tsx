import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Archive, BarChart3, Copy, Edit3, ExternalLink, FilePlus2, FileText, Inbox, Lock, MoreHorizontal, RotateCcw, Search, Share2, Trash2, Unlock } from "lucide-react";
import type { FormStatus } from "@datalab/shared";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Card, EmptyState, ErrorState, PageHeader, Skeleton } from "@/components/ui/misc";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { ConfirmDialog } from "@/components/ui/dialog";
import { dbMessage, supabase } from "@/lib/supabase";
import { duplicateForm, setStatus } from "@/lib/forms";
import { useWorkspace } from "@/hooks/useWorkspace";
import { cn, fmtNumber, STATUS_STYLES, timeAgo } from "@/lib/utils";

interface Row { id: string; title: string; status: FormStatus; slug: string; response_count: number; updated_at: string; last_response_at: string | null; created_by: string | null }

export default function FormsList() {
  const { current, can } = useWorkspace();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [search, setSearch] = useState("");
  const [status, setStatusFilter] = useState<"active" | FormStatus>("active");
  const q = useQuery({
    queryKey: ["forms", current?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("forms").select("id,title,status,slug,response_count,updated_at,last_response_at,created_by").eq("workspace_id", current!.id).order("updated_at", { ascending: false }).limit(500);
      if (error) throw new Error(dbMessage(error));
      return data as Row[];
    },
  });
  const rows = useMemo(() => (q.data ?? []).filter((f) => (status === "active" ? f.status !== "archived" : f.status === status) && f.title.toLowerCase().includes(search.toLowerCase())), [q.data, search, status]);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["forms"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["entitlements"] });
  };
  const act = useMutation({
    mutationFn: async ({ id, op }: { id: string; op: "duplicate" | FormStatus | "delete" }) => {
      if (op === "duplicate") return duplicateForm(id);
      if (op === "delete") {
        const { error } = await supabase.from("forms").delete().eq("id", id);
        if (error) throw new Error(dbMessage(error));
        return null;
      }
      return setStatus(id, op);
    },
    onSuccess: (res, v) => {
      refresh();
      const msgs: Record<string, string> = { duplicate: "Form duplicated", delete: "Form deleted", published: "Form published", closed: "Form closed", archived: "Form archived", draft: "Form restored to draft" };
      toast.success(msgs[v.op]);
      if (v.op === "duplicate" && typeof res === "string") nav(`/app/forms/${res}/edit`);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div>
      <PageHeader title="Forms & surveys" description="Create, publish and manage your data collection." actions={can("forms.edit") && <Button asChild><Link to="/app/forms/new"><FilePlus2 /> New form</Link></Button>} />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
          <Input className="pl-9" placeholder="Search forms" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search forms" />
        </div>
        <Select className="sm:w-48" value={status} onChange={(e) => setStatusFilter(e.target.value as typeof status)} aria-label="Filter by status">
          <option value="active">All (not archived)</option>
          <option value="draft">Drafts</option>
          <option value="published">Published</option>
          <option value="closed">Closed</option>
          <option value="archived">Archived</option>
        </Select>
      </div>
      {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {q.isLoading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
      ) : rows.length === 0 ? (
        <EmptyState icon={<FileText />} title={q.data?.length ? "No forms match your filters" : "Create your first form"} description={q.data?.length ? "Try a different search or status." : "Start from scratch, pick a template, or let AI draft a survey for you."} action={can("forms.edit") && !q.data?.length && <Button asChild><Link to="/app/forms/new"><FilePlus2 /> New form</Link></Button>} />
      ) : (
        <Card className="divide-y divide-line overflow-hidden">
          {rows.map((f) => (
            <div key={f.id} className="flex items-center gap-4 px-4 py-3.5 hover:bg-slate-50/70 sm:px-5">
              <div className="hidden rounded-lg bg-brand-50 p-2.5 text-brand sm:block"><FileText className="h-5 w-5" /></div>
              <Link to={f.status === "draft" ? `/app/forms/${f.id}/edit` : `/app/forms/${f.id}/responses`} className="min-w-0 flex-1">
                <p className="truncate font-medium text-navy">{f.title}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
                  <span className={cn("rounded-full px-2 py-0.5 font-medium capitalize", STATUS_STYLES[f.status])}>{f.status}</span>
                  <span>Edited {timeAgo(f.updated_at)}</span>
                  {f.last_response_at && <span className="hidden sm:inline">Last response {timeAgo(f.last_response_at)}</span>}
                </p>
              </Link>
              <div className="hidden text-right sm:block"><p className="font-semibold tabular-nums text-navy">{fmtNumber(f.response_count)}</p><p className="text-xs text-ink-muted">responses</p></div>
              <div className="flex items-center gap-1">
                {can("forms.edit") && <Button variant="ghost" size="icon-sm" asChild aria-label="Edit form"><Link to={`/app/forms/${f.id}/edit`}><Edit3 /></Link></Button>}
                <Menu>
                  <MenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="More actions"><MoreHorizontal /></Button></MenuTrigger>
                  <MenuContent>
                    <MenuItem onSelect={() => nav(`/app/forms/${f.id}/responses`)}><Inbox /> Responses</MenuItem>
                    <MenuItem onSelect={() => nav(`/app/forms/${f.id}/analytics`)}><BarChart3 /> Analytics</MenuItem>
                    <MenuItem onSelect={() => nav(`/app/forms/${f.id}/share`)}><Share2 /> Share</MenuItem>
                    {f.status !== "draft" && <MenuItem onSelect={() => window.open(`/f/${f.slug}`, "_blank", "noopener")}><ExternalLink /> Open public form</MenuItem>}
                    {can("forms.edit") && (
                      <>
                        <MenuSeparator />
                        <MenuItem onSelect={() => act.mutate({ id: f.id, op: "duplicate" })}><Copy /> Duplicate</MenuItem>
                        {f.status === "published" && <MenuItem onSelect={() => act.mutate({ id: f.id, op: "closed" })}><Lock /> Close form</MenuItem>}
                        {f.status === "closed" && <MenuItem onSelect={() => act.mutate({ id: f.id, op: "published" })}><Unlock /> Reopen form</MenuItem>}
                        {f.status !== "archived" ? <MenuItem onSelect={() => act.mutate({ id: f.id, op: "archived" })}><Archive /> Archive</MenuItem> : <MenuItem onSelect={() => act.mutate({ id: f.id, op: "draft" })}><RotateCcw /> Restore</MenuItem>}
                      </>
                    )}
                  </MenuContent>
                </Menu>
                {(can("workspace.manage") || (can("forms.edit") && f.created_by)) && (
                  <ConfirmDialog
                    title="Delete this form?"
                    description={<>“{f.title}” and all of its <strong>{fmtNumber(f.response_count)} responses</strong> will be permanently deleted. This cannot be undone.</>}
                    confirmLabel="Delete form"
                    destructive
                    onConfirm={() => act.mutateAsync({ id: f.id, op: "delete" })}
                    trigger={<Button variant="ghost" size="icon-sm" aria-label="Delete form" className="text-ink-muted hover:text-red-600"><Trash2 /></Button>}
                  />
                )}
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
