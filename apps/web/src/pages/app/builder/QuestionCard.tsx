import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AlignLeft, Calendar, CheckSquare, ChevronDown, CircleDot, Clock, Copy, FileUp, GitBranch, GripVertical, Hash, Heading, Image, Link2, List, Mail, MessageSquareText, Phone, Plus, Rows3, SlidersHorizontal, Star, ThumbsUp, Trash2, Type, X } from "lucide-react";
import { choiceOptions, DISPLAY_TYPES, newId, OTHER_OPTION_ID, QUESTION_TYPE_META, type Question, type QuestionType } from "@datalab/shared";
import { cn } from "@/lib/utils";
import { Badge, Tooltip } from "@/components/ui/misc";

export const TYPE_ICONS: Record<QuestionType, typeof Type> = {
  short_text: Type, long_text: AlignLeft, single_choice: CircleDot, multiple_choice: CheckSquare, dropdown: ChevronDown, yes_no: ThumbsUp,
  number: Hash, email: Mail, phone: Phone, date: Calendar, time: Clock, rating: Star, linear_scale: SlidersHorizontal, likert: Rows3,
  file_upload: FileUp, image_choice: Image, url: Link2, heading: Heading, statement: MessageSquareText,
};

const bare = "w-full rounded-md border border-transparent bg-transparent px-2 py-1 hover:border-line focus:border-brand focus:bg-white focus:outline-none focus:shadow-focus";

function OptionsEditor({ q, onChange, locked }: { q: Question; onChange: (p: Partial<Question>) => void; locked: boolean }) {
  const opts = q.config.options ?? [];
  const multi = q.type === "multiple_choice" || (q.type === "image_choice" && q.config.multiple);
  const setOpts = (o: typeof opts) => onChange({ config: { ...q.config, options: o } });
  return (
    <div className="space-y-1.5">
      {opts.map((o, i) => (
        <div key={o.id} className="group flex items-center gap-2">
          <span className={cn("h-4 w-4 shrink-0 border-2 border-slate-300", multi ? "rounded" : "rounded-full")} aria-hidden />
          <input
            aria-label={`Option ${i + 1}`}
            className={cn(bare, "text-sm")}
            value={o.label}
            placeholder={`Option ${i + 1}`}
            onChange={(e) => setOpts(opts.map((x) => (x.id === o.id ? { ...x, label: e.target.value } : x)))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const n = { id: newId().slice(0, 8), label: "" };
                const next = [...opts];
                next.splice(i + 1, 0, n);
                setOpts(next);
                setTimeout(() => (document.querySelector(`[aria-label="Option ${i + 2}"]`) as HTMLInputElement | null)?.focus(), 0);
              }
            }}
          />
          {q.type === "image_choice" && <input aria-label={`Image URL for option ${i + 1}`} className={cn(bare, "w-40 text-xs text-ink-muted")} placeholder="Image URL" value={o.imageUrl ?? ""} onChange={(e) => setOpts(opts.map((x) => (x.id === o.id ? { ...x, imageUrl: e.target.value || undefined } : x)))} />}
          <button type="button" aria-label={`Remove option ${i + 1}`} disabled={opts.length <= 1} onClick={() => setOpts(opts.filter((x) => x.id !== o.id))} className="rounded p-1 text-ink-subtle opacity-0 hover:bg-slate-100 hover:text-red-600 group-hover:opacity-100 focus:opacity-100 disabled:hidden">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      {q.config.allowOther && <div className="flex items-center gap-2 pl-6 text-sm italic text-ink-muted">Other (please specify)</div>}
      <div className="flex flex-wrap gap-3 pl-6 pt-1">
        <button type="button" className="inline-flex items-center gap-1 text-sm font-medium text-brand" onClick={() => setOpts([...opts, { id: newId().slice(0, 8), label: "" }])}><Plus className="h-3.5 w-3.5" /> Add option</button>
        {q.type !== "image_choice" && !q.config.allowOther && <button type="button" className="text-sm text-ink-muted hover:text-navy" onClick={() => onChange({ config: { ...q.config, allowOther: true } })}>Add “Other”</button>}
        {q.config.allowOther && <button type="button" className="text-sm text-ink-muted hover:text-navy" onClick={() => onChange({ config: { ...q.config, allowOther: false } })}>Remove “Other”</button>}
        {q.type !== "image_choice" && <BulkAdd onAdd={(labels) => setOpts([...opts.filter((o) => o.label.trim()), ...labels.map((label) => ({ id: newId().slice(0, 8), label }))])} />}
      </div>
      {locked && <p className="pl-6 text-xs text-amber-700">This question has responses. Removing options keeps old answers visible in analytics as “Removed option”.</p>}
    </div>
  );
}

function BulkAdd({ onAdd }: { onAdd: (labels: string[]) => void }) {
  return (
    <button
      type="button"
      className="text-sm text-ink-muted hover:text-navy"
      onClick={() => {
        const text = window.prompt("Paste options, one per line:");
        if (text) onAdd(text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).slice(0, 200));
      }}
    >
      Paste list
    </button>
  );
}

function LikertEditor({ q, onChange }: { q: Question; onChange: (p: Partial<Question>) => void }) {
  const rows = q.config.rows ?? [];
  const labels = q.config.scaleLabels ?? [];
  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-muted">Statements</p>
        {rows.map((r, i) => (
          <div key={r.id} className="flex items-center gap-2">
            <span className="w-5 text-right text-xs text-ink-subtle">{i + 1}</span>
            <input aria-label={`Statement ${i + 1}`} className={cn(bare, "text-sm")} value={r.label} onChange={(e) => onChange({ config: { ...q.config, rows: rows.map((x) => (x.id === r.id ? { ...x, label: e.target.value } : x)) } })} />
            <button type="button" aria-label={`Remove statement ${i + 1}`} disabled={rows.length <= 1} onClick={() => onChange({ config: { ...q.config, rows: rows.filter((x) => x.id !== r.id) } })} className="rounded p-1 text-ink-subtle hover:text-red-600 disabled:hidden"><X className="h-4 w-4" /></button>
          </div>
        ))}
        <button type="button" className="mt-1 inline-flex items-center gap-1 pl-7 text-sm font-medium text-brand" onClick={() => onChange({ config: { ...q.config, rows: [...rows, { id: newId().slice(0, 8), label: "" }] } })}><Plus className="h-3.5 w-3.5" /> Add statement</button>
      </div>
      <div>
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-muted">Scale labels</p>
        <div className="flex flex-wrap gap-2">
          {labels.map((l, i) => <input key={i} aria-label={`Scale label ${i + 1}`} className="w-32 rounded-md border border-line px-2 py-1 text-xs" value={l} onChange={(e) => onChange({ config: { ...q.config, scaleLabels: labels.map((x, j) => (j === i ? e.target.value : x)) } })} />)}
        </div>
      </div>
    </div>
  );
}

function AnswerPreview({ q }: { q: Question }) {
  const box = "rounded-lg border border-dashed border-line bg-canvas/60 px-3 py-2.5 text-sm text-ink-subtle";
  switch (q.type) {
    case "short_text": case "email": case "phone": case "url": case "number": return <div className={box}>{q.config.placeholder || QUESTION_TYPE_META[q.type].label + " answer"}</div>;
    case "long_text": return <div className={cn(box, "h-20")}>{q.config.placeholder || "Long answer"}</div>;
    case "date": return <div className={box}>dd / mm / yyyy</div>;
    case "time": return <div className={box}>hh : mm</div>;
    case "yes_no": return <div className="grid grid-cols-2 gap-2">{["Yes", "No"].map((l) => <div key={l} className="rounded-lg border border-line px-3 py-2 text-sm text-ink-muted">{l}</div>)}</div>;
    case "rating": return <div className="flex gap-1">{Array.from({ length: q.config.scaleMax ?? 5 }).map((_, i) => <Star key={i} className="h-6 w-6 text-slate-300" />)}</div>;
    case "linear_scale": {
      const lo = q.config.scaleMin ?? 1;
      const hi = q.config.scaleMax ?? 5;
      return <div><div className="flex gap-1">{Array.from({ length: hi - lo + 1 }).map((_, i) => <span key={i} className="flex h-8 flex-1 items-center justify-center rounded border border-line text-xs text-ink-muted">{lo + i}</span>)}</div><div className="mt-1 flex justify-between text-xs text-ink-subtle"><span>{q.config.minLabel}</span><span>{q.config.maxLabel}</span></div></div>;
    }
    case "file_upload": return <div className={cn(box, "flex items-center gap-2")}><FileUp className="h-4 w-4" /> {(q.config.allowedFileTypes ?? []).join(", ").toUpperCase()} · up to {q.config.maxFileSizeMb ?? 5} MB</div>;
    default: return null;
  }
}

export function QuestionCard({ q, index, selected, onSelect, onChange, onDuplicate, onRemove, locked, hasIssue, canEdit }: { q: Question; index: number | null; selected: boolean; onSelect: () => void; onChange: (p: Partial<Question>) => void; onDuplicate: () => void; onRemove: () => void; locked: boolean; hasIssue: boolean; canEdit: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: q.id, disabled: !canEdit });
  const Icon = TYPE_ICONS[q.type];
  const display = DISPLAY_TYPES.includes(q.type);
  const choice = ["single_choice", "multiple_choice", "dropdown", "image_choice"].includes(q.type);
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onClick={onSelect}
      onFocusCapture={onSelect}
      className={cn("group relative rounded-xl border bg-white p-4 pl-10 transition sm:p-5 sm:pl-11", selected ? "border-brand shadow-[0_0_0_3px_rgba(40,100,197,.15)]" : "border-line hover:border-slate-300", isDragging && "z-10 opacity-80 shadow-pop", hasIssue && !selected && "border-amber-300")}
    >
      {canEdit && (
        <button type="button" {...attributes} {...listeners} className="absolute left-2 top-4 cursor-grab touch-none rounded p-1 text-ink-subtle hover:bg-slate-100 hover:text-navy active:cursor-grabbing" aria-label={`Drag to reorder question ${index ?? ""}`}>
          <GripVertical className="h-4 w-4" />
        </button>
      )}
      <div className="mb-2 flex items-center gap-2 text-xs text-ink-muted">
        <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 font-medium"><Icon className="h-3.5 w-3.5" /> {index !== null ? `Q${index} · ` : ""}{QUESTION_TYPE_META[q.type].label}</span>
        {q.required && <Badge tone="red">Required</Badge>}
        {q.visibility && <Tooltip content="Shown only when its conditions are met"><span><Badge tone="brand"><GitBranch /> Logic</Badge></span></Tooltip>}
        {locked && <Badge tone="amber">Has responses</Badge>}
        {canEdit && (
          <span className="ml-auto flex gap-0.5 opacity-100 sm:opacity-0 sm:transition sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
            <button type="button" onClick={(e) => { e.stopPropagation(); onDuplicate(); }} className="rounded p-1.5 hover:bg-slate-100" aria-label="Duplicate question"><Copy className="h-4 w-4" /></button>
            <button type="button" onClick={(e) => { e.stopPropagation(); onRemove(); }} className="rounded p-1.5 hover:bg-red-50 hover:text-red-600" aria-label="Delete question"><Trash2 className="h-4 w-4" /></button>
          </span>
        )}
      </div>
      <input
        aria-label="Question title"
        readOnly={!canEdit}
        className={cn(bare, "-ml-2 text-[15px] font-medium text-navy", display && q.type === "heading" && "text-lg font-semibold")}
        value={q.title}
        placeholder={q.type === "statement" ? "Write an informational statement" : q.type === "heading" ? "Section heading" : "Type your question"}
        onChange={(e) => onChange({ title: e.target.value })}
      />
      {(selected || q.description) && (
        <textarea aria-label="Help text" readOnly={!canEdit} rows={1} className={cn(bare, "-ml-2 mt-1 resize-none text-sm text-ink-muted")} value={q.description ?? ""} placeholder="Add help text (optional)" onChange={(e) => onChange({ description: e.target.value })} />
      )}
      <div className="mt-3">
        {choice && (selected && canEdit ? <OptionsEditor q={q} onChange={onChange} locked={locked} /> : (
          <ul className="space-y-1.5">{choiceOptions(q).slice(0, 6).map((o) => <li key={o.id} className="flex items-center gap-2 text-sm text-ink-muted"><span className={cn("h-3.5 w-3.5 border-2 border-slate-300", q.type === "multiple_choice" ? "rounded" : "rounded-full")} />{o.id === OTHER_OPTION_ID ? "Other" : o.label || <em>Empty option</em>}</li>)}{choiceOptions(q).length > 6 && <li className="text-xs text-ink-subtle">+{choiceOptions(q).length - 6} more</li>}</ul>
        ))}
        {q.type === "likert" && (selected && canEdit ? <LikertEditor q={q} onChange={onChange} /> : <div className="space-y-1 text-sm text-ink-muted"><List className="mr-1 inline h-3.5 w-3.5" />{(q.config.rows ?? []).length} statements · {(q.config.scaleLabels ?? []).length}-point scale</div>)}
        {!choice && q.type !== "likert" && !display && <AnswerPreview q={q} />}
      </div>
    </div>
  );
}
