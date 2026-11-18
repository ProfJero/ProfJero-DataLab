import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, CreditCard, Minus } from "lucide-react";
import { FEATURE_KEYS, FEATURE_LABELS, LIMIT_KEYS, LIMIT_LABELS, type FeatureKey, type LimitKey } from "@datalab/shared";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardHeader, PageHeader, Progress } from "@/components/ui/misc";
import { supabase } from "@/lib/supabase";
import { api } from "@/lib/api";
import { useWorkspace } from "@/hooks/useWorkspace";
import { usePlatformConfig } from "@/hooks/useConfig";
import { cn, fmtDate, fmtMoney, fmtNumber } from "@/lib/utils";

export interface Plan { id: string; code: string; name: string; description: string | null; price_monthly_minor: number | null; price_yearly_minor: number | null; currency: string; features: Partial<Record<FeatureKey, boolean>>; limits: Partial<Record<LimitKey, number | null>>; sort_order: number }

export function usePlans() {
  return useQuery({ queryKey: ["plans"], queryFn: async () => ((await supabase.from("subscription_plans").select("*").eq("is_active", true).eq("is_public", true).order("sort_order")).data ?? []) as Plan[] });
}

export default function Billing() {
  const { current, entitlements, refresh } = useWorkspace();
  const plans = usePlans();
  const cfg = usePlatformConfig();
  const [params, setParams] = useSearchParams();
  const [interval, setInterval] = useState<"monthly" | "yearly">("monthly");
  const [busy, setBusy] = useState<string | null>(null);
  const tx = useQuery({ queryKey: ["payments", current?.id], enabled: current?.role === "owner", queryFn: async () => (await supabase.from("payment_transactions").select("reference,amount_minor,currency,status,created_at,interval,subscription_plans(name)").eq("workspace_id", current!.id).order("created_at", { ascending: false }).limit(20)).data ?? [] });
  const ref = params.get("reference");
  useEffect(() => {
    if (!ref) return;
    api<{ status: string }>("/billing/verify", { method: "POST", json: { reference: ref } })
      .then((r) => { if (r.status === "success") toast.success("Payment confirmed — your plan is active."); else toast.message(`Payment status: ${r.status}`); refresh(); tx.refetch(); })
      .catch((e) => toast.error((e as Error).message))
      .finally(() => setParams({}, { replace: true }));
  }, [ref]); // eslint-disable-line react-hooks/exhaustive-deps
  const isOwner = current?.role === "owner";
  const payments = !!cfg.data?.payments.configured;
  return (
    <div className="space-y-6">
      <PageHeader title="Plan & usage" description="Your workspace's plan, limits and this month's usage." />
      {entitlements && (
        <Card>
          <CardHeader title={<span className="flex items-center gap-2">{entitlements.plan_name} plan <Badge tone="green">{entitlements.status}</Badge></span>} description={(entitlements as unknown as { current_period_end?: string }).current_period_end ? `Renews or ends on ${fmtDate((entitlements as unknown as { current_period_end: string }).current_period_end)}` : "No expiry"} />
          <div className="grid gap-5 p-5 sm:grid-cols-2 lg:grid-cols-3">
            {LIMIT_KEYS.map((k) => {
              const lim = entitlements.limits[k];
              const used = Number(entitlements.usage[k] ?? 0);
              return (
                <div key={k}>
                  <div className="mb-1 flex justify-between text-sm"><span className="text-navy">{LIMIT_LABELS[k]}</span><span className="tabular-nums text-ink-muted">{fmtNumber(Math.round(used * 10) / 10)} / {lim === null || lim === undefined ? "∞" : fmtNumber(lim)}</span></div>
                  <Progress value={lim ? (used / lim) * 100 : 0} tone={lim && used / lim >= 1 ? "red" : lim && used / lim > 0.8 ? "amber" : "brand"} />
                </div>
              );
            })}
          </div>
        </Card>
      )}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Plans</h2>
        <div className="flex rounded-lg bg-slate-100 p-1 text-sm">{(["monthly", "yearly"] as const).map((i) => <button key={i} onClick={() => setInterval(i)} aria-pressed={interval === i} className={cn("rounded-md px-3 py-1 font-medium capitalize", interval === i ? "bg-white text-navy shadow-sm" : "text-ink-muted")}>{i}</button>)}</div>
      </div>
      {!payments && <p className="rounded-lg bg-brand-50 p-3 text-sm text-brand-700">Online payment isn't enabled yet. To upgrade, contact the platform owner — plans can be assigned manually.</p>}
      {payments && !isOwner && <p className="rounded-lg bg-slate-50 p-3 text-sm text-ink-muted">Only the workspace owner can change the plan.</p>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {(plans.data ?? []).map((p) => {
          const currentPlan = entitlements?.plan_code === p.code;
          const price = interval === "yearly" ? p.price_yearly_minor : p.price_monthly_minor;
          return (
            <Card key={p.id} className={cn("flex flex-col p-5", currentPlan && "border-brand shadow-[0_0_0_3px_rgba(40,100,197,.12)]")}>
              <div className="flex items-center justify-between"><h3 className="font-semibold text-navy">{p.name}</h3>{currentPlan && <Badge tone="brand">Current</Badge>}</div>
              <p className="mt-1 text-sm text-ink-muted">{p.description}</p>
              <p className="mt-4 text-2xl font-semibold text-navy">{price ? fmtMoney(price, p.currency) : "Free"}{price ? <span className="text-sm font-normal text-ink-muted">/{interval === "yearly" ? "year" : "month"}</span> : null}</p>
              <ul className="mt-4 flex-1 space-y-1.5 text-sm">
                {LIMIT_KEYS.filter((k) => k !== "upload_mb").map((k) => <li key={k} className="text-ink-muted"><span className="font-medium text-navy">{p.limits[k] === null || p.limits[k] === undefined ? "Unlimited" : fmtNumber(p.limits[k]!)}</span> {LIMIT_LABELS[k].toLowerCase()}</li>)}
                {FEATURE_KEYS.filter((f) => f !== "custom_theme").map((f) => <li key={f} className={cn("flex items-center gap-2", !p.features[f] && "text-ink-subtle")}>{p.features[f] ? <Check className="h-4 w-4 text-insight-600" /> : <Minus className="h-4 w-4" />}{FEATURE_LABELS[f]}</li>)}
              </ul>
              {!currentPlan && price && payments && isOwner ? (
                <Button className="mt-5" loading={busy === p.code} onClick={async () => { setBusy(p.code); try { const r = await api<{ authorizationUrl: string }>("/billing/checkout", { method: "POST", json: { workspaceId: current!.id, planCode: p.code, interval } }); window.location.assign(r.authorizationUrl); } catch (e) { toast.error((e as Error).message); setBusy(null); } }}><CreditCard /> Upgrade</Button>
              ) : null}
            </Card>
          );
        })}
      </div>
      <p className="text-xs text-ink-muted">Prices are indicative and may change. Paid plans can also be arranged by contacting the platform owner.</p>
      {isOwner && (tx.data ?? []).length > 0 && (
        <Card>
          <CardHeader title="Payment history" />
          <ul className="divide-y divide-line text-sm">{tx.data!.map((t) => <li key={t.reference} className="flex justify-between px-5 py-2.5"><span>{(t.subscription_plans as unknown as { name: string } | null)?.name} · {t.interval} · {fmtDate(t.created_at)}</span><span className="flex items-center gap-3"><span className="tabular-nums">{fmtMoney(t.amount_minor, t.currency)}</span><Badge tone={t.status === "success" ? "green" : t.status === "pending" ? "amber" : "red"}>{t.status}</Badge></span></li>)}</ul>
        </Card>
      )}
    </div>
  );
}
