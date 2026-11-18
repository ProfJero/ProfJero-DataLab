import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Activity, ArrowDownRight, ArrowUpRight, BarChart3, FilePlus2, FileText, Inbox, LayoutTemplate, Radio, Sparkles, FileBarChart } from "lucide-react";
import { REPORT_TYPE_LABELS, type Entitlements, type ReportType } from "@datalab/shared";
import { Card, CardHeader, EmptyState, ErrorState, Progress, Skeleton, Stat } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { TrendChart } from "@/components/charts/Charts";
import { rpc } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { cn, fmtNumber, STATUS_STYLES, timeAgo } from "@/lib/utils";

interface DashboardData {
  totalForms: number;
  activeForms: number;
  draftForms: number;
  totalResponses: number;
  responsesLast30: number;
  responsesPrev30: number;
  trend: { day: string; count: number }[];
  topForms: { id: string; title: string; status: string; recent: number; total: number }[];
  drafts: { id: string; title: string; updated_at: string }[];
  recentReports: { id: string; title: string; type: string; updated_at: string }[];
  recentActivity: { action: string; details: Record<string, unknown>; created_at: string; actor: string | null }[];
  entitlements: Entitlements;
}

const ACTIVITY: Record<string, string> = {
  "form.created": "created a form",
  "form.status_changed": "changed a form's status",
  "form.publication_updated": "updated sharing settings",
  "member.invited": "invited a team member",
  "member.joined": "joined the workspace",
  "member.role_changed": "changed a member's role",
  "member.removed": "removed a member",
  "responses.deleted": "deleted responses",
  "workspace.created": "created the workspace",
  "workspace.ownership_transferred": "transferred ownership",
};

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default function Dashboard() {
  const { profile } = useAuth();
  const { current, can } = useWorkspace();
  const q = useQuery({ queryKey: ["dashboard", current?.id], queryFn: () => rpc<DashboardData>("dashboard_stats", { p_workspace_id: current!.id }) });
  const d = q.data;
  const delta = d && d.responsesPrev30 > 0 ? Math.round(((d.responsesLast30 - d.responsesPrev30) / d.responsesPrev30) * 100) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-ink-muted">{greeting()},</p>
          <h1 className="text-2xl font-semibold">{profile?.full_name?.split(" ")[0] ?? "there"} — here's {current?.name}</h1>
        </div>
        {can("forms.edit") && (
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="secondary"><Link to="/app/templates"><LayoutTemplate /> Templates</Link></Button>
            <Button asChild><Link to="/app/forms/new"><FilePlus2 /> Create a form</Link></Button>
          </div>
        )}
      </div>

      {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} />}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {!d ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[118px] rounded-xl" />)
        ) : (
          <>
            <Stat label="Total forms" value={fmtNumber(d.totalForms)} hint={`${d.draftForms} draft${d.draftForms === 1 ? "" : "s"}`} icon={<FileText />} />
            <Stat label="Active forms" value={fmtNumber(d.activeForms)} hint="Published and collecting" icon={<Radio />} tone="green" />
            <Stat label="Total responses" value={fmtNumber(d.totalResponses)} hint="Across all forms" icon={<Inbox />} tone="navy" />
            <Stat
              label="Last 30 days"
              value={fmtNumber(d.responsesLast30)}
              icon={<Activity />}
              tone="amber"
              hint={delta === null ? "No data for the previous 30 days" : <span className={cn("inline-flex items-center gap-0.5 font-medium", delta >= 0 ? "text-insight-600" : "text-red-600")}>{delta >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}{Math.abs(delta)}% vs previous 30 days</span>}
            />
          </>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Response trend" description="Daily responses over the last 30 days" />
          <div className="p-5">{!d ? <Skeleton className="h-[220px]" /> : d.totalResponses === 0 ? <EmptyState className="border-0 py-10" icon={<BarChart3 />} title="No responses yet" description="Publish a form and share its link — responses will appear here in real time." /> : <TrendChart data={d.trend} />}</div>
        </Card>
        <Card>
          <CardHeader title="Quick actions" />
          <div className="grid gap-2 p-4">
            {[
              { to: "/app/forms/new", icon: FilePlus2, label: "Create a form", show: can("forms.edit") },
              { to: "/app/forms/new?mode=ai", icon: Sparkles, label: "Draft a survey with AI", show: can("forms.edit") },
              { to: "/app/forms", icon: Inbox, label: "View responses", show: true },
              { to: d?.topForms[0] ? `/app/forms/${d.topForms[0].id}/analytics` : "/app/forms", icon: BarChart3, label: "View analytics", show: true },
              { to: "/app/reports", icon: FileBarChart, label: "Generate a report", show: can("reports.edit") },
            ].filter((a) => a.show).map((a) => (
              <Link key={a.label} to={a.to} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2.5 text-sm font-medium text-navy transition hover:border-brand-200 hover:bg-brand-50/50">
                <span className="rounded-md bg-brand-50 p-1.5 text-brand"><a.icon className="h-4 w-4" /></span>
                {a.label}
              </Link>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Most active forms" description="By responses in the last 30 days" />
          <ul className="divide-y divide-line">
            {d?.topForms.length === 0 && <li className="px-5 py-8 text-center text-sm text-ink-muted">No published forms yet.</li>}
            {d?.topForms.map((f) => (
              <li key={f.id}>
                <Link to={`/app/forms/${f.id}/analytics`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50">
                  <span className="min-w-0"><span className="block truncate text-sm font-medium text-navy">{f.title}</span><span className={cn("mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium capitalize", STATUS_STYLES[f.status])}>{f.status}</span></span>
                  <span className="text-right text-sm tabular-nums"><span className="font-semibold text-navy">{fmtNumber(f.recent)}</span><span className="block text-xs text-ink-muted">{fmtNumber(f.total)} total</span></span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Drafts" description="Pick up where you left off" />
          <ul className="divide-y divide-line">
            {d?.drafts.length === 0 && <li className="px-5 py-8 text-center text-sm text-ink-muted">No drafts.</li>}
            {d?.drafts.map((f) => (
              <li key={f.id}><Link to={`/app/forms/${f.id}/edit`} className="block px-5 py-3 hover:bg-slate-50"><span className="block truncate text-sm font-medium text-navy">{f.title}</span><span className="text-xs text-ink-muted">Edited {timeAgo(f.updated_at)}</span></Link></li>
            ))}
          </ul>
          <div className="border-t border-line px-5 py-3"><p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">Recent reports</p>
            {d?.recentReports.length === 0 && <p className="text-sm text-ink-muted">No reports yet.</p>}
            {d?.recentReports.map((r) => <Link key={r.id} to={`/app/reports/${r.id}`} className="block truncate py-1 text-sm text-brand hover:underline">{r.title} <span className="text-ink-muted">· {REPORT_TYPE_LABELS[r.type as ReportType]}</span></Link>)}
          </div>
        </Card>
        <Card>
          <CardHeader title="Usage this month" description={d ? `${d.entitlements.plan_name} plan` : undefined} action={<Link to="/app/settings/billing" className="text-xs font-medium text-brand">Details</Link>} />
          <div className="space-y-4 p-5">
            {d && ([["Responses", "responses_per_month"], ["Forms", "forms"], ["AI credits", "ai_credits_per_month"], ["Exports", "exports_per_month"]] as const).map(([label, key]) => {
              const lim = d.entitlements.limits[key];
              const used = Number(d.entitlements.usage[key] ?? 0);
              return (
                <div key={key}>
                  <div className="mb-1 flex justify-between text-sm"><span className="text-navy">{label}</span><span className="tabular-nums text-ink-muted">{fmtNumber(used)} / {lim === null || lim === undefined ? "Unlimited" : fmtNumber(lim)}</span></div>
                  <Progress value={lim ? (used / lim) * 100 : 0} tone={lim && used / lim > 0.9 ? "amber" : "brand"} />
                </div>
              );
            })}
          </div>
          <div className="border-t border-line px-5 py-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">Recent activity</p>
            <ul className="space-y-1.5">
              {d?.recentActivity.length === 0 && <li className="text-sm text-ink-muted">No activity yet.</li>}
              {d?.recentActivity.slice(0, 5).map((a, i) => (
                <li key={i} className="text-sm"><span className="font-medium text-navy">{a.actor ?? "Someone"}</span> <span className="text-ink-muted">{ACTIVITY[a.action] ?? a.action}{a.details?.title ? ` “${String(a.details.title)}”` : ""} · {timeAgo(a.created_at)}</span></li>
              ))}
            </ul>
          </div>
        </Card>
      </div>
    </div>
  );
}
