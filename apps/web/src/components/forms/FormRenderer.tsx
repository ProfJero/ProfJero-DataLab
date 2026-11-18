import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, FileUp, Loader2, Star, X } from "lucide-react";
import {
  choiceOptions,
  DISPLAY_TYPES,
  isMultiSelect,
  OTHER_OPTION_ID,
  sectionPath,
  validateAnswer,
  visibleQuestionIds,
  type Answers,
  type AnswerValue,
  type FileRef,
  type FormDefinition,
  type Question,
} from "@datalab/shared";
import { cn } from "@/lib/utils";
import { Markdown } from "@/lib/markdown";
import { LogoMark } from "@/components/brand/Logo";

export interface SubmitResult {
  ok: boolean;
  errors?: Record<string, string>;
  message?: string;
}

export interface RendererProps {
  definition: FormDefinition;
  mode: "live" | "preview";
  branding?: boolean;
  workspace?: { name: string; logoUrl: string | null };
  collectEmail?: boolean;
  honeypot?: boolean;
  onSubmit?: (payload: { answers: Answers; otherText: Record<string, string>; respondentEmail?: string; website?: string; startedAt: number }) => Promise<SubmitResult>;
  onUpload?: (q: Question, file: File) => Promise<FileRef>;
  embed?: boolean;
}

const RADIUS = { sm: "6px", md: "12px", lg: "18px" };

/* ------------------------------------------------------------------ inputs */

function Choice({ q, value, other, onChange, onOther, invalid }: { q: Question; value: AnswerValue | undefined; other: string; onChange: (v: AnswerValue) => void; onOther: (s: string) => void; invalid: boolean }) {
  const multi = isMultiSelect(q);
  const opts = choiceOptions(q);
  const selected = new Set(Array.isArray(value) ? (value as string[]) : value ? [String(value)] : []);
  const toggle = (id: string) => {
    if (!multi) return onChange(id);
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  };
  if (q.type === "dropdown") {
    return (
      <div className="space-y-2">
        <select aria-invalid={invalid} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value || null)} className="h-12 w-full rounded-[var(--r)] border border-slate-300 bg-white px-3 text-base focus:border-[var(--p)] focus:outline-none focus:ring-2 focus:ring-[var(--p)]/25">
          <option value="">Select an option…</option>
          {opts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        {value === OTHER_OPTION_ID && <input aria-label="Please specify" placeholder="Please specify" value={other} onChange={(e) => onOther(e.target.value)} className="h-11 w-full rounded-[var(--r)] border border-slate-300 px-3 focus:border-[var(--p)] focus:outline-none" />}
      </div>
    );
  }
  const image = q.type === "image_choice";
  return (
    <div role={multi ? "group" : "radiogroup"} className={cn(image ? "grid grid-cols-2 gap-3 sm:grid-cols-3" : q.type === "yes_no" ? "grid grid-cols-2 gap-3" : "space-y-2.5")}>
      {opts.map((o, i) => {
        const on = selected.has(o.id);
        return (
          <div key={o.id}>
            <button
              type="button"
              role={multi ? "checkbox" : "radio"}
              aria-checked={on}
              onClick={() => toggle(o.id)}
              className={cn("group flex w-full items-center gap-3 rounded-[var(--r)] border-2 bg-white px-4 py-3 text-left text-[15px] transition", on ? "border-[var(--p)] bg-[var(--p)]/[0.06]" : "border-slate-200 hover:border-slate-300", image && "flex-col items-stretch p-2")}
            >
              {image && (o.imageUrl ? <img src={o.imageUrl} alt="" className="aspect-square w-full rounded-[calc(var(--r)-4px)] object-cover" /> : <span className="flex aspect-square w-full items-center justify-center rounded-[calc(var(--r)-4px)] bg-slate-100 text-xs text-slate-400">No image</span>)}
              <span className={cn("flex items-center gap-3", image && "px-1 pb-1")}>
                <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center border-2 transition", multi ? "rounded-md" : "rounded-full", on ? "border-[var(--p)] bg-[var(--p)] text-white" : "border-slate-300")}>{on && <Check className="h-3 w-3" strokeWidth={3} />}</span>
                <span className="min-w-0 flex-1 text-slate-800">{o.label}</span>
                {!image && opts.length <= 9 && <span className="hidden text-xs text-slate-400 sm:inline">{i + 1}</span>}
              </span>
            </button>
            {o.id === OTHER_OPTION_ID && on && <input aria-label="Please specify" autoFocus placeholder="Please specify" value={other} onChange={(e) => onOther(e.target.value)} className="mt-2 h-11 w-full rounded-[var(--r)] border border-slate-300 px-3 focus:border-[var(--p)] focus:outline-none" />}
          </div>
        );
      })}
    </div>
  );
}

function Scale({ q, value, onChange }: { q: Question; value: AnswerValue | undefined; onChange: (v: AnswerValue) => void }) {
  if (q.type === "rating") {
    const max = q.config.scaleMax ?? 5;
    const v = typeof value === "number" ? value : 0;
    return (
      <div role="radiogroup" aria-label={`Rating out of ${max}`} className="flex flex-wrap gap-1.5">
        {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
          <button key={n} type="button" role="radio" aria-checked={v === n} aria-label={`${n} of ${max}`} onClick={() => onChange(n)} className="rounded-lg p-1 transition hover:scale-110">
            <Star className={cn("h-9 w-9", n <= v ? "fill-amber-400 text-amber-400" : "text-slate-300")} />
          </button>
        ))}
      </div>
    );
  }
  const lo = q.config.scaleMin ?? 1;
  const hi = q.config.scaleMax ?? 5;
  const v = typeof value === "number" ? value : null;
  return (
    <div>
      <div role="radiogroup" className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${hi - lo + 1}, minmax(0, 1fr))` }}>
        {Array.from({ length: hi - lo + 1 }, (_, i) => lo + i).map((n) => (
          <button key={n} type="button" role="radio" aria-checked={v === n} onClick={() => onChange(n)} className={cn("h-12 rounded-[var(--r)] border-2 text-sm font-semibold transition", v === n ? "border-[var(--p)] bg-[var(--p)] text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300")}>
            {n}
          </button>
        ))}
      </div>
      {(q.config.minLabel || q.config.maxLabel) && <div className="mt-2 flex justify-between text-xs text-slate-500"><span>{q.config.minLabel}</span><span>{q.config.maxLabel}</span></div>}
    </div>
  );
}

function Likert({ q, value, onChange }: { q: Question; value: AnswerValue | undefined; onChange: (v: AnswerValue) => void }) {
  const labels = q.config.scaleLabels?.length ? q.config.scaleLabels : ["1", "2", "3", "4", "5"];
  const v = (value && typeof value === "object" && !Array.isArray(value) ? value : {}) as Record<string, number>;
  return (
    <div className="space-y-4">
      {(q.config.rows ?? []).map((r) => (
        <fieldset key={r.id} className="rounded-[var(--r)] border border-slate-200 bg-white p-3 sm:p-4">
          <legend className="sr-only">{r.label}</legend>
          <p className="mb-3 text-[15px] font-medium text-slate-800" aria-hidden>{r.label}</p>
          <div role="radiogroup" aria-label={r.label} className="grid grid-cols-1 gap-1.5 sm:grid-cols-5" style={{ gridTemplateColumns: undefined }}>
            {labels.map((l, i) => (
              <button key={l} type="button" role="radio" aria-checked={v[r.id] === i + 1} onClick={() => onChange({ ...v, [r.id]: i + 1 })} className={cn("rounded-lg border px-2 py-2 text-xs font-medium transition sm:text-[13px]", v[r.id] === i + 1 ? "border-[var(--p)] bg-[var(--p)] text-white" : "border-slate-200 text-slate-600 hover:border-slate-300")}>
                {l}
              </button>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}

function Upload({ q, value, onChange, onUpload, preview }: { q: Question; value: AnswerValue | undefined; onChange: (v: AnswerValue) => void; onUpload?: RendererProps["onUpload"]; preview: boolean }) {
  const files = (Array.isArray(value) ? value : []) as FileRef[];
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const max = q.config.maxFiles ?? 1;
  const accept = (q.config.allowedFileTypes ?? []).map((t) => `.${t}`).join(",");
  return (
    <div>
      {files.map((f) => (
        <div key={f.publicId} className="mb-2 flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
          <span className="truncate">{f.name ?? f.publicId}</span>
          <button type="button" onClick={() => onChange(files.filter((x) => x.publicId !== f.publicId))} aria-label={`Remove ${f.name}`} className="rounded p-1 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>
      ))}
      {files.length < max && (
        <label className={cn("flex cursor-pointer flex-col items-center justify-center rounded-[var(--r)] border-2 border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-600 hover:border-[var(--p)]", (busy || preview) && "pointer-events-none opacity-70")}>
          {busy ? <Loader2 className="mb-2 h-6 w-6 animate-spin" /> : <FileUp className="mb-2 h-6 w-6 text-slate-400" />}
          <span className="font-medium">{preview ? "File uploads are disabled in preview" : busy ? "Uploading…" : "Choose a file to upload"}</span>
          <span className="mt-1 text-xs text-slate-500">{(q.config.allowedFileTypes ?? []).join(", ").toUpperCase()} · up to {q.config.maxFileSizeMb ?? 5} MB</span>
          <input
            type="file"
            className="sr-only"
            accept={accept}
            disabled={busy || preview}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file || !onUpload) return;
              setErr(null);
              const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
              if ((q.config.allowedFileTypes ?? []).length && !q.config.allowedFileTypes!.map((t) => t.toLowerCase()).includes(ext)) return setErr(`Allowed types: ${q.config.allowedFileTypes!.join(", ")}`);
              if (file.size > (q.config.maxFileSizeMb ?? 5) * 1024 * 1024) return setErr(`Files must be ${q.config.maxFileSizeMb ?? 5} MB or smaller.`);
              setBusy(true);
              try {
                onChange([...files, await onUpload(q, file)]);
              } catch (er) {
                setErr((er as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          />
        </label>
      )}
      {err && <p className="mt-2 text-sm text-red-600" role="alert">{err}</p>}
    </div>
  );
}

const inputCls = "h-12 w-full rounded-[var(--r)] border border-slate-300 bg-white px-3.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-[var(--p)] focus:outline-none focus:ring-2 focus:ring-[var(--p)]/25 aria-[invalid=true]:border-red-500";

function QuestionInput(props: { q: Question; value: AnswerValue | undefined; other: string; onChange: (v: AnswerValue) => void; onOther: (s: string) => void; invalid: boolean; describedBy?: string; onUpload?: RendererProps["onUpload"]; preview: boolean; inputId: string }) {
  const { q, value, onChange, invalid, describedBy, inputId } = props;
  const common = { id: inputId, "aria-invalid": invalid, "aria-describedby": describedBy, "aria-required": q.required };
  switch (q.type) {
    case "short_text":
      return <input {...common} className={inputCls} value={(value as string) ?? ""} maxLength={q.config.maxLength} placeholder={q.config.placeholder ?? "Type your answer"} onChange={(e) => onChange(e.target.value)} />;
    case "long_text":
      return <textarea {...common} className={cn(inputCls, "h-auto min-h-[130px] py-3 leading-relaxed")} value={(value as string) ?? ""} maxLength={q.config.maxLength} placeholder={q.config.placeholder ?? "Type your answer"} onChange={(e) => onChange(e.target.value)} />;
    case "email":
      return <input {...common} type="email" inputMode="email" autoComplete="email" className={inputCls} value={(value as string) ?? ""} placeholder={q.config.placeholder ?? "name@example.com"} onChange={(e) => onChange(e.target.value)} />;
    case "phone":
      return <input {...common} type="tel" inputMode="tel" autoComplete="tel" className={inputCls} value={(value as string) ?? ""} placeholder={q.config.placeholder ?? "+233 24 000 0000"} onChange={(e) => onChange(e.target.value)} />;
    case "url":
      return <input {...common} type="url" inputMode="url" className={inputCls} value={(value as string) ?? ""} placeholder={q.config.placeholder ?? "https://"} onChange={(e) => onChange(e.target.value)} />;
    case "number":
      return <input {...common} type="number" inputMode="decimal" className={inputCls} value={value === null || value === undefined ? "" : String(value)} min={q.config.min} max={q.config.max} step={q.config.integerOnly ? 1 : (q.config.step ?? "any")} placeholder={q.config.placeholder ?? "0"} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} />;
    case "date":
      return <input {...common} type="date" className={inputCls} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value || null)} />;
    case "time":
      return <input {...common} type="time" className={inputCls} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value || null)} />;
    case "single_choice":
    case "multiple_choice":
    case "dropdown":
    case "yes_no":
    case "image_choice":
      return <Choice q={q} value={value} other={props.other} onChange={onChange} onOther={props.onOther} invalid={invalid} />;
    case "rating":
    case "linear_scale":
      return <Scale q={q} value={value} onChange={onChange} />;
    case "likert":
      return <Likert q={q} value={value} onChange={onChange} />;
    case "file_upload":
      return <Upload q={q} value={value} onChange={onChange} onUpload={props.onUpload} preview={props.preview} />;
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ renderer */

export function FormRenderer({ definition: def, mode, branding = true, workspace, collectEmail, honeypot = true, onSubmit, onUpload, embed }: RendererProps) {
  const [answers, setAnswers] = useState<Answers>({});
  const [other, setOther] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [stage, setStage] = useState<"welcome" | "form" | "done">(def.settings.welcomeTitle || def.settings.welcomeMessage ? "welcome" : "form");
  const [pageIdx, setPageIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [hp, setHp] = useState("");
  const started = useRef(Date.now());
  const top = useRef<HTMLDivElement>(null);
  const paged = def.settings.layout === "paged" && def.sections.length > 1;

  const visible = useMemo(() => visibleQuestionIds(def, answers), [def, answers]);
  const path = useMemo(() => sectionPath(def, answers), [def, answers]);
  const pages = paged ? path : [def.sections.map((s) => s.id)].flat();
  const currentSections = paged ? [pages[Math.min(pageIdx, pages.length - 1)]] : path;
  const isLast = !paged || pageIdx >= pages.length - 1;
  const answerable = def.questions.filter((q) => !DISPLAY_TYPES.includes(q.type) && visible.has(q.id));
  const answeredCount = answerable.filter((q) => {
    const v = answers[q.id];
    return v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0);
  }).length;
  const progress = paged ? ((pageIdx + (stage === "done" ? 1 : 0)) / pages.length) * 100 : answerable.length ? (answeredCount / answerable.length) * 100 : 0;

  useEffect(() => {
    if (pageIdx > pages.length - 1) setPageIdx(Math.max(0, pages.length - 1));
  }, [pages.length, pageIdx]);

  const style = { "--p": def.theme.primary, "--r": RADIUS[def.theme.radius], background: def.theme.background, fontFamily: def.theme.font === "Serif" ? "Georgia, 'Times New Roman', serif" : def.theme.font === "Manrope" ? "Manrope, Inter, sans-serif" : undefined } as CSSProperties;

  function set(qid: string, v: AnswerValue) {
    setAnswers((a) => ({ ...a, [qid]: v }));
    if (errors[qid]) setErrors((e) => ({ ...e, [qid]: "" }));
  }

  function validateSections(sectionIds: string[]): boolean {
    const errs: Record<string, string> = {};
    for (const q of def.questions) {
      if (!sectionIds.includes(q.sectionId) || DISPLAY_TYPES.includes(q.type) || !visible.has(q.id)) continue;
      const [, err] = validateAnswer(q, answers[q.id], other[q.id]);
      if (err) errs[q.id] = err;
    }
    setErrors(errs);
    const first = Object.keys(errs)[0];
    if (first) document.getElementById(`q-${first}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    return !first;
  }

  async function submit() {
    if (!validateSections(path)) return;
    if (collectEmail && email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return setFormError("Enter a valid email address or leave it blank.");
    setFormError(null);
    if (mode === "preview" || !onSubmit) {
      setStage("done");
      return;
    }
    setBusy(true);
    const filtered: Answers = {};
    for (const id of visible) if (answers[id] !== undefined) filtered[id] = answers[id];
    const res = await onSubmit({ answers: filtered, otherText: other, respondentEmail: email || undefined, website: hp, startedAt: started.current });
    setBusy(false);
    if (res.ok) {
      setStage("done");
      top.current?.scrollIntoView({ behavior: "smooth" });
      if (def.settings.redirectUrl && /^https:\/\//.test(def.settings.redirectUrl)) setTimeout(() => window.location.assign(def.settings.redirectUrl!), 2500);
    } else {
      if (res.errors) setErrors(res.errors);
      setFormError(res.message ?? "We couldn't submit your response. Please try again.");
    }
  }

  const sectionTitle = (sid: string) => def.sections.find((s) => s.id === sid);

  return (
    <div style={style} className={cn("min-h-full", embed ? "py-4" : "min-h-screen py-6 sm:py-12")}>
      <div ref={top} className="mx-auto w-full max-w-2xl px-4">
        {def.settings.showProgress && stage === "form" && (
          <div className="sticky top-0 z-10 -mx-4 mb-4 bg-[inherit] px-4 pb-2 pt-2" style={{ background: def.theme.background }}>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/5" role="progressbar" aria-label="Form progress" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-[var(--p)] transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
            {paged && <p className="mt-1.5 text-right text-xs text-slate-500">Page {Math.min(pageIdx + 1, pages.length)} of {pages.length}</p>}
          </div>
        )}
        <div className="overflow-hidden rounded-[var(--r)] bg-white shadow-[0_1px_3px_rgba(17,36,66,.08),0_8px_24px_-12px_rgba(17,36,66,.15)]">
          {def.coverImageUrl && <img src={def.coverImageUrl} alt="" className="h-36 w-full object-cover sm:h-48" />}
          <div className="h-1.5 bg-[var(--p)]" aria-hidden />
          <div className="p-5 sm:p-8">
            <header className="mb-6">
              {(def.logoUrl || workspace?.logoUrl) && <img src={def.logoUrl ?? workspace!.logoUrl!} alt={workspace?.name ?? ""} className="mb-4 h-10 w-auto max-w-[160px] object-contain" />}
              <h1 className="text-2xl font-semibold leading-tight text-slate-900 sm:text-[28px]">{def.title}</h1>
              {def.description && stage !== "done" && <div className="mt-2 text-[15px] text-slate-600"><Markdown text={def.description} /></div>}
            </header>

            {stage === "welcome" && (
              <div>
                {def.settings.welcomeTitle && <h2 className="text-lg font-semibold text-slate-900">{def.settings.welcomeTitle}</h2>}
                {def.settings.welcomeMessage && <div className="mt-2 text-slate-700"><Markdown text={def.settings.welcomeMessage} /></div>}
                {def.settings.instructions && <div className="mt-4 rounded-[var(--r)] bg-slate-50 p-4 text-sm text-slate-700"><Markdown text={def.settings.instructions} /></div>}
                <button onClick={() => setStage("form")} className="mt-8 inline-flex h-12 items-center gap-2 rounded-[var(--r)] bg-[var(--p)] px-6 font-semibold text-white shadow-sm transition hover:brightness-110">
                  Start <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            )}

            {stage === "form" && (
              <form noValidate onSubmit={(e) => { e.preventDefault(); if (isLast) submit(); else if (validateSections(currentSections)) { setPageIdx((p) => p + 1); top.current?.scrollIntoView({ behavior: "smooth" }); } }}>
                {!def.settings.welcomeTitle && !def.settings.welcomeMessage && def.settings.instructions && pageIdx === 0 && <div className="mb-6 rounded-[var(--r)] bg-slate-50 p-4 text-sm text-slate-700"><Markdown text={def.settings.instructions} /></div>}
                {honeypot && (
                  <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
                    <label>Leave this field empty<input tabIndex={-1} autoComplete="off" value={hp} onChange={(e) => setHp(e.target.value)} name="website" /></label>
                  </div>
                )}
                {currentSections.map((sid) => {
                  const sec = sectionTitle(sid);
                  const qs = def.questions.filter((q) => q.sectionId === sid && visible.has(q.id));
                  return (
                    <section key={sid} className="mb-2" aria-label={sec?.title || undefined}>
                      {(sec?.title || sec?.description) && (def.sections.length > 1) && (
                        <div className="mb-6 border-b border-slate-100 pb-4">
                          {sec.title && <h2 className="text-lg font-semibold text-slate-900">{sec.title}</h2>}
                          {sec.description && <div className="mt-1 text-sm text-slate-600"><Markdown text={sec.description} /></div>}
                        </div>
                      )}
                      <div className="space-y-8">
                        {qs.map((q) => {
                          if (q.type === "heading") return <div key={q.id}><h2 className="text-lg font-semibold text-slate-900">{q.title}</h2>{q.description && <div className="mt-1 text-sm text-slate-600"><Markdown text={q.description} /></div>}</div>;
                          if (q.type === "statement") return <div key={q.id} className="rounded-[var(--r)] border-l-4 border-[var(--p)] bg-slate-50 px-4 py-3 text-[15px] text-slate-700"><Markdown text={[q.title, q.description].filter(Boolean).join("\n\n")} /></div>;
                          const err = errors[q.id];
                          const inputId = `in-${q.id}`;
                          const groupy = ["single_choice", "multiple_choice", "yes_no", "image_choice", "rating", "linear_scale", "likert", "file_upload"].includes(q.type);
                          const Label = (groupy ? "p" : "label") as "label";
                          return (
                            <div key={q.id} id={`q-${q.id}`} className="animate-fade-in scroll-mt-24" role={groupy ? "group" : undefined} aria-labelledby={groupy ? `lbl-${q.id}` : undefined}>
                              <Label id={`lbl-${q.id}`} htmlFor={groupy ? undefined : inputId} className="block text-[17px] font-medium leading-snug text-slate-900">
                                {q.title || <span className="text-slate-400">Untitled question</span>}
                                {q.required && <span className="ml-1 text-red-600" aria-label="required">*</span>}
                              </Label>
                              {q.description && <div id={`desc-${q.id}`} className="mt-1 text-sm text-slate-500"><Markdown text={q.description} /></div>}
                              {isMultiSelect(q) && (q.config.maxSelections || q.config.minSelections) && <p className="mt-1 text-xs text-slate-500">{q.config.minSelections ? `Choose at least ${q.config.minSelections}. ` : ""}{q.config.maxSelections ? `Choose up to ${q.config.maxSelections}.` : ""}</p>}
                              <div className="mt-3">
                                <QuestionInput q={q} inputId={inputId} value={answers[q.id]} other={other[q.id] ?? ""} onChange={(v) => set(q.id, v)} onOther={(s) => setOther((o) => ({ ...o, [q.id]: s }))} invalid={!!err} describedBy={[q.description ? `desc-${q.id}` : "", err ? `err-${q.id}` : ""].filter(Boolean).join(" ") || undefined} onUpload={onUpload} preview={mode === "preview"} />
                              </div>
                              {err && <p id={`err-${q.id}`} role="alert" className="mt-2 text-sm font-medium text-red-600">{err}</p>}
                            </div>
                          );
                        })}
                        {qs.length === 0 && <p className="text-sm text-slate-500">{mode === "preview" ? "This section has no visible questions." : ""}</p>}
                      </div>
                    </section>
                  );
                })}
                {isLast && collectEmail && (
                  <div className="mt-8">
                    <label htmlFor="resp-email" className="block text-[15px] font-medium text-slate-900">Your email <span className="text-slate-400">(optional)</span></label>
                    <p className="mt-1 text-xs text-slate-500">The form owner asked to collect respondent emails.</p>
                    <input id="resp-email" type="email" className={cn(inputCls, "mt-2")} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
                  </div>
                )}
                {formError && <p role="alert" className="mt-6 rounded-[var(--r)] bg-red-50 px-4 py-3 text-sm text-red-700">{formError}</p>}
                <div className="mt-10 flex items-center justify-between gap-3">
                  {paged && pageIdx > 0 ? <button type="button" onClick={() => { setPageIdx((p) => p - 1); top.current?.scrollIntoView({ behavior: "smooth" }); }} className="inline-flex h-12 items-center gap-2 rounded-[var(--r)] px-4 font-medium text-slate-600 hover:bg-slate-100"><ArrowLeft className="h-4 w-4" /> Back</button> : <span />}
                  <button type="submit" disabled={busy} className="inline-flex h-12 min-w-[140px] items-center justify-center gap-2 rounded-[var(--r)] bg-[var(--p)] px-6 font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-60">
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                    {isLast ? (mode === "preview" ? "Submit (preview)" : "Submit") : <>Next <ArrowRight className="h-4 w-4" /></>}
                  </button>
                </div>
              </form>
            )}

            {stage === "done" && (
              <div className="py-6 text-center" role="status">
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--p)]/10 text-[var(--p)]"><Check className="h-7 w-7" strokeWidth={2.5} /></span>
                <h2 className="mt-4 text-xl font-semibold text-slate-900">{def.settings.thankYouTitle || "Thank you!"}</h2>
                <div className="mt-2 text-slate-600"><Markdown text={def.settings.thankYouMessage || "Your response has been recorded."} /></div>
                {mode === "preview" && <p className="mt-4 text-xs text-slate-400">Preview mode — nothing was saved.</p>}
                {def.settings.allowAnotherResponse && <button onClick={() => { setAnswers({}); setOther({}); setPageIdx(0); setStage("form"); started.current = Date.now(); }} className="mt-6 text-sm font-medium text-[var(--p)] underline">Submit another response</button>}
              </div>
            )}
          </div>
        </div>
        {branding && <PoweredBy />}
      </div>
    </div>
  );
}

function PoweredBy(): ReactNode {
  return (
    <a href="/" target="_blank" rel="noopener" className="mx-auto mt-6 flex w-fit items-center gap-2 rounded-full bg-white/70 px-3 py-1.5 text-xs text-slate-500 shadow-sm hover:text-slate-700">
      <LogoMark size={16} /> Made with ProfJero DataLab
    </a>
  );
}
