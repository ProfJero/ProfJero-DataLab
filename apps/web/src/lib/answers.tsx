import { choiceOptions, OTHER_OPTION_ID, type FileRef, type Question } from "@datalab/shared";

/** Human-readable rendering of a stored answer, resolving option ids to labels via stable question ids. */
export function formatAnswer(q: Question | undefined, v: unknown, other?: string): string {
  if (v === undefined || v === null || v === "") return "";
  if (!q) return typeof v === "object" ? JSON.stringify(v) : String(v);
  const opts = new Map(choiceOptions(q).map((o) => [o.id, o.label]));
  const label = (x: unknown) => (x === OTHER_OPTION_ID ? `Other${other ? `: ${other}` : ""}` : (opts.get(String(x)) ?? `Removed option (${String(x)})`));
  if (q.type === "file_upload" && Array.isArray(v)) return (v as FileRef[]).map((f) => f.name ?? f.publicId).join(", ");
  if (Array.isArray(v)) return v.map(label).join(", ");
  if (typeof v === "object") return Object.entries(v as Record<string, number>).map(([k, n]) => `${q.config.rows?.find((r) => r.id === k)?.label ?? k}: ${q.config.scaleLabels?.[n - 1] ?? n}`).join("; ");
  if (opts.size) return label(v);
  if (q.type === "rating") return `${v} / ${q.config.scaleMax ?? 5}`;
  return String(v);
}

export function AnswerView({ q, v, other }: { q: Question | undefined; v: unknown; other?: string }) {
  if (q?.type === "file_upload" && Array.isArray(v))
    return (
      <ul className="space-y-1">
        {(v as FileRef[]).map((f) => (
          <li key={f.publicId}><a className="text-brand underline" href={f.url} target="_blank" rel="noopener noreferrer nofollow">{f.name ?? "Download file"}</a> <span className="text-xs text-ink-muted">({Math.round(f.bytes / 1024)} KB)</span></li>
        ))}
      </ul>
    );
  if (q?.type === "url" && typeof v === "string" && /^https?:\/\//.test(v)) return <a className="break-all text-brand underline" href={v} target="_blank" rel="noopener noreferrer nofollow">{v}</a>;
  const text = formatAnswer(q, v, other);
  return text ? <p className="whitespace-pre-wrap break-words text-navy">{text}</p> : <p className="italic text-ink-subtle">No answer</p>;
}
