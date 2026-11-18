import { Link, NavLink, Outlet, useOutletContext, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Edit3, Eye, Inbox, Share2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState, Skeleton } from "@/components/ui/misc";
import { getForm, type FormDetail } from "@/lib/forms";
import { useWorkspace } from "@/hooks/useWorkspace";
import { cn, fmtNumber, STATUS_STYLES } from "@/lib/utils";

export function useFormContext() {
  return useOutletContext<{ form: FormDetail; refetch: () => void }>();
}

export default function FormLayout() {
  const { id = "" } = useParams();
  const { can } = useWorkspace();
  const q = useQuery({ queryKey: ["form", id], queryFn: () => getForm(id) });
  if (q.isLoading) return <div className="space-y-4"><Skeleton className="h-16" /><Skeleton className="h-96" /></div>;
  if (q.isError || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const f = q.data;
  const tabs = [
    { to: "responses", label: "Responses", icon: Inbox, count: f.responseCount },
    { to: "analytics", label: "Analytics", icon: BarChart3 },
    { to: "ai", label: "AI Analyst", icon: Sparkles, show: can("analytics.run") },
    { to: "share", label: "Share & settings", icon: Share2 },
  ].filter((t) => t.show !== false);
  return (
    <div>
      <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <Link to="/app/forms" className="text-xs font-medium text-ink-muted hover:text-navy">← All forms</Link>
          <h1 className="mt-1 truncate text-2xl font-semibold">{f.definition.title}</h1>
          <div className="mt-1.5 flex items-center gap-2 text-sm text-ink-muted"><span className={cn("rounded-full px-2 py-0.5 text-xs font-medium capitalize", STATUS_STYLES[f.status])}>{f.status}</span>{fmtNumber(f.responseCount)} responses</div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" asChild><Link to={`/app/forms/${f.id}/preview`}><Eye /> Preview</Link></Button>
          {can("forms.edit") && <Button size="sm" asChild><Link to={`/app/forms/${f.id}/edit`}><Edit3 /> Edit form</Link></Button>}
        </div>
      </div>
      <nav className="-mx-4 mb-6 flex gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0" aria-label="Form sections">
        {tabs.map((t) => (
          <NavLink key={t.to} to={t.to} className={({ isActive }) => cn("-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition", isActive ? "border-brand text-brand" : "border-transparent text-ink-muted hover:text-navy")}>
            <t.icon className="h-4 w-4" /> {t.label}{t.count !== undefined && <span className="rounded-full bg-slate-100 px-1.5 text-xs text-ink-muted">{fmtNumber(t.count)}</span>}
          </NavLink>
        ))}
      </nav>
      <Outlet context={{ form: f, refetch: () => q.refetch() }} />
    </div>
  );
}
