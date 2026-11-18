import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, Minus } from "lucide-react";
import { FEATURE_KEYS, FEATURE_LABELS, LIMIT_KEYS, LIMIT_LABELS } from "@datalab/shared";
import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { usePlans } from "../app/settings/Billing";
import { cn, fmtMoney, fmtNumber } from "@/lib/utils";

export default function Pricing() {
  const plans = usePlans();
  const [yearly, setYearly] = useState(false);
  return (
    <MarketingLayout>
      <section className="container py-16 text-center">
        <h1 className="text-4xl font-semibold">Simple plans that grow with you</h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-ink-muted">Start free. Upgrade for logic, advanced analytics, research tools and teams.</p>
        <div className="mt-8 inline-flex rounded-lg bg-slate-100 p-1 text-sm">{[false, true].map((y) => <button key={String(y)} onClick={() => setYearly(y)} aria-pressed={yearly === y} className={cn("rounded-md px-4 py-1.5 font-medium", yearly === y ? "bg-white text-navy shadow-sm" : "text-ink-muted")}>{y ? "Yearly" : "Monthly"}</button>)}</div>
      </section>
      <section className="container grid gap-5 pb-10 md:grid-cols-2 xl:grid-cols-4">
        {plans.isLoading && Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[520px] rounded-2xl" />)}
        {(plans.data ?? []).map((p) => {
          const price = yearly ? p.price_yearly_minor : p.price_monthly_minor;
          const featured = p.code === "pro";
          return (
            <div key={p.id} className={cn("flex flex-col rounded-2xl border p-6", featured ? "border-brand shadow-pop" : "border-line")}>
              {featured && <span className="mb-3 w-fit rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700">Most popular</span>}
              <h2 className="text-xl font-semibold">{p.name}</h2>
              <p className="mt-1 text-sm text-ink-muted">{p.description}</p>
              <p className="mt-6 text-3xl font-semibold text-navy">{price ? fmtMoney(price, p.currency) : "Free"}{price ? <span className="text-sm font-normal text-ink-muted"> / {yearly ? "year" : "month"}</span> : null}</p>
              <Button className="mt-6" variant={featured ? "primary" : "secondary"} asChild><Link to="/auth/sign-up">{price ? `Start with ${p.name}` : "Start for free"}</Link></Button>
              <ul className="mt-6 space-y-2 text-sm">
                {LIMIT_KEYS.filter((k) => k !== "upload_mb").map((k) => <li key={k} className="text-ink-muted"><strong className="text-navy">{p.limits[k] === null || p.limits[k] === undefined ? "Unlimited" : fmtNumber(p.limits[k]!)}</strong> {LIMIT_LABELS[k].toLowerCase()}</li>)}
                {FEATURE_KEYS.filter((f) => f !== "custom_theme").map((f) => <li key={f} className={cn("flex gap-2", !p.features[f] && "text-ink-subtle")}>{p.features[f] ? <Check className="h-4 w-4 shrink-0 text-insight-600" /> : <Minus className="h-4 w-4 shrink-0" />}{FEATURE_LABELS[f]}</li>)}
              </ul>
            </div>
          );
        })}
      </section>
      <p className="container pb-20 text-center text-sm text-ink-muted">Prices in Ghana cedis are indicative and may change. Paid plans can be upgraded in-app when online payment is enabled, or arranged directly with us.</p>
    </MarketingLayout>
  );
}
