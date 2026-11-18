import * as S from "@radix-ui/react-switch";
import * as T from "@radix-ui/react-tabs";
import * as TT from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn, initials } from "@/lib/utils";

export function Card({ className, children, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("card", className)} {...p}>{children}</div>;
}
export function CardHeader({ title, description, action, className }: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start justify-between gap-4 border-b border-line px-5 py-4", className)}>
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold text-navy">{title}</h3>
        {description && <p className="mt-0.5 text-sm text-ink-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Badge({ className, children, tone = "default" }: { className?: string; children: ReactNode; tone?: "default" | "brand" | "green" | "amber" | "red" | "navy" }) {
  const tones = { default: "bg-slate-100 text-slate-700", brand: "bg-brand-50 text-brand-700", green: "bg-insight-50 text-insight-700", amber: "bg-amber-50 text-amber-800", red: "bg-red-50 text-red-700", navy: "bg-navy text-white" };
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium [&_svg]:h-3 [&_svg]:w-3", tones[tone], className)}>{children}</span>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-slate-200/70", className)} aria-hidden />;
}

export function Spinner({ className, label = "Loading" }: { className?: string; label?: string }) {
  return (
    <div role="status" className={cn("flex items-center justify-center p-8 text-ink-muted", className)}>
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function EmptyState({ icon, title, description, action, className }: { icon?: ReactNode; title: string; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-xl border border-dashed border-line bg-white/60 px-6 py-14 text-center", className)}>
      {icon && <div className="mb-4 rounded-2xl bg-brand-50 p-3 text-brand [&_svg]:h-6 [&_svg]:w-6">{icon}</div>}
      <h3 className="text-base font-semibold text-navy">{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm text-ink-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800">
      <p className="font-medium">Something went wrong</p>
      <p className="mt-1">{error instanceof Error ? error.message : "Please try again."}</p>
      {onRetry && <button onClick={onRetry} className="mt-2 font-medium underline">Try again</button>}
    </div>
  );
}

export function PageHeader({ title, description, actions, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-muted">{eyebrow}</div>}
        <h1 className="truncate text-2xl font-semibold">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, icon, tone = "brand" }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; tone?: "brand" | "green" | "navy" | "amber" }) {
  const tones = { brand: "bg-brand-50 text-brand", green: "bg-insight-50 text-insight-600", navy: "bg-navy-50 text-navy", amber: "bg-amber-50 text-amber-700" };
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-ink-muted">{label}</p>
        {icon && <span className={cn("rounded-lg p-2 [&_svg]:h-4 [&_svg]:w-4", tones[tone])}>{icon}</span>}
      </div>
      <p className="mt-2 text-[28px] font-semibold leading-none tracking-tight text-navy tabular-nums">{value}</p>
      {hint && <p className="mt-2 text-xs text-ink-muted">{hint}</p>}
    </Card>
  );
}

export function Switch({ checked, onCheckedChange, label, description, disabled, id }: { checked: boolean; onCheckedChange: (v: boolean) => void; label?: ReactNode; description?: ReactNode; disabled?: boolean; id?: string }) {
  return (
    <label className={cn("flex cursor-pointer items-start justify-between gap-4", disabled && "cursor-not-allowed opacity-60")}>
      {(label || description) && (
        <span className="min-w-0">
          {label && <span className="block text-sm font-medium text-navy">{label}</span>}
          {description && <span className="mt-0.5 block text-xs text-ink-muted">{description}</span>}
        </span>
      )}
      <S.Root id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} className="relative mt-0.5 h-5 w-9 shrink-0 rounded-full bg-slate-300 transition-colors data-[state=checked]:bg-brand">
        <S.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[18px]" />
      </S.Root>
    </label>
  );
}

export const Tabs = T.Root;
export function TabsList({ children, className }: { children: ReactNode; className?: string }) {
  return <T.List className={cn("inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1", className)}>{children}</T.List>;
}
export function TabsTrigger({ value, children }: { value: string; children: ReactNode }) {
  return <T.Trigger value={value} className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-ink-muted transition-colors data-[state=active]:bg-white data-[state=active]:text-navy data-[state=active]:shadow-sm [&_svg]:h-4 [&_svg]:w-4">{children}</T.Trigger>;
}
export const TabsContent = T.Content;

export function Tooltip({ content, children }: { content: ReactNode; children: ReactNode }) {
  return (
    <TT.Provider delayDuration={250}>
      <TT.Root>
        <TT.Trigger asChild>{children}</TT.Trigger>
        <TT.Portal>
          <TT.Content sideOffset={6} className="z-50 max-w-xs rounded-md bg-navy px-2.5 py-1.5 text-xs text-white shadow-pop">{content}</TT.Content>
        </TT.Portal>
      </TT.Root>
    </TT.Provider>
  );
}

export function Avatar({ name, email, url, size = 32 }: { name?: string | null; email?: string | null; url?: string | null; size?: number }) {
  if (url) return <img src={url} alt="" width={size} height={size} className="rounded-full object-cover" style={{ width: size, height: size }} />;
  return <span className="inline-flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-700" style={{ width: size, height: size, fontSize: size * 0.38 }} aria-hidden>{initials(name, email)}</span>;
}

export function Progress({ value, className, tone = "brand" }: { value: number; className?: string; tone?: "brand" | "green" | "amber" | "red" }) {
  const tones = { brand: "bg-brand", green: "bg-insight", amber: "bg-amber-500", red: "bg-red-500" };
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-slate-100", className)} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full transition-all", tones[tone])} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}
