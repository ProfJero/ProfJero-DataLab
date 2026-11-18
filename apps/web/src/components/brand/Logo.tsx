import { cn } from "@/lib/utils";

/**
 * DataLab mark: a speech bubble (a question asked) holding rising bars (data collected)
 * with an insight node on the tallest bar (understanding). Works in colour, mono and as an app icon.
 */
export function LogoMark({ size = 32, mono, className }: { size?: number; mono?: "light" | "dark"; className?: string }) {
  const bg = mono === "light" ? "#ffffff" : mono === "dark" ? "#112442" : "#112442";
  const bubble = mono ? (mono === "light" ? "#112442" : "#ffffff") : "#2864C5";
  const bars = mono === "dark" ? "#112442" : "#ffffff";
  const node = mono ? bars : "#20A47A";
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} role="img" aria-label="ProfJero DataLab">
      <rect width="64" height="64" rx="14" fill={bg} />
      <path d="M14 20a6 6 0 0 1 6-6h24a6 6 0 0 1 6 6v18a6 6 0 0 1-6 6H29l-9 7v-7a6 6 0 0 1-6-6z" fill={bubble} />
      <rect x="21" y="30" width="5" height="8" rx="1.5" fill={bars} />
      <rect x="29.5" y="25" width="5" height="13" rx="1.5" fill={bars} />
      <rect x="38" y="20.5" width="5" height="17.5" rx="1.5" fill={bars} opacity=".55" />
      <circle cx="40.5" cy="17.5" r="4" fill={node} stroke={bg} strokeWidth="2" />
    </svg>
  );
}

export function Logo({ className, light, compact }: { className?: string; light?: boolean; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark size={compact ? 28 : 32} />
      {!compact && (
        <span className={cn("text-[17px] font-semibold tracking-tight", light ? "text-white" : "text-navy")}>
          ProfJero <span className={light ? "text-brand-200" : "text-brand"}>DataLab</span>
        </span>
      )}
    </span>
  );
}

export function Endorsement({ light, className }: { light?: boolean; className?: string }) {
  return <span className={cn("text-xs", light ? "text-slate-400" : "text-ink-muted", className)}>A product of ProfJero Digital Studio</span>;
}
