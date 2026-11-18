import { cn } from "@/lib/utils";

/**
 * Official ProfJero DataLab identity (supplied by ProfJero Digital Studio).
 * Raster assets live in /public/brand; the wordmark is rendered as live text in the
 * brand colours so it stays crisp at every size.
 */
export function LogoMark({ size = 32, className, tile }: { size?: number; className?: string; tile?: boolean }) {
  if (tile)
    return (
      <span className={cn("inline-flex shrink-0 items-center justify-center rounded-[22%] bg-white", className)} style={{ width: size, height: size }}>
        <img src="/brand/logo-mark.png" alt="" width={size * 0.82} height={size * 0.82} style={{ width: size * 0.82, height: size * 0.82 }} />
      </span>
    );
  return <img src="/brand/logo-mark.png" alt="" width={size} height={size} className={cn("shrink-0", className)} style={{ width: size, height: size }} />;
}

/** Mark + wordmark. `light` = for dark backgrounds (mark sits on a white tile). */
export function Logo({ className, light, compact }: { className?: string; light?: boolean; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)} aria-label="ProfJero DataLab">
      <LogoMark size={compact ? 30 : 36} tile={light} />
      {!compact && (
        <span className="flex flex-col leading-none" aria-hidden>
          <span className={cn("text-[15px] font-extrabold tracking-tight", light ? "text-white" : "text-navy")}>ProfJero</span>
          <span className="text-[15px] font-extrabold tracking-tight">
            <span className={light ? "text-brand-200" : "text-brand-600"}>Data</span>
            <span className={light ? "text-insight-100" : "text-insight-600"}>Lab</span>
          </span>
        </span>
      )}
    </span>
  );
}

/** Full lockup with tagline — for light backgrounds only. */
export function LogoFull({ className, width = 280 }: { className?: string; width?: number }) {
  return <img src="/brand/logo-full.png" alt="ProfJero DataLab — Smarter Surveys. Better Decisions." width={width} height={Math.round((width * 470) / 1345)} className={cn("h-auto", className)} style={{ width }} />;
}

export function Endorsement({ light, className }: { light?: boolean; className?: string }) {
  return <span className={cn("text-xs", light ? "text-slate-400" : "text-ink-muted", className)}>A product of ProfJero Digital Studio</span>;
}
