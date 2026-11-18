import { useCallback, useEffect, useRef, useState } from "react";
import { defaultQuestion, newId, type FormDefinition, type Question, type QuestionType, type Section } from "@datalab/shared";
import { dbMessage, supabase } from "@/lib/supabase";

export type SaveState = "saved" | "saving" | "unsaved" | "error" | "conflict";

const AUTOSAVE_MS = 1200;
const HISTORY_LIMIT = 100;
const draftKey = (id: string) => `datalab.draft.${id}`;

/**
 * Builder state with debounced autosave, retry on failure, optimistic concurrency
 * (version check), undo/redo, and a local backup so work is never silently lost.
 */
export function useBuilder(formId: string, initial: FormDefinition, initialVersion: number) {
  const [def, setDef] = useState<FormDefinition>(initial);
  const [state, setState] = useState<SaveState>("saved");
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const version = useRef(initialVersion);
  const past = useRef<FormDefinition[]>([]);
  const future = useRef<FormDefinition[]>([]);
  const latest = useRef(def);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const inflight = useRef<Promise<void> | null>(null);
  const pending = useRef(false);
  const retries = useRef(0);
  const [, force] = useState(0);

  latest.current = def;

  const save = useCallback(async (): Promise<boolean> => {
    if (inflight.current) {
      pending.current = true;
      await inflight.current;
      return save();
    }
    if (state === "conflict") return false;
    setState("saving");
    const snapshot = latest.current;
    let ok = false;
    inflight.current = (async () => {
      const { data, error } = await supabase.rpc("save_form_definition", { p_form_id: formId, p_definition: snapshot, p_expected_version: version.current });
      if (error) {
        if (error.message === "version_conflict") {
          setState("conflict");
          setError("This form was changed in another tab or by a teammate.");
          return;
        }
        setState("error");
        setError(dbMessage(error));
        // Retry with backoff for transient failures.
        if (retries.current < 4 && !/permission|question_type_locked|archived/i.test(error.message)) {
          retries.current++;
          clearTimeout(timer.current);
          timer.current = setTimeout(() => void save(), 1500 * 2 ** retries.current);
        }
        return;
      }
      retries.current = 0;
      version.current = (data as { version: number }).version;
      ok = true;
      setError(null);
      setLastSaved(new Date());
      try {
        localStorage.removeItem(draftKey(formId));
      } catch {
        /* ignore */
      }
      setState(latest.current === snapshot ? "saved" : "unsaved");
    })();
    await inflight.current;
    inflight.current = null;
    if (pending.current || (ok && latest.current !== snapshot)) {
      pending.current = false;
      return save();
    }
    return ok;
  }, [formId, state]);

  const update = useCallback(
    (fn: (d: FormDefinition) => FormDefinition, opts: { history?: boolean } = {}) => {
      setDef((prev) => {
        const next = fn(prev);
        if (next === prev) return prev;
        if (opts.history !== false) {
          past.current = [...past.current.slice(-HISTORY_LIMIT), prev];
          future.current = [];
        }
        try {
          localStorage.setItem(draftKey(formId), JSON.stringify({ at: Date.now(), def: next }));
        } catch {
          /* storage full or unavailable */
        }
        return next;
      });
      setState((s) => (s === "conflict" ? s : "unsaved"));
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void save(), AUTOSAVE_MS);
    },
    [formId, save],
  );

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(latest.current);
    setDef(prev);
    setState("unsaved");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), AUTOSAVE_MS);
    force((n) => n + 1);
  }, [save]);
  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(latest.current);
    setDef(next);
    setState("unsaved");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), AUTOSAVE_MS);
    force((n) => n + 1);
  }, [save]);

  // Keyboard shortcuts and unload protection.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      } else if (e.key.toLowerCase() === "z" && !["INPUT", "TEXTAREA"].includes(tag)) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    };
    const unload = (e: BeforeUnloadEvent) => {
      if (state === "unsaved" || state === "saving" || state === "error") {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("keydown", key);
    window.addEventListener("beforeunload", unload);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("beforeunload", unload);
    };
  }, [save, undo, redo, state]);

  useEffect(() => () => clearTimeout(timer.current), []);

  /* ---------- structural helpers ---------- */
  const setQuestion = (id: string, patch: Partial<Question>) => update((d) => ({ ...d, questions: d.questions.map((q) => (q.id === id ? { ...q, ...patch } : q)) }));
  const setSection = (id: string, patch: Partial<Section>) => update((d) => ({ ...d, sections: d.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));

  const addQuestion = (type: QuestionType, sectionId: string, afterId?: string | null): Question => {
    const q = defaultQuestion(type, sectionId);
    update((d) => {
      const qs = [...d.questions];
      let idx = afterId ? qs.findIndex((x) => x.id === afterId) + 1 : -1;
      if (idx <= 0) {
        const lastInSection = qs.map((x, i) => (x.sectionId === sectionId ? i : -1)).filter((i) => i >= 0).pop();
        idx = lastInSection === undefined ? qs.length : lastInSection + 1;
      }
      qs.splice(idx, 0, q);
      return { ...d, questions: qs };
    });
    return q;
  };

  const addQuestions = (items: Question[]) => update((d) => ({ ...d, questions: [...d.questions, ...items] }));

  const duplicateQuestion = (id: string) => {
    const src = latest.current.questions.find((q) => q.id === id);
    if (!src) return null;
    const copy: Question = { ...structuredClone(src), id: newId(), title: src.title ? `${src.title} (copy)` : "" };
    update((d) => {
      const qs = [...d.questions];
      qs.splice(qs.findIndex((q) => q.id === id) + 1, 0, copy);
      return { ...d, questions: qs };
    });
    return copy;
  };

  /** Remove a question and any logic rules that referenced it. */
  const removeQuestion = (id: string) =>
    update((d) => {
      const strip = <T extends { conditions: { questionId: string }[] }>(g: T | null | undefined): T | null => {
        if (!g) return null;
        const conditions = g.conditions.filter((c) => c.questionId !== id);
        return conditions.length ? { ...g, conditions } : null;
      };
      return {
        ...d,
        questions: d.questions.filter((q) => q.id !== id).map((q) => ({ ...q, visibility: strip(q.visibility) })),
        sections: d.sections.map((s) => ({ ...s, jumps: s.jumps.map((j) => ({ ...j, when: strip(j.when)! })).filter((j) => j.when) })),
      };
    });

  const moveQuestion = (activeId: string, overId: string) =>
    update((d) => {
      const qs = [...d.questions];
      const from = qs.findIndex((q) => q.id === activeId);
      const to = qs.findIndex((q) => q.id === overId);
      if (from < 0 || to < 0 || from === to) return d;
      const [item] = qs.splice(from, 1);
      const target = d.questions[to];
      qs.splice(to, 0, { ...item, sectionId: target.sectionId });
      return { ...d, questions: qs };
    });

  const moveToSection = (qid: string, sectionId: string) =>
    update((d) => {
      const q = d.questions.find((x) => x.id === qid);
      if (!q) return d;
      const rest = d.questions.filter((x) => x.id !== qid);
      const lastIdx = rest.map((x, i) => (x.sectionId === sectionId ? i : -1)).filter((i) => i >= 0).pop();
      const secOrder = d.sections.map((s) => s.id);
      let insertAt = lastIdx === undefined ? rest.findIndex((x) => secOrder.indexOf(x.sectionId) > secOrder.indexOf(sectionId)) : lastIdx + 1;
      if (insertAt < 0) insertAt = rest.length;
      rest.splice(insertAt, 0, { ...q, sectionId });
      return { ...d, questions: rest };
    });

  const addSection = () => {
    const s: Section = { id: newId(), title: `Section ${latest.current.sections.length + 1}`, description: "", jumps: [] };
    update((d) => ({ ...d, sections: [...d.sections, s], settings: { ...d.settings, layout: "paged" } }));
    return s;
  };

  const removeSection = (id: string) =>
    update((d) => {
      if (d.sections.length <= 1) return d;
      const idx = d.sections.findIndex((s) => s.id === id);
      const fallback = d.sections[idx === 0 ? 1 : idx - 1].id;
      return {
        ...d,
        sections: d.sections.filter((s) => s.id !== id).map((s) => ({ ...s, jumps: s.jumps.filter((j) => j.goTo !== id) })),
        questions: d.questions.map((q) => (q.sectionId === id ? { ...q, sectionId: fallback } : q)),
      };
    });

  const moveSection = (id: string, dir: -1 | 1) =>
    update((d) => {
      const i = d.sections.findIndex((s) => s.id === id);
      const j = i + dir;
      if (j < 0 || j >= d.sections.length) return d;
      const secs = [...d.sections];
      [secs[i], secs[j]] = [secs[j], secs[i]];
      const order = new Map(secs.map((s, n) => [s.id, n]));
      return { ...d, sections: secs, questions: [...d.questions].sort((a, b) => (order.get(a.sectionId) ?? 0) - (order.get(b.sectionId) ?? 0)) };
    });

  return {
    def,
    update,
    state,
    error,
    lastSaved,
    save,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
    setQuestion,
    setSection,
    addQuestion,
    addQuestions,
    duplicateQuestion,
    removeQuestion,
    moveQuestion,
    moveToSection,
    addSection,
    removeSection,
    moveSection,
  };
}

export type BuilderApi = ReturnType<typeof useBuilder>;
