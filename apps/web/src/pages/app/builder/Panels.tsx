import { useState } from "react";
import { GitBranch, ImagePlus, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  choiceOptions,
  CONDITION_OPERATORS,
  DISPLAY_TYPES,
  QUESTION_TYPE_META,
  QUESTION_TYPES,
  type Condition,
  type ConditionGroup,
  type ConditionOperator,
  type FormDefinition,
  type Question,
  type QuestionType,
  type Section,
} from "@datalab/shared";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Badge, Switch } from "@/components/ui/misc";
import { uploadImage } from "@/lib/uploads";
import { cn } from "@/lib/utils";

const OP_LABELS: Record<ConditionOperator, string> = {
  equals: "is",
  not_equals: "is not",
  contains: "includes",
  not_contains: "does not include",
  gt: "is greater than",
  gte: "is at least",
  lt: "is less than",
  lte: "is at most",
  is_answered: "is answered",
  is_not_answered: "is not answered",
};

function opsFor(q: Question): ConditionOperator[] {
  if (["single_choice", "dropdown", "yes_no"].includes(q.type) || (q.type === "image_choice" && !q.config.multiple)) return ["equals", "not_equals", "is_answered", "is_not_answered"];
  if (q.type === "multiple_choice" || q.type === "image_choice") return ["contains", "not_contains", "is_answered", "is_not_answered"];
  if (["number", "rating", "linear_scale"].includes(q.type)) return ["equals", "not_equals", "gt", "gte", "lt", "lte", "is_answered", "is_not_answered"];
  return ["equals", "not_equals", "contains", "not_contains", "is_answered", "is_not_answered"];
}

/** Plain-language rule builder: “Show this question when [question] [is] [value]”. */
export function ConditionEditor({ group, candidates, onChange, labelOf }: { group: ConditionGroup | null; candidates: Question[]; onChange: (g: ConditionGroup | null) => void; labelOf: (id: string) => string }) {
  if (!candidates.length) return <p className="text-xs text-ink-muted">Rules can only depend on questions that come earlier in the form. Add a question above this one first.</p>;
  const g = group ?? { match: "all" as const, conditions: [] };
  const setCond = (i: number, c: Partial<Condition>) => onChange({ ...g, conditions: g.conditions.map((x, j) => (j === i ? { ...x, ...c } : x)) });
  const add = () => {
    const q = candidates[candidates.length - 1];
    const op = opsFor(q)[0];
    const firstOpt = choiceOptions(q)[0]?.id ?? "";
    onChange({ ...g, conditions: [...g.conditions, { questionId: q.id, operator: op, value: firstOpt || "" }] });
  };
  return (
    <div className="space-y-2">
      {g.conditions.length > 1 && (
        <div className="flex items-center gap-2 text-xs text-ink-muted">
          Match
          <Select className="h-8 w-24 text-xs" value={g.match} onChange={(e) => onChange({ ...g, match: e.target.value as "all" | "any" })} aria-label="Match all or any">
            <option value="all">all</option>
            <option value="any">any</option>
          </Select>
          of these conditions
        </div>
      )}
      {g.conditions.map((c, i) => {
        const q = candidates.find((x) => x.id === c.questionId);
        const ops = q ? opsFor(q) : [...CONDITION_OPERATORS];
        const opts = q ? choiceOptions(q) : [];
        const needsValue = !["is_answered", "is_not_answered"].includes(c.operator);
        return (
          <div key={i} className="space-y-1.5 rounded-lg border border-line bg-canvas p-2.5">
            <div className="flex items-center gap-1.5">
              <span className="w-8 text-xs font-medium text-ink-muted">{i === 0 ? "When" : g.match === "all" ? "and" : "or"}</span>
              <Select className="h-8 flex-1 text-xs" aria-label="Question" value={c.questionId} onChange={(e) => { const nq = candidates.find((x) => x.id === e.target.value)!; setCond(i, { questionId: nq.id, operator: opsFor(nq)[0], value: choiceOptions(nq)[0]?.id ?? "" }); }}>
                {candidates.map((cq) => <option key={cq.id} value={cq.id}>{labelOf(cq.id)}: {cq.title || "Untitled"}</option>)}
              </Select>
              <button type="button" aria-label="Remove condition" onClick={() => { const rest = g.conditions.filter((_, j) => j !== i); onChange(rest.length ? { ...g, conditions: rest } : null); }} className="rounded p-1 text-ink-subtle hover:text-red-600"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex gap-1.5 pl-[38px]">
              <Select className="h-8 w-40 text-xs" aria-label="Operator" value={c.operator} onChange={(e) => setCond(i, { operator: e.target.value as ConditionOperator })}>
                {ops.map((o) => <option key={o} value={o}>{OP_LABELS[o]}</option>)}
              </Select>
              {needsValue && (opts.length ? (
                <Select className="h-8 flex-1 text-xs" aria-label="Value" value={String(c.value ?? "")} onChange={(e) => setCond(i, { value: e.target.value })}>
                  {opts.map((o) => <option key={o.id} value={o.id}>{o.label || "(empty)"}</option>)}
                </Select>
              ) : (
                <Input className="h-8 flex-1 text-xs" aria-label="Value" type={q && ["number", "rating", "linear_scale"].includes(q.type) ? "number" : "text"} value={String(c.value ?? "")} onChange={(e) => setCond(i, { value: q && ["number", "rating", "linear_scale"].includes(q.type) ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value })} />
              ))}
            </div>
          </div>
        );
      })}
      <Button type="button" variant="subtle" size="sm" onClick={add}><Plus /> Add condition</Button>
    </div>
  );
}

export function QuestionSettings({ q, def, onChange, onTypeChange, locked, labelOf, hasLogic, hasAdvanced, sections, onMoveToSection }: { q: Question; def: FormDefinition; onChange: (p: Partial<Question>) => void; onTypeChange: (t: QuestionType) => void; locked: boolean; labelOf: (id: string) => string; hasLogic: boolean; hasAdvanced: boolean; sections: Section[]; onMoveToSection: (sid: string) => void }) {
  const c = q.config;
  const setC = (patch: Partial<Question["config"]>) => onChange({ config: { ...c, ...patch } });
  const idx = def.questions.findIndex((x) => x.id === q.id);
  const sectionIdx = def.sections.findIndex((s) => s.id === q.sectionId);
  const candidates = def.questions.filter((x, i) => !DISPLAY_TYPES.includes(x.type) && (def.sections.findIndex((s) => s.id === x.sectionId) < sectionIdx || (x.sectionId === q.sectionId && i < idx)));
  const display = DISPLAY_TYPES.includes(q.type);
  const num = (v: string) => (v === "" ? undefined : Number(v));
  return (
    <div className="space-y-6">
      <Field label="Question type" hint={locked ? "Locked because this question already has responses." : undefined}>
        {(id) => (
          <Select id={id} value={q.type} disabled={locked} onChange={(e) => onTypeChange(e.target.value as QuestionType)}>
            {(["Text", "Choice", "Scale", "Contact", "Date & time", "Media", "Layout"] as const).map((g) => (
              <optgroup key={g} label={g}>
                {QUESTION_TYPES.filter((t) => QUESTION_TYPE_META[t].group === g).map((t) => <option key={t} value={t}>{QUESTION_TYPE_META[t].label}{["file_upload", "image_choice"].includes(t) && !hasAdvanced ? " (Pro)" : ""}</option>)}
              </optgroup>
            ))}
          </Select>
        )}
      </Field>
      {!display && <Switch checked={q.required} onCheckedChange={(v) => onChange({ required: v })} label="Required" description="Respondents must answer before continuing." />}
      {def.sections.length > 1 && (
        <Field label="Section">{(id) => <Select id={id} value={q.sectionId} onChange={(e) => onMoveToSection(e.target.value)}>{sections.map((s, i) => <option key={s.id} value={s.id}>{i + 1}. {s.title || "Untitled section"}</option>)}</Select>}</Field>
      )}

      {["short_text", "long_text", "email", "phone", "url", "number"].includes(q.type) && <Field label="Placeholder">{(id) => <Input id={id} value={c.placeholder ?? ""} onChange={(e) => setC({ placeholder: e.target.value || undefined })} />}</Field>}
      {["short_text", "long_text"].includes(q.type) && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Min length">{(id) => <Input id={id} type="number" min={0} value={c.minLength ?? ""} onChange={(e) => setC({ minLength: num(e.target.value) })} />}</Field>
          <Field label="Max length">{(id) => <Input id={id} type="number" min={1} value={c.maxLength ?? ""} onChange={(e) => setC({ maxLength: num(e.target.value) })} />}</Field>
        </div>
      )}
      {q.type === "number" && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Minimum">{(id) => <Input id={id} type="number" value={c.min ?? ""} onChange={(e) => setC({ min: num(e.target.value) })} />}</Field>
            <Field label="Maximum">{(id) => <Input id={id} type="number" value={c.max ?? ""} onChange={(e) => setC({ max: num(e.target.value) })} />}</Field>
          </div>
          <Switch checked={!!c.integerOnly} onCheckedChange={(v) => setC({ integerOnly: v })} label="Whole numbers only" />
        </>
      )}
      {q.type === "multiple_choice" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Min selections">{(id) => <Input id={id} type="number" min={0} value={c.minSelections ?? ""} onChange={(e) => setC({ minSelections: num(e.target.value) })} />}</Field>
          <Field label="Max selections">{(id) => <Input id={id} type="number" min={1} value={c.maxSelections ?? ""} onChange={(e) => setC({ maxSelections: num(e.target.value) })} />}</Field>
        </div>
      )}
      {q.type === "image_choice" && <Switch checked={!!c.multiple} onCheckedChange={(v) => setC({ multiple: v })} label="Allow multiple selections" />}
      {q.type === "rating" && <Field label="Number of stars">{(id) => <Select id={id} value={c.scaleMax ?? 5} onChange={(e) => setC({ scaleMax: Number(e.target.value) })}>{[3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n}</option>)}</Select>}</Field>}
      {q.type === "linear_scale" && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="From">{(id) => <Select id={id} value={c.scaleMin ?? 1} onChange={(e) => setC({ scaleMin: Number(e.target.value) })}><option value={0}>0</option><option value={1}>1</option></Select>}</Field>
            <Field label="To">{(id) => <Select id={id} value={c.scaleMax ?? 5} onChange={(e) => setC({ scaleMax: Number(e.target.value) })}>{[3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n}</option>)}</Select>}</Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Low label">{(id) => <Input id={id} value={c.minLabel ?? ""} onChange={(e) => setC({ minLabel: e.target.value || undefined })} />}</Field>
            <Field label="High label">{(id) => <Input id={id} value={c.maxLabel ?? ""} onChange={(e) => setC({ maxLabel: e.target.value || undefined })} />}</Field>
          </div>
        </>
      )}
      {q.type === "file_upload" && (
        <>
          <Field label="Allowed file types" hint="Comma-separated extensions, e.g. pdf, jpg, png, docx">{(id) => <Input id={id} value={(c.allowedFileTypes ?? []).join(", ")} onChange={(e) => setC({ allowedFileTypes: e.target.value.split(",").map((s) => s.trim().toLowerCase().replace(/^\./, "")).filter(Boolean).slice(0, 20) })} />}</Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Max size (MB)">{(id) => <Input id={id} type="number" min={1} max={25} value={c.maxFileSizeMb ?? 5} onChange={(e) => setC({ maxFileSizeMb: Math.min(25, Math.max(1, Number(e.target.value) || 5)) })} />}</Field>
            <Field label="Max files">{(id) => <Input id={id} type="number" min={1} max={10} value={c.maxFiles ?? 1} onChange={(e) => setC({ maxFiles: Math.min(10, Math.max(1, Number(e.target.value) || 1)) })} />}</Field>
          </div>
        </>
      )}
      {!display && <Field label="Custom error message" hint="Shown instead of the default validation message.">{(id) => <Input id={id} value={c.errorMessage ?? ""} onChange={(e) => setC({ errorMessage: e.target.value || undefined })} />}</Field>}

      <div className="rounded-xl border border-line p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="flex items-center gap-2 text-sm font-semibold text-navy"><GitBranch className="h-4 w-4 text-brand" /> Conditional logic</p>
          {!hasLogic && <Badge tone="brand">Pro</Badge>}
        </div>
        <p className="mb-3 text-xs text-ink-muted">Show this question only when earlier answers match.{!hasLogic && " You can design logic now; publishing a form with logic requires the Pro plan or higher."}</p>
        <ConditionEditor group={q.visibility ?? null} candidates={candidates} onChange={(g) => onChange({ visibility: g })} labelOf={labelOf} />
      </div>
    </div>
  );
}

export function SectionJumps({ section, def, labelOf, onChange }: { section: Section; def: FormDefinition; labelOf: (id: string) => string; onChange: (s: Partial<Section>) => void }) {
  const si = def.sections.findIndex((s) => s.id === section.id);
  const candidates = def.questions.filter((q) => !DISPLAY_TYPES.includes(q.type) && def.sections.findIndex((s) => s.id === q.sectionId) <= si);
  const later = def.sections.slice(si + 1);
  return (
    <div className="space-y-3">
      {section.jumps.map((j, i) => (
        <div key={i} className="rounded-lg border border-line p-3">
          <ConditionEditor group={j.when} candidates={candidates} labelOf={labelOf} onChange={(g) => onChange({ jumps: g ? section.jumps.map((x, k) => (k === i ? { ...x, when: g } : x)) : section.jumps.filter((_, k) => k !== i) })} />
          <div className="mt-2 flex items-center gap-2 text-xs text-ink-muted">
            then go to
            <Select className="h-8 flex-1 text-xs" aria-label="Jump destination" value={j.goTo} onChange={(e) => onChange({ jumps: section.jumps.map((x, k) => (k === i ? { ...x, goTo: e.target.value as string } : x)) })}>
              {later.map((s) => <option key={s.id} value={s.id}>Section {def.sections.indexOf(s) + 1}: {s.title || "Untitled"}</option>)}
              <option value="submit">End of form (submit)</option>
            </Select>
            <button aria-label="Remove jump" onClick={() => onChange({ jumps: section.jumps.filter((_, k) => k !== i) })} className="rounded p-1 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
          </div>
        </div>
      ))}
      {candidates.length > 0 ? (
        <Button
          variant="subtle"
          size="sm"
          onClick={() => {
            const q = candidates[candidates.length - 1];
            onChange({ jumps: [...section.jumps, { when: { match: "all", conditions: [{ questionId: q.id, operator: ["multiple_choice"].includes(q.type) ? "contains" : "equals", value: choiceOptions(q)[0]?.id ?? "" }] }, goTo: later[0]?.id ?? "submit" }] });
          }}
        >
          <Plus /> Add skip rule
        </Button>
      ) : <p className="text-xs text-ink-muted">Add questions to this section to create skip rules.</p>}
      <p className="text-xs text-ink-muted">Otherwise, continue to the next section. Rules are checked in order; the first match wins.</p>
    </div>
  );
}

function ImageField({ label, value, onChange, workspaceId, formId, purpose, uploadsEnabled }: { label: string; value: string | null | undefined; onChange: (v: string | null) => void; workspaceId: string; formId: string; purpose: "form_cover" | "form_logo"; uploadsEnabled: boolean }) {
  const [busy, setBusy] = useState(false);
  return (
    <Field label={label} hint={uploadsEnabled ? "PNG, JPG, WebP or SVG up to 5 MB." : "Image uploads are not configured yet — paste an https image URL instead."}>
      {(id) => (
        <div className="space-y-2">
          {value && (
            <div className="relative overflow-hidden rounded-lg border border-line">
              <img src={value} alt="" className={cn("w-full object-cover", purpose === "form_cover" ? "h-24" : "h-14 object-contain p-2")} />
              <button onClick={() => onChange(null)} aria-label={`Remove ${label}`} className="absolute right-1.5 top-1.5 rounded-md bg-white/90 p-1 shadow"><X className="h-4 w-4" /></button>
            </div>
          )}
          {uploadsEnabled ? (
            <label className={cn("flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-line px-3 py-3 text-sm text-ink-muted hover:border-brand", busy && "opacity-60")}>
              <ImagePlus className="h-4 w-4" /> {busy ? "Uploading…" : value ? "Replace image" : "Upload image"}
              <input
                id={id}
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={busy}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  setBusy(true);
                  try {
                    onChange(await uploadImage({ purpose, workspaceId, formId, file: f }));
                  } catch (er) {
                    toast.error((er as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </label>
          ) : (
            <Input id={id} placeholder="https://…" defaultValue={value ?? ""} onBlur={(e) => { const v = e.target.value.trim(); if (!v) return onChange(null); if (!/^https:\/\//.test(v)) return toast.error("Use an https:// image URL."); onChange(v); }} />
          )}
        </div>
      )}
    </Field>
  );
}

export function FormSettingsPanel({ def, update, workspaceId, formId, uploadsEnabled }: { def: FormDefinition; update: (fn: (d: FormDefinition) => FormDefinition) => void; workspaceId: string; formId: string; uploadsEnabled: boolean }) {
  const s = def.settings;
  const setS = (p: Partial<FormDefinition["settings"]>) => update((d) => ({ ...d, settings: { ...d.settings, ...p } }));
  return (
    <div className="space-y-5">
      <Field label="Form title" required>{(id) => <Input id={id} value={def.title} maxLength={300} onChange={(e) => update((d) => ({ ...d, title: e.target.value }))} />}</Field>
      <Field label="Description" hint="Supports **bold**, _italic_ and lists.">{(id) => <Textarea id={id} value={def.description ?? ""} onChange={(e) => update((d) => ({ ...d, description: e.target.value }))} />}</Field>
      <ImageField label="Cover image" value={def.coverImageUrl} onChange={(v) => update((d) => ({ ...d, coverImageUrl: v }))} workspaceId={workspaceId} formId={formId} purpose="form_cover" uploadsEnabled={uploadsEnabled} />
      <ImageField label="Form logo" value={def.logoUrl} onChange={(v) => update((d) => ({ ...d, logoUrl: v }))} workspaceId={workspaceId} formId={formId} purpose="form_logo" uploadsEnabled={uploadsEnabled} />
      <hr className="border-line" />
      <Field label="Layout">{(id) => <Select id={id} value={s.layout} onChange={(e) => setS({ layout: e.target.value as "single" | "paged" })}><option value="paged">One section per page</option><option value="single">All questions on one page</option></Select>}</Field>
      <Switch checked={s.showProgress} onCheckedChange={(v) => setS({ showProgress: v })} label="Show progress bar" />
      <hr className="border-line" />
      <Field label="Welcome title">{(id) => <Input id={id} value={s.welcomeTitle ?? ""} onChange={(e) => setS({ welcomeTitle: e.target.value || null })} placeholder="Optional welcome screen" />}</Field>
      <Field label="Welcome message">{(id) => <Textarea id={id} value={s.welcomeMessage ?? ""} onChange={(e) => setS({ welcomeMessage: e.target.value || null })} />}</Field>
      <Field label="Instructions">{(id) => <Textarea id={id} value={s.instructions ?? ""} onChange={(e) => setS({ instructions: e.target.value || null })} />}</Field>
      <hr className="border-line" />
      <Field label="Thank-you title">{(id) => <Input id={id} value={s.thankYouTitle} onChange={(e) => setS({ thankYouTitle: e.target.value })} />}</Field>
      <Field label="Thank-you message">{(id) => <Textarea id={id} value={s.thankYouMessage} onChange={(e) => setS({ thankYouMessage: e.target.value })} />}</Field>
      <Field label="Redirect after submit (optional)" hint="An https:// URL respondents are sent to after the thank-you message.">{(id) => <Input id={id} defaultValue={s.redirectUrl ?? ""} onBlur={(e) => { const v = e.target.value.trim(); if (v && !/^https:\/\/\S+$/.test(v)) return toast.error("Use an https:// URL."); setS({ redirectUrl: v || null }); }} />}</Field>
      <Switch checked={s.allowAnotherResponse} onCheckedChange={(v) => setS({ allowAnotherResponse: v })} label="Allow submitting another response" />
    </div>
  );
}

const PRESETS = ["#2864C5", "#112442", "#20A47A", "#7C3AED", "#DB2777", "#EA580C", "#0F766E", "#334155"];
const BG = ["#F5F7FB", "#FFFFFF", "#F0FDF4", "#FDF4FF", "#FFF7ED", "#F1F5F9"];

export function ThemePanel({ def, update }: { def: FormDefinition; update: (fn: (d: FormDefinition) => FormDefinition) => void }) {
  const t = def.theme;
  const setT = (p: Partial<FormDefinition["theme"]>) => update((d) => ({ ...d, theme: { ...d.theme, ...p } }));
  return (
    <div className="space-y-5">
      <div>
        <p className="label mb-2">Accent colour</p>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((c) => <button key={c} aria-label={`Accent ${c}`} aria-pressed={t.primary === c} onClick={() => setT({ primary: c })} className={cn("h-8 w-8 rounded-full ring-offset-2 transition", t.primary === c && "ring-2 ring-navy")} style={{ background: c }} />)}
          <input type="color" aria-label="Custom accent colour" value={t.primary} onChange={(e) => setT({ primary: e.target.value.toUpperCase() })} className="h-8 w-10 cursor-pointer rounded border border-line" />
        </div>
      </div>
      <div>
        <p className="label mb-2">Background</p>
        <div className="flex flex-wrap gap-2">{BG.map((c) => <button key={c} aria-label={`Background ${c}`} aria-pressed={t.background === c} onClick={() => setT({ background: c })} className={cn("h-8 w-8 rounded-full border border-line ring-offset-2", t.background === c && "ring-2 ring-navy")} style={{ background: c }} />)}</div>
      </div>
      <Field label="Font">{(id) => <Select id={id} value={t.font} onChange={(e) => setT({ font: e.target.value as "Inter" })}><option value="Inter">Inter (modern)</option><option value="Manrope">Manrope (friendly)</option><option value="Serif">Serif (academic)</option></Select>}</Field>
      <Field label="Corner style">{(id) => <Select id={id} value={t.radius} onChange={(e) => setT({ radius: e.target.value as "md" })}><option value="sm">Sharp</option><option value="md">Rounded</option><option value="lg">Soft</option></Select>}</Field>
    </div>
  );
}
