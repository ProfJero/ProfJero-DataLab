import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import * as Popover from "@radix-ui/react-popover";
import { toast } from "sonner";
import { AlertTriangle, ArrowDown, ArrowLeft, ArrowUp, Check, ChevronRight, CloudOff, Eye, FileInput, GitBranch, Loader2, Palette, Plus, Redo2, Rocket, Settings2, SlidersHorizontal, Trash2, Undo2, X } from "lucide-react";
import { defaultQuestion, DISPLAY_TYPES, importQuestionsFromText, publishIssues, QUESTION_TYPE_META, QUESTION_TYPES, type FormDefinition, type QuestionType } from "@datalab/shared";
import { Button } from "@/components/ui/button";
import { Badge, ErrorState, Spinner, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/misc";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";
import { LogoMark } from "@/components/brand/Logo";
import { getForm, setStatus, type FormDetail } from "@/lib/forms";
import { ApiRequestError } from "@/lib/api";
import { useWorkspace } from "@/hooks/useWorkspace";
import { usePlatformConfig } from "@/hooks/useConfig";
import { cn, timeAgo } from "@/lib/utils";
import { useBuilder, type SaveState } from "./useBuilder";
import { QuestionCard, TYPE_ICONS } from "./QuestionCard";
import { FormSettingsPanel, QuestionSettings, SectionJumps, ThemePanel } from "./Panels";

function SaveIndicator({ state, error, lastSaved, onRetry }: { state: SaveState; error: string | null; lastSaved: Date | null; onRetry: () => void }) {
  const map = {
    saved: [Check, "Saved", "text-insight-600"],
    saving: [Loader2, "Saving…", "text-ink-muted"],
    unsaved: [Loader2, "Unsaved changes", "text-ink-muted"],
    error: [CloudOff, "Save failed", "text-red-600"],
    conflict: [AlertTriangle, "Edited elsewhere", "text-amber-700"],
  } as const;
  const [Icon, label, cls] = map[state];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", cls)} role="status" aria-live="polite" title={error ?? (lastSaved ? `Last saved ${timeAgo(lastSaved)}` : undefined)}>
      <Icon className={cn("h-3.5 w-3.5", state === "saving" && "animate-spin", state === "unsaved" && "animate-none opacity-0 w-0")} />
      {label}
      {state === "error" && <button onClick={onRetry} className="underline">Retry</button>}
      {state === "conflict" && <button onClick={() => window.location.reload()} className="underline">Reload</button>}
    </span>
  );
}

function AddQuestionMenu({ onAdd, hasAdvanced, children }: { onAdd: (t: QuestionType) => void; hasAdvanced: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content sideOffset={8} align="center" collisionPadding={12} className="z-50 max-h-[var(--radix-popover-content-available-height)] w-[min(560px,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-line bg-white p-3 shadow-pop">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
            {(["Text", "Choice", "Scale", "Contact", "Date & time", "Media", "Layout"] as const).map((g) => (
              <div key={g}>
                <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">{g}</p>
                {QUESTION_TYPES.filter((t) => QUESTION_TYPE_META[t].group === g).map((t) => {
                  const Icon = TYPE_ICONS[t];
                  const pro = ["file_upload", "image_choice"].includes(t) && !hasAdvanced;
                  return (
                    <button key={t} onClick={() => { onAdd(t); setOpen(false); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-navy hover:bg-brand-50">
                      <Icon className="h-4 w-4 text-brand" /> {QUESTION_TYPE_META[t].label}
                      {pro && <Badge tone="brand" className="ml-auto">Pro</Badge>}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function Editor({ form }: { form: FormDetail }) {
  const b = useBuilder(form.id, form.definition, form.version);
  const { def } = b;
  const { can, has, current } = useWorkspace();
  const cfg = usePlatformConfig();
  const qc = useQueryClient();
  const nav = useNavigate();
  const canEdit = can("forms.edit") && form.status !== "archived";
  const [selected, setSelected] = useState<string | null>(null);
  const [panel, setPanel] = useState<"question" | "form" | "theme">("form");
  const [mobilePanel, setMobilePanel] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [status, setStatusState] = useState(form.status);
  const [publishing, setPublishing] = useState(false);
  const [openSection, setOpenSection] = useState<string | null>(null);
  const answered = useMemo(() => new Set(form.answeredQuestionIds), [form.answeredQuestionIds]);

  const labels = useMemo(() => {
    const m = new Map<string, string>();
    let n = 0;
    const order = new Map(def.sections.map((s, i) => [s.id, i]));
    [...def.questions].sort((a, b2) => (order.get(a.sectionId)! - order.get(b2.sectionId)!)).forEach((q) => { if (!DISPLAY_TYPES.includes(q.type)) m.set(q.id, `Q${++n}`); });
    return m;
  }, [def]);
  const labelOf = (id: string) => labels.get(id) ?? "Q?";
  const issues = useMemo(() => publishIssues(def), [def]);
  const issueIds = new Set(issues.map((i) => i.questionId).filter(Boolean));
  const sel = def.questions.find((q) => q.id === selected) ?? null;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const select = (id: string | null) => {
    setSelected(id);
    setPanel(id ? "question" : "form");
  };
  const add = (t: QuestionType, sectionId?: string) => {
    const sid = sectionId ?? sel?.sectionId ?? def.sections[def.sections.length - 1].id;
    const q = b.addQuestion(t, sid, sectionId ? null : selected);
    select(q.id);
    setTimeout(() => (document.querySelector(`[data-qid="${q.id}"] input[aria-label="Question title"]`) as HTMLInputElement | null)?.focus(), 50);
  };
  const onDragEnd = (e: DragEndEvent) => {
    if (e.over && e.active.id !== e.over.id) b.moveQuestion(String(e.active.id), String(e.over.id));
  };

  async function publish() {
    if (issues.length) {
      toast.error(`Fix ${issues.length} issue${issues.length > 1 ? "s" : ""} before publishing.`);
      return;
    }
    setPublishing(true);
    try {
      const saved = await b.save();
      if (!saved && b.state !== "saved") throw new Error("Save your changes before publishing.");
      await setStatus(form.id, "published");
      setStatusState("published");
      qc.invalidateQueries({ queryKey: ["forms"] });
      qc.invalidateQueries({ queryKey: ["form", form.id] });
      toast.success("Your form is live!");
      nav(`/app/forms/${form.id}/share`);
    } catch (e) {
      if (e instanceof ApiRequestError && e.code === "publish_blocked") toast.error("Fix the issues listed before publishing.");
      else toast.error((e as Error).message);
    } finally {
      setPublishing(false);
    }
  }

  const sidePanel = (
    <Tabs value={panel} onValueChange={(v) => setPanel(v as typeof panel)}>
      <TabsList className="mb-5 w-full">
        <TabsTrigger value="question"><SlidersHorizontal /> Question</TabsTrigger>
        <TabsTrigger value="form"><Settings2 /> Form</TabsTrigger>
        <TabsTrigger value="theme"><Palette /> Theme</TabsTrigger>
      </TabsList>
      <TabsContent value="question">
        {sel ? (
          <QuestionSettings
            q={sel}
            def={def}
            locked={answered.has(sel.id)}
            labelOf={labelOf}
            hasLogic={has("conditional_logic")}
            hasAdvanced={has("advanced_questions")}
            sections={def.sections}
            onMoveToSection={(sid) => b.moveToSection(sel.id, sid)}
            onChange={(p) => b.setQuestion(sel.id, p)}
            onTypeChange={(t) => {
              const fresh = defaultQuestion(t, sel.sectionId);
              const keepOptions = ["single_choice", "multiple_choice", "dropdown", "image_choice"].includes(t) && sel.config.options?.length;
              b.setQuestion(sel.id, { type: t, config: keepOptions ? { options: sel.config.options } : fresh.config, required: DISPLAY_TYPES.includes(t) ? false : sel.required });
            }}
          />
        ) : <p className="text-sm text-ink-muted">Select a question to edit its settings.</p>}
      </TabsContent>
      <TabsContent value="form"><FormSettingsPanel def={def} update={b.update} workspaceId={current!.id} formId={form.id} uploadsEnabled={!!cfg.data?.uploads.configured} /></TabsContent>
      <TabsContent value="theme"><ThemePanel def={def} update={b.update} /></TabsContent>
    </Tabs>
  );

  let qNumber = 0;
  return (
    <div className="flex h-screen flex-col bg-canvas">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-white px-3 sm:px-4">
        <Button variant="ghost" size="icon-sm" asChild aria-label="Back to forms"><Link to="/app/forms"><ArrowLeft /></Link></Button>
        <LogoMark size={26} className="hidden sm:block" />
        <div className="min-w-0 flex-1">
          <input aria-label="Form title" readOnly={!canEdit} value={def.title} onChange={(e) => b.update((d) => ({ ...d, title: e.target.value }), { history: false })} className="w-full max-w-md truncate rounded-md border border-transparent bg-transparent px-2 py-1 text-sm font-semibold text-navy hover:border-line focus:border-brand focus:outline-none" />
          <div className="flex items-center gap-2 px-2"><SaveIndicator state={b.state} error={b.error} lastSaved={b.lastSaved} onRetry={() => void b.save()} /><span className="hidden text-xs capitalize text-ink-subtle sm:inline">· {status}</span></div>
        </div>
        <div className="hidden items-center gap-1 md:flex">
          <Button variant="ghost" size="icon-sm" onClick={b.undo} disabled={!b.canUndo || !canEdit} aria-label="Undo (Ctrl+Z)"><Undo2 /></Button>
          <Button variant="ghost" size="icon-sm" onClick={b.redo} disabled={!b.canRedo || !canEdit} aria-label="Redo (Ctrl+Shift+Z)"><Redo2 /></Button>
        </div>
        <Button variant="secondary" size="sm" onClick={async () => { await b.save(); nav(`/app/forms/${form.id}/preview`); }}><Eye /> <span className="hidden sm:inline">Preview</span></Button>
        {canEdit && (status === "draft" ? (
          <Button size="sm" onClick={publish} loading={publishing}><Rocket /> Publish</Button>
        ) : (
          <Button size="sm" variant="subtle" asChild><Link to={`/app/forms/${form.id}/share`}>Share <ChevronRight /></Link></Button>
        ))}
        <Button variant="secondary" size="icon-sm" className="lg:hidden" onClick={() => setMobilePanel(true)} aria-label="Open settings panel"><Settings2 /></Button>
      </header>
      {b.state === "conflict" && <div className="bg-amber-50 px-4 py-2 text-center text-sm text-amber-900">This form was modified in another tab or by a teammate. Your latest edits are kept locally — <button className="font-semibold underline" onClick={() => window.location.reload()}>reload</button> to continue.</div>}
      {!canEdit && <div className="bg-slate-100 px-4 py-2 text-center text-sm text-ink-muted">{form.status === "archived" ? "This form is archived. Restore it from the forms list to edit." : "You have view-only access to this form."}</div>}

      <div className="flex min-h-0 flex-1">
        <main className="min-w-0 flex-1 overflow-y-auto" onClick={(e) => { if (e.target === e.currentTarget) select(null); }}>
          <div className="mx-auto max-w-3xl px-3 py-6 sm:px-6">
            {issues.length > 0 && status === "draft" && (
              <details className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <summary className="cursor-pointer font-medium"><AlertTriangle className="mr-1 inline h-4 w-4" /> {issues.length} thing{issues.length > 1 ? "s" : ""} to fix before publishing</summary>
                <ul className="mt-2 list-disc space-y-1 pl-5">{issues.slice(0, 10).map((i, n) => <li key={n}><button className="text-left underline-offset-2 hover:underline" onClick={() => i.questionId && select(i.questionId)}>{i.message}</button></li>)}</ul>
              </details>
            )}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={def.questions.map((q) => q.id)} strategy={verticalListSortingStrategy}>
                {def.sections.map((s, si) => {
                  const qs = def.questions.filter((q) => q.sectionId === s.id);
                  return (
                    <section key={s.id} className="mb-8" aria-label={`Section ${si + 1}`}>
                      {(def.sections.length > 1 || s.title) && (
                        <div className="mb-3 rounded-xl border border-line bg-white p-4">
                          <div className="flex items-center gap-2">
                            <Badge tone="navy">Section {si + 1} of {def.sections.length}</Badge>
                            {s.jumps.length > 0 && <Badge tone="brand"><GitBranch /> {s.jumps.length} skip rule{s.jumps.length > 1 ? "s" : ""}</Badge>}
                            {canEdit && (
                              <span className="ml-auto flex gap-0.5">
                                <Button variant="ghost" size="icon-sm" aria-label="Move section up" disabled={si === 0} onClick={() => b.moveSection(s.id, -1)}><ArrowUp /></Button>
                                <Button variant="ghost" size="icon-sm" aria-label="Move section down" disabled={si === def.sections.length - 1} onClick={() => b.moveSection(s.id, 1)}><ArrowDown /></Button>
                                <Button variant="ghost" size="icon-sm" aria-label="Skip logic" onClick={() => setOpenSection(openSection === s.id ? null : s.id)}><GitBranch /></Button>
                                {def.sections.length > 1 && <Button variant="ghost" size="icon-sm" aria-label="Delete section (questions move to the previous section)" onClick={() => { b.removeSection(s.id); toast.success("Section removed — its questions moved to the neighbouring section."); }}><Trash2 /></Button>}
                              </span>
                            )}
                          </div>
                          <input aria-label="Section title" readOnly={!canEdit} value={s.title} placeholder="Section title" onChange={(e) => b.setSection(s.id, { title: e.target.value })} className="mt-2 w-full rounded-md border border-transparent px-2 py-1 text-lg font-semibold text-navy hover:border-line focus:border-brand focus:outline-none" />
                          <textarea aria-label="Section description" readOnly={!canEdit} rows={1} value={s.description ?? ""} placeholder="Description (optional)" onChange={(e) => b.setSection(s.id, { description: e.target.value })} className="w-full resize-none rounded-md border border-transparent px-2 py-1 text-sm text-ink-muted hover:border-line focus:border-brand focus:outline-none" />
                          {openSection === s.id && <div className="mt-3 border-t border-line pt-3"><p className="mb-2 text-sm font-semibold text-navy">After this section…</p><SectionJumps section={s} def={def} labelOf={labelOf} onChange={(p) => b.setSection(s.id, p)} /></div>}
                        </div>
                      )}
                      <div className="space-y-3">
                        {qs.map((q) => (
                          <div key={q.id} data-qid={q.id}>
                            <QuestionCard
                              q={q}
                              index={DISPLAY_TYPES.includes(q.type) ? null : ++qNumber}
                              selected={selected === q.id}
                              onSelect={() => select(q.id)}
                              onChange={(p) => b.setQuestion(q.id, p)}
                              onDuplicate={() => { const c = b.duplicateQuestion(q.id); if (c) select(c.id); }}
                              onRemove={() => {
                                b.removeQuestion(q.id);
                                if (selected === q.id) select(null);
                                toast(answered.has(q.id) ? "Question removed. Existing answers are kept for analytics." : "Question deleted", { action: { label: "Undo", onClick: b.undo } });
                              }}
                              locked={answered.has(q.id)}
                              hasIssue={issueIds.has(q.id)}
                              canEdit={canEdit}
                            />
                          </div>
                        ))}
                        {qs.length === 0 && <div className="rounded-xl border border-dashed border-line bg-white/60 px-4 py-8 text-center text-sm text-ink-muted">This section is empty.</div>}
                      </div>
                      {canEdit && (
                        <div className="mt-3 flex justify-center">
                          <AddQuestionMenu onAdd={(t) => add(t, s.id)} hasAdvanced={has("advanced_questions")}>
                            <Button variant="secondary" size="sm"><Plus /> Add question</Button>
                          </AddQuestionMenu>
                        </div>
                      )}
                    </section>
                  );
                })}
              </SortableContext>
            </DndContext>
            {canEdit && (
              <div className="flex flex-wrap justify-center gap-2 border-t border-dashed border-line pt-6">
                <Button variant="ghost" size="sm" onClick={() => { const s = b.addSection(); setOpenSection(null); setTimeout(() => document.querySelector(`[aria-label="Section ${def.sections.length + 1}"]`)?.scrollIntoView({ behavior: "smooth" }), 50); return s; }}><Plus /> Add section / page</Button>
                <Button variant="ghost" size="sm" onClick={() => setImportOpen(true)}><FileInput /> Import questions from text</Button>
              </div>
            )}
          </div>
        </main>
        <aside className="hidden w-[360px] shrink-0 overflow-y-auto border-l border-line bg-white p-5 lg:block" aria-label="Settings">{canEdit ? sidePanel : <p className="text-sm text-ink-muted">Read-only</p>}</aside>
      </div>

      {mobilePanel && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Settings">
          <div className="absolute inset-0 bg-navy/40" onClick={() => setMobilePanel(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] animate-fade-in overflow-y-auto rounded-t-2xl bg-white p-5">
            <div className="mb-3 flex justify-end"><Button variant="ghost" size="icon-sm" onClick={() => setMobilePanel(false)} aria-label="Close"><X /></Button></div>
            {canEdit && sidePanel}
          </div>
        </div>
      )}

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent title="Import questions from text" description="Paste questions from a document. One question per line; lines starting with “-” or “a)” become options. End a line with * to make it required, or add a hint like [number], [long], [email], [date], [rating], [scale], [multi], [dropdown] or [yesno]." wide>
          <Textarea className="min-h-[220px] font-mono text-xs" value={importText} onChange={(e) => setImportText(e.target.value)} placeholder={"1. What is your name? *\n2. Which network do you use most?\n- MTN\n- Telecel\n- AT\n3. How old are you? [number]\n4. Any other comments? [long]"} />
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setImportOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                const sid = sel?.sectionId ?? def.sections[def.sections.length - 1].id;
                const qs = importQuestionsFromText(importText, sid);
                if (!qs.length) return toast.error("No questions found in that text.");
                b.addQuestions(qs);
                setImportOpen(false);
                setImportText("");
                toast.success(`Imported ${qs.length} question${qs.length > 1 ? "s" : ""}`);
              }}
            >
              Import
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function Builder() {
  const { id = "" } = useParams();
  const q = useQuery({ queryKey: ["form", id], queryFn: () => getForm(id), staleTime: Infinity, refetchOnMount: "always" });
  if (q.isLoading) return <Spinner className="min-h-screen" />;
  if (q.isError || !q.data) return <div className="mx-auto max-w-lg p-8"><ErrorState error={q.error} /><Button asChild variant="link" className="mt-4"><Link to="/app/forms">Back to forms</Link></Button></div>;
  return <Editor key={q.data.id} form={q.data as FormDetail & { definition: FormDefinition }} />;
}
