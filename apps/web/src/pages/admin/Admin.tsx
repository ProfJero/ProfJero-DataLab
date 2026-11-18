import { useState } from "react";
import { Link, NavLink, Route, Routes } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Activity, ArrowLeft, Bot, Building2, CreditCard, Flag, Gauge, HeartPulse, ScrollText, Settings, Users } from "lucide-react";
import { FEATURE_KEYS, FEATURE_LABELS, LIMIT_KEYS, LIMIT_LABELS } from "@datalab/shared";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Badge, Card, CardHeader, ErrorState, PageHeader, Skeleton, Stat } from "@/components/ui/misc";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ColumnChart, TrendChart } from "@/components/charts/Charts";
import { rpc, supabase } from "@/lib/supabase";
import { cn, fmtDate, fmtDateTime, fmtMoney, fmtNumber } from "@/lib/utils";
import type { Plan } from "../app/settings/Billing";

const NAV = [
  { to: "/admin", label: "Overview", icon: Gauge, end: true },
  { to: "/admin/users", label: "Users", icon: Users },
  { to: "/admin/workspaces", label: "Workspaces", icon: Building2 },
  { to: "/admin/plans", label: "Plans", icon: CreditCard },
  { to: "/admin/ai", label: "AI consumption", icon: Bot },
  { to: "/admin/audit", label: "Audit log", icon: ScrollText },
  { to: "/admin/abuse", label: "Abuse reports", icon: Flag },
  { to: "/admin/health", label: "System health", icon: HeartPulse },
  { to: "/admin/settings", label: "Platform settings", icon: Settings },
];

const useRpc = <T,>(key: unknown[], fn: string, args?: Record<string, unknown>) => useQuery({ queryKey: ["admin", ...key], queryFn: () => rpc<T>(fn, args) });

function Overview() {
  const q = useRpc<Record<string, number> & { planDistribution: { plan: string; count: number }[]; signupsDaily: { day: string; count: number }[]; submissionsDaily: { day: string; count: number }[] }>(["overview"], "admin_overview");
  if (q.isError) return <ErrorState error={q.error} />;
  const d = q.data;
  return (
    <div className="space-y-6">
      <PageHeader title="Platform overview" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {!d ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />) : (
          <>
            <Stat label="Users" value={fmtNumber(d.users)} hint={`+${fmtNumber(d.usersLast30)} in 30 days`} icon={<Users />} />
            <Stat label="Workspaces" value={fmtNumber(d.workspaces)} icon={<Building2 />} tone="navy" />
            <Stat label="Forms" value={fmtNumber(d.forms)} hint={`${fmtNumber(d.publishedForms)} published`} icon={<Activity />} tone="green" />
            <Stat label="Submissions" value={fmtNumber(d.submissions)} hint={`${fmtNumber(d.submissionsLast30)} in 30 days`} icon={<Activity />} tone="amber" />
            <Stat label="AI requests (30d)" value={fmtNumber(d.aiRequestsLast30)} hint={`${fmtNumber(d.aiFailuresLast30)} failed · ${fmtNumber(d.aiTokensLast30)} tokens`} icon={<Bot />} />
            <Stat label="Open abuse reports" value={fmtNumber(d.openAbuseReports)} icon={<Flag />} tone="amber" />
            <Stat label="Errors (24h)" value={fmtNumber(d.errorsLast24h)} icon={<HeartPulse />} tone="navy" />
            <Stat label="Suspended / deletion requests" value={`${d.suspendedUsers} / ${d.deletionRequests}`} icon={<Users />} tone="green" />
          </>
        )}
      </div>
      {d && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card><CardHeader title="New users (30 days)" /><div className="p-5"><TrendChart data={d.signupsDaily} label="Sign-ups" /></div></Card>
          <Card><CardHeader title="Submissions (30 days)" /><div className="p-5"><TrendChart data={d.submissionsDaily} /></div></Card>
          <Card><CardHeader title="Plan distribution" /><div className="p-5"><ColumnChart data={d.planDistribution.map((p) => ({ x: p.plan, count: p.count }))} valueLabel="Workspaces" /></div></Card>
        </div>
      )}
    </div>
  );
}

function UsersPage() {
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState("");
  const qc = useQueryClient();
  const q = useRpc<{ total: number; rows: { id: string; email: string; full_name: string | null; account_status: string; created_at: string; deletion_requested_at: string | null; is_platform_admin: boolean; workspaces: number; forms: number; last_activity: string | null; intended_use: string | null }[] }>(["users", applied], "admin_list_users", { p_search: applied || null, p_limit: 100, p_offset: 0 });
  const set = useMutation({ mutationFn: (v: { id: string; status: string; reason: string }) => rpc("admin_set_user_status", { p_user_id: v.id, p_status: v.status, p_reason: v.reason }), onSuccess: () => { toast.success("Account status updated"); qc.invalidateQueries({ queryKey: ["admin", "users"] }); }, onError: (e) => toast.error((e as Error).message) });
  return (
    <div>
      <PageHeader title="Users" description={q.data ? `${fmtNumber(q.data.total)} registered users` : undefined} />
      <form className="mb-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); setApplied(search.trim()); }}><Input placeholder="Search by name or email" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search users" /><Button type="submit" variant="secondary">Search</Button></form>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-ink-muted"><tr><th className="px-4 py-3">User</th><th className="px-4 py-3">Use</th><th className="px-4 py-3">Workspaces</th><th className="px-4 py-3">Forms</th><th className="px-4 py-3">Joined</th><th className="px-4 py-3">Status</th><th className="px-4 py-3" /></tr></thead>
          <tbody className="divide-y divide-line">
            {(q.data?.rows ?? []).map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-3"><p className="font-medium text-navy">{u.full_name || "—"} {u.is_platform_admin && <Badge tone="navy">Admin</Badge>}</p><p className="text-xs text-ink-muted">{u.email}</p></td>
                <td className="px-4 py-3 capitalize text-ink-muted">{u.intended_use ?? "—"}</td>
                <td className="px-4 py-3 tabular-nums">{u.workspaces}</td>
                <td className="px-4 py-3 tabular-nums">{u.forms}</td>
                <td className="px-4 py-3 text-ink-muted">{fmtDate(u.created_at)}</td>
                <td className="px-4 py-3"><Badge tone={u.account_status === "active" ? "green" : "red"}>{u.account_status}</Badge>{u.deletion_requested_at && <Badge tone="amber" className="ml-1">Deletion requested</Badge>}</td>
                <td className="px-4 py-3 text-right">{!u.is_platform_admin && (u.account_status === "active" ? <Button size="sm" variant="danger-ghost" onClick={() => { const reason = window.prompt("Reason for suspension (shown to the user):"); if (reason !== null) set.mutate({ id: u.id, status: "suspended", reason }); }}>Suspend</Button> : <Button size="sm" variant="secondary" onClick={() => set.mutate({ id: u.id, status: "active", reason: "Reactivated by platform administrator" })}>Reactivate</Button>)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function WorkspacesPage() {
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState("");
  const [assign, setAssign] = useState<{ id: string; name: string } | null>(null);
  const [plan, setPlan] = useState("pro");
  const [until, setUntil] = useState("");
  const [note, setNote] = useState("");
  const qc = useQueryClient();
  const plans = useQuery({ queryKey: ["admin", "plans-all"], queryFn: async () => ((await supabase.from("subscription_plans").select("*").order("sort_order")).data ?? []) as Plan[] });
  const q = useRpc<{ total: number; rows: { id: string; name: string; slug: string; is_demo: boolean; created_at: string; owner_email: string; plan_name: string; plan_code: string; subscription_status: string; provider: string; current_period_end: string | null; members: number; forms: number; submissions: number; ai_credits_month: number }[] }>(["workspaces", applied], "admin_list_workspaces", { p_search: applied || null, p_limit: 100, p_offset: 0 });
  return (
    <div>
      <PageHeader title="Workspaces & subscriptions" description={q.data ? `${fmtNumber(q.data.total)} workspaces` : undefined} />
      <form className="mb-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); setApplied(search.trim()); }}><Input placeholder="Search workspaces" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search workspaces" /><Button type="submit" variant="secondary">Search</Button></form>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-ink-muted"><tr><th className="px-4 py-3">Workspace</th><th className="px-4 py-3">Plan</th><th className="px-4 py-3">Members</th><th className="px-4 py-3">Forms</th><th className="px-4 py-3">Responses</th><th className="px-4 py-3">AI credits (month)</th><th className="px-4 py-3" /></tr></thead>
          <tbody className="divide-y divide-line">
            {(q.data?.rows ?? []).map((w) => (
              <tr key={w.id}>
                <td className="px-4 py-3"><p className="font-medium text-navy">{w.name} {w.is_demo && <Badge tone="amber">Demo</Badge>}</p><p className="text-xs text-ink-muted">{w.owner_email} · {fmtDate(w.created_at)}</p></td>
                <td className="px-4 py-3"><Badge tone="brand">{w.plan_name}</Badge><p className="mt-1 text-xs text-ink-muted">{w.provider}{w.current_period_end ? ` · until ${fmtDate(w.current_period_end)}` : ""}</p></td>
                <td className="px-4 py-3 tabular-nums">{w.members}</td><td className="px-4 py-3 tabular-nums">{w.forms}</td><td className="px-4 py-3 tabular-nums">{fmtNumber(w.submissions)}</td><td className="px-4 py-3 tabular-nums">{fmtNumber(w.ai_credits_month)}</td>
                <td className="px-4 py-3 text-right"><Button size="sm" variant="secondary" onClick={() => { setAssign({ id: w.id, name: w.name }); setPlan(w.plan_code); }}>Change plan</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Dialog open={!!assign} onOpenChange={(o) => !o && setAssign(null)}>
        <DialogContent title={`Assign plan — ${assign?.name}`} description="Manual assignment (e.g. invoice or bank transfer). Recorded in the audit log.">
          <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); try { await rpc("admin_assign_plan", { p_workspace_id: assign!.id, p_plan_code: plan, p_period_end: until ? new Date(until).toISOString() : null, p_note: note || null }); toast.success("Plan assigned"); setAssign(null); qc.invalidateQueries({ queryKey: ["admin", "workspaces"] }); } catch (er) { toast.error((er as Error).message); } }}>
            <Field label="Plan">{(id) => <Select id={id} value={plan} onChange={(e) => setPlan(e.target.value)}>{(plans.data ?? []).filter((p) => (p as unknown as { is_active: boolean }).is_active).map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}</Select>}</Field>
            <Field label="Active until (optional)" hint="Leave empty for no expiry.">{(id) => <Input id={id} type="date" value={until} onChange={(e) => setUntil(e.target.value)} />}</Field>
            <Field label="Internal note">{(id) => <Input id={id} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Invoice #123 paid by bank transfer" />}</Field>
            <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setAssign(null)}>Cancel</Button><Button type="submit">Assign plan</Button></div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PlansPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin", "plans-all"], queryFn: async () => ((await supabase.from("subscription_plans").select("*").order("sort_order")).data ?? []) as (Plan & { is_active: boolean; is_public: boolean })[] });
  const [edit, setEdit] = useState<(Plan & { is_active: boolean; is_public: boolean }) | null>(null);
  return (
    <div>
      <PageHeader title="Plans & entitlements" description="Limits and features are read from these plans everywhere in the product — nothing is hard-coded." actions={<Button onClick={() => setEdit({ id: "", code: "", name: "", description: "", price_monthly_minor: 0, price_yearly_minor: 0, currency: "GHS", features: {}, limits: {}, sort_order: 10, is_active: true, is_public: true })}>New plan</Button>} />
      <div className="grid gap-4 md:grid-cols-2">
        {(q.data ?? []).map((p) => (
          <Card key={p.id} className="p-5">
            <div className="flex items-center justify-between"><h3 className="font-semibold text-navy">{p.name} <span className="text-xs font-normal text-ink-muted">({p.code})</span></h3><div className="flex gap-1">{!p.is_active && <Badge tone="red">Inactive</Badge>}{!p.is_public && <Badge>Hidden</Badge>}</div></div>
            <p className="mt-1 text-sm text-ink-muted">{fmtMoney(p.price_monthly_minor, p.currency)}/month · {fmtMoney(p.price_yearly_minor, p.currency)}/year</p>
            <p className="mt-3 text-xs text-ink-muted">{LIMIT_KEYS.map((k) => `${LIMIT_LABELS[k]}: ${p.limits[k] ?? "∞"}`).join(" · ")}</p>
            <Button size="sm" variant="secondary" className="mt-4" onClick={() => setEdit(p)}>Edit</Button>
          </Card>
        ))}
      </div>
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        {edit && (
          <DialogContent title={edit.id ? `Edit ${edit.name}` : "New plan"} wide>
            <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); try { await rpc("admin_upsert_plan", { p_plan: edit }); toast.success("Plan saved"); setEdit(null); qc.invalidateQueries({ queryKey: ["admin", "plans-all"] }); qc.invalidateQueries({ queryKey: ["plans"] }); } catch (er) { toast.error((er as Error).message); } }}>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Code">{(id) => <Input id={id} value={edit.code} disabled={!!edit.id} pattern="[a-z0-9_]{2,40}" onChange={(e) => setEdit({ ...edit, code: e.target.value })} required />}</Field>
                <Field label="Name">{(id) => <Input id={id} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} required />}</Field>
                <Field label="Currency">{(id) => <Input id={id} value={edit.currency} maxLength={3} onChange={(e) => setEdit({ ...edit, currency: e.target.value.toUpperCase() })} />}</Field>
                <Field label="Monthly price (minor units)" hint="e.g. 9900 = 99.00">{(id) => <Input id={id} type="number" min={0} value={edit.price_monthly_minor ?? ""} onChange={(e) => setEdit({ ...edit, price_monthly_minor: e.target.value === "" ? null : Number(e.target.value) })} />}</Field>
                <Field label="Yearly price (minor units)">{(id) => <Input id={id} type="number" min={0} value={edit.price_yearly_minor ?? ""} onChange={(e) => setEdit({ ...edit, price_yearly_minor: e.target.value === "" ? null : Number(e.target.value) })} />}</Field>
                <Field label="Sort order">{(id) => <Input id={id} type="number" value={edit.sort_order} onChange={(e) => setEdit({ ...edit, sort_order: Number(e.target.value) })} />}</Field>
              </div>
              <Field label="Description">{(id) => <Textarea id={id} value={edit.description ?? ""} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />}</Field>
              <div><p className="label mb-2">Limits (empty = unlimited)</p><div className="grid gap-3 sm:grid-cols-4">{LIMIT_KEYS.map((k) => <Field key={k} label={<span className="text-xs">{LIMIT_LABELS[k]}</span>}>{(id) => <Input id={id} type="number" min={0} value={edit.limits[k] ?? ""} onChange={(e) => setEdit({ ...edit, limits: { ...edit.limits, [k]: e.target.value === "" ? null : Number(e.target.value) } })} />}</Field>)}</div></div>
              <div><p className="label mb-2">Features</p><div className="grid gap-2 sm:grid-cols-2">{FEATURE_KEYS.map((f) => <label key={f} className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-brand" checked={!!edit.features[f]} onChange={(e) => setEdit({ ...edit, features: { ...edit.features, [f]: e.target.checked } })} />{FEATURE_LABELS[f]}</label>)}</div></div>
              <div className="flex gap-6"><label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-brand" checked={edit.is_active} onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })} /> Active</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-brand" checked={edit.is_public} onChange={(e) => setEdit({ ...edit, is_public: e.target.checked })} /> Shown on pricing page</label></div>
              <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button type="submit">Save plan</Button></div>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

function AiPage() {
  const q = useRpc<{ daily: { day: string; requests: number; tokens: number; failures: number }[]; byFeature: { feature: string; requests: number; credits: number }[]; byModel: { provider: string; model: string; requests: number; tokens: number }[]; topWorkspaces: { workspace: string; requests: number; credits: number }[]; errors: { code: string; count: number }[] }>(["ai"], "admin_ai_usage", { p_days: 30 });
  const d = q.data;
  return (
    <div className="space-y-6">
      <PageHeader title="AI consumption" description="Last 30 days, recorded for every AI request (successful or not)." />
      {d && <Card><CardHeader title="Requests per day" /><div className="p-5"><TrendChart data={d.daily.map((x) => ({ day: x.day, count: x.requests }))} label="Requests" /></div></Card>}
      <div className="grid gap-6 lg:grid-cols-2">
        {([["By feature", d?.byFeature.map((x) => [x.feature, x.requests, x.credits])], ["By model", d?.byModel.map((x) => [`${x.provider} · ${x.model}`, x.requests, x.tokens])], ["Top workspaces", d?.topWorkspaces.map((x) => [x.workspace, x.requests, x.credits])], ["Errors", d?.errors.map((x) => [x.code, x.count, ""])]] as const).map(([title, rows]) => (
          <Card key={title}><CardHeader title={title} /><ul className="divide-y divide-line text-sm">{(rows ?? []).map((r, i) => <li key={i} className="flex justify-between px-5 py-2.5"><span className="truncate">{r[0]}</span><span className="tabular-nums text-ink-muted">{fmtNumber(Number(r[1]))}{r[2] !== "" ? ` · ${fmtNumber(Number(r[2]))}` : ""}</span></li>)}{(rows ?? []).length === 0 && <li className="px-5 py-6 text-center text-ink-muted">No data</li>}</ul></Card>
        ))}
      </div>
    </div>
  );
}

function AuditPage() {
  const [platform, setPlatform] = useState(false);
  const q = useRpc<{ id: number; action: string; target_type: string; target_id: string; details: Record<string, unknown>; is_platform: boolean; created_at: string; actor_email: string | null; workspace: string | null }[]>(["audit", platform], "admin_audit_logs", { p_platform_only: platform, p_action: null, p_limit: 200, p_offset: 0 });
  return (
    <div>
      <PageHeader title="Audit log" actions={<label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-brand" checked={platform} onChange={(e) => setPlatform(e.target.checked)} /> Platform actions only</label>} />
      <Card className="overflow-x-auto">
        <table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-ink-muted"><tr><th className="px-4 py-3">When</th><th className="px-4 py-3">Actor</th><th className="px-4 py-3">Action</th><th className="px-4 py-3">Workspace</th><th className="px-4 py-3">Details</th></tr></thead>
          <tbody className="divide-y divide-line">{(q.data ?? []).map((a) => <tr key={a.id}><td className="whitespace-nowrap px-4 py-2.5 text-ink-muted">{fmtDateTime(a.created_at)}</td><td className="px-4 py-2.5">{a.actor_email ?? "system"}</td><td className="px-4 py-2.5"><code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{a.action}</code></td><td className="px-4 py-2.5">{a.workspace ?? "—"}</td><td className="max-w-xs truncate px-4 py-2.5 text-xs text-ink-muted" title={JSON.stringify(a.details)}>{JSON.stringify(a.details)}</td></tr>)}</tbody>
        </table>
      </Card>
    </div>
  );
}

function AbusePage() {
  const [status, setStatus] = useState("open");
  const qc = useQueryClient();
  const q = useRpc<{ id: string; reason: string; details: string | null; reporter_email: string | null; status: string; created_at: string; form_slug: string; form_title: string | null; form_status: string | null; workspace: string | null }[]>(["abuse", status], "admin_list_abuse_reports", { p_status: status || null });
  const act = async (id: string, s: string, close = false) => {
    const note = window.prompt("Resolution note:") ?? "";
    try { await rpc("admin_resolve_abuse_report", { p_report_id: id, p_status: s, p_note: note, p_close_form: close }); toast.success("Report updated"); qc.invalidateQueries({ queryKey: ["admin", "abuse"] }); } catch (e) { toast.error((e as Error).message); }
  };
  return (
    <div>
      <PageHeader title="Abuse reports" actions={<Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-40" aria-label="Status"><option value="open">Open</option><option value="reviewing">Reviewing</option><option value="resolved">Resolved</option><option value="dismissed">Dismissed</option><option value="">All</option></Select>} />
      <div className="space-y-3">
        {(q.data ?? []).map((r) => (
          <Card key={r.id} className="p-5">
            <div className="flex flex-wrap items-center gap-2"><Badge tone="red">{r.reason}</Badge><Badge>{r.status}</Badge><span className="text-xs text-ink-muted">{fmtDateTime(r.created_at)}</span></div>
            <p className="mt-2 font-medium text-navy">{r.form_title ?? "Deleted form"} <a className="text-sm text-brand" href={`/f/${r.form_slug}`} target="_blank" rel="noopener noreferrer">/f/{r.form_slug}</a></p>
            <p className="text-xs text-ink-muted">{r.workspace ?? "—"} · form {r.form_status ?? "—"}{r.reporter_email ? ` · reported by ${r.reporter_email}` : ""}</p>
            {r.details && <p className="mt-2 whitespace-pre-wrap rounded-lg bg-canvas p-3 text-sm">{r.details}</p>}
            {["open", "reviewing"].includes(r.status) && <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={() => act(r.id, "reviewing")}>Mark reviewing</Button><Button size="sm" variant="danger" onClick={() => act(r.id, "resolved", true)}>Close form & resolve</Button><Button size="sm" variant="ghost" onClick={() => act(r.id, "dismissed")}>Dismiss</Button></div>}
          </Card>
        ))}
        {q.data?.length === 0 && <p className="py-10 text-center text-sm text-ink-muted">No reports.</p>}
      </div>
    </div>
  );
}

function HealthPage() {
  const q = useRpc<{ database: { size: string; now: string }; recentErrors: { id: number; source: string; code: string; message: string; created_at: string }[]; errorsBySource: { source: string; count: number }[]; tableSizes: { table: string; rows: number }[] }>(["health"], "admin_system_health");
  const api = useQuery({ queryKey: ["admin", "api-health"], queryFn: async () => { const t = Date.now(); const r = await fetch(`${(import.meta.env.VITE_API_BASE_URL as string) ?? "/api"}/v1/health`); return { ...(await r.json()), roundTrip: Date.now() - t }; } });
  return (
    <div className="space-y-6">
      <PageHeader title="System health" actions={<Button variant="secondary" onClick={() => { q.refetch(); api.refetch(); }}>Refresh</Button>} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="API" value={api.data?.ok ? "Healthy" : api.isLoading ? "…" : "Degraded"} hint={api.data ? `${api.data.roundTrip} ms round trip · v${api.data.version}` : undefined} icon={<HeartPulse />} tone={api.data?.ok ? "green" : "amber"} />
        <Stat label="Database" value={api.data?.database ?? "…"} hint={q.data ? `Size ${q.data.database.size}` : undefined} icon={<Activity />} />
        <Stat label="Errors (7 days)" value={fmtNumber(q.data?.errorsBySource.reduce((s, e) => s + e.count, 0) ?? 0)} icon={<Flag />} tone="amber" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card><CardHeader title="Recent errors" /><ul className="max-h-[420px] divide-y divide-line overflow-y-auto text-sm">{(q.data?.recentErrors ?? []).map((e) => <li key={e.id} className="px-5 py-2.5"><p className="font-medium text-navy">{e.source} · <code className="text-xs">{e.code}</code></p><p className="text-xs text-ink-muted">{e.message}</p><p className="text-[11px] text-ink-subtle">{fmtDateTime(e.created_at)}</p></li>)}{q.data?.recentErrors.length === 0 && <li className="px-5 py-6 text-center text-ink-muted">No errors recorded.</li>}</ul></Card>
        <Card><CardHeader title="Largest tables" /><ul className="divide-y divide-line text-sm">{(q.data?.tableSizes ?? []).map((t) => <li key={t.table} className="flex justify-between px-5 py-2"><code className="text-xs">{t.table}</code><span className="tabular-nums text-ink-muted">{fmtNumber(t.rows)} rows</span></li>)}</ul></Card>
      </div>
    </div>
  );
}

function SettingsPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin", "settings"], queryFn: async () => (await supabase.from("platform_settings").select("*").order("key")).data ?? [] });
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  return (
    <div>
      <PageHeader title="Platform settings" description="Values are JSON. Public settings are readable by visitors (e.g. support email, pricing notice)." />
      <Card className="divide-y divide-line">
        {(q.data ?? []).map((s) => (
          <div key={s.key} className="grid gap-3 p-5 sm:grid-cols-[1fr_1.2fr_auto] sm:items-center">
            <div><p className="font-mono text-sm font-medium text-navy">{s.key}</p><p className="text-xs text-ink-muted">{s.description}{s.is_public && " · public"}</p></div>
            <Input className="font-mono text-xs" value={drafts[s.key] ?? JSON.stringify(s.value)} onChange={(e) => setDrafts({ ...drafts, [s.key]: e.target.value })} aria-label={`Value for ${s.key}`} />
            <Button size="sm" variant="secondary" disabled={drafts[s.key] === undefined} onClick={async () => { let v: unknown; try { v = JSON.parse(drafts[s.key]); } catch { return toast.error("Value must be valid JSON (strings need quotes)."); } try { await rpc("admin_update_setting", { p_key: s.key, p_value: v, p_is_public: null }); toast.success("Setting saved"); const { [s.key]: _, ...rest } = drafts; setDrafts(rest); qc.invalidateQueries({ queryKey: ["admin", "settings"] }); } catch (e) { toast.error((e as Error).message); } }}>Save</Button>
          </div>
        ))}
      </Card>
    </div>
  );
}

export default function Admin() {
  return (
    <div className="min-h-screen lg:pl-60">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col gap-6 bg-navy-900 px-3 py-5 lg:flex">
        <Link to="/admin" className="px-2"><Logo light /></Link>
        <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-amber-300">Platform administration</p>
        <nav className="space-y-1" aria-label="Administration">{NAV.map((n) => <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium", isActive ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white")}><n.icon className="h-[18px] w-[18px]" />{n.label}</NavLink>)}</nav>
        <Link to="/app" className="mt-auto flex items-center gap-2 px-3 text-sm text-slate-400 hover:text-white"><ArrowLeft className="h-4 w-4" /> Back to app</Link>
      </aside>
      <div className="flex gap-2 overflow-x-auto border-b border-line bg-white px-4 py-2 lg:hidden">{NAV.map((n) => <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cn("shrink-0 rounded-md px-3 py-1.5 text-sm", isActive ? "bg-navy text-white" : "text-ink-muted")}>{n.label}</NavLink>)}</div>
      <main className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6 lg:py-8">
        <Routes>
          <Route index element={<Overview />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="workspaces" element={<WorkspacesPage />} />
          <Route path="plans" element={<PlansPage />} />
          <Route path="ai" element={<AiPage />} />
          <Route path="audit" element={<AuditPage />} />
          <Route path="abuse" element={<AbusePage />} />
          <Route path="health" element={<HealthPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  );
}
