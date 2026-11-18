import { DISPLAY_TYPES, type Answers, type AnswerValue, type Condition, type ConditionGroup, type FormDefinition, type Question } from "./form";

function isEmpty(v: AnswerValue | undefined): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v).length === 0;
  return false;
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

export function evaluateCondition(c: Condition, answers: Answers): boolean {
  const a = answers[c.questionId];
  switch (c.operator) {
    case "is_answered":
      return !isEmpty(a);
    case "is_not_answered":
      return isEmpty(a);
    case "equals":
      if (Array.isArray(a)) return a.length === 1 && a[0] === String(c.value);
      if (typeof a === "number") return a === toNumber(c.value);
      return typeof a === "string" && a.trim().toLowerCase() === String(c.value ?? "").trim().toLowerCase();
    case "not_equals":
      if (isEmpty(a)) return true;
      return !evaluateCondition({ ...c, operator: "equals" }, answers);
    case "contains":
      if (Array.isArray(a)) return (a as string[]).includes(String(c.value));
      return typeof a === "string" && a.toLowerCase().includes(String(c.value ?? "").toLowerCase());
    case "not_contains":
      return !evaluateCondition({ ...c, operator: "contains" }, answers);
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const n = toNumber(a as unknown);
      const t = toNumber(c.value);
      if (n === null || t === null) return false;
      if (c.operator === "gt") return n > t;
      if (c.operator === "gte") return n >= t;
      if (c.operator === "lt") return n < t;
      return n <= t;
    }
  }
}

export function evaluateGroup(g: ConditionGroup | null | undefined, answers: Answers): boolean {
  if (!g || g.conditions.length === 0) return true;
  return g.match === "all" ? g.conditions.every((c) => evaluateCondition(c, answers)) : g.conditions.some((c) => evaluateCondition(c, answers));
}

/**
 * Compute the ordered list of section ids a respondent visits, applying
 * section jumps. Jumps may only move forward, so the path is always finite.
 */
export function sectionPath(def: Pick<FormDefinition, "sections">, answers: Answers): string[] {
  const path: string[] = [];
  let i = 0;
  const idx = new Map(def.sections.map((s, n) => [s.id, n]));
  while (i < def.sections.length) {
    const s = def.sections[i];
    path.push(s.id);
    const jump = s.jumps.find((j) => evaluateGroup(j.when, answers));
    if (!jump) {
      i += 1;
      continue;
    }
    if (jump.goTo === "submit") break;
    const target = idx.get(jump.goTo);
    if (target === undefined || target <= i) {
      i += 1; // invalid/backward jump: ignore safely
      continue;
    }
    i = target;
  }
  return path;
}

/**
 * Determine which questions are visible for the given answers. Answers to
 * hidden questions are ignored, so a question's visibility only depends on
 * visible answers (evaluated in definition order).
 */
export function visibleQuestionIds(def: Pick<FormDefinition, "sections" | "questions">, answers: Answers): Set<string> {
  const effective: Answers = {};
  const visible = new Set<string>();
  const onPath = new Set(sectionPath(def, answers));
  const order = new Map(def.sections.map((s, n) => [s.id, n]));
  const ordered = [...def.questions].sort((a, b) => (order.get(a.sectionId) ?? 0) - (order.get(b.sectionId) ?? 0));
  for (const q of ordered) {
    if (!onPath.has(q.sectionId)) continue;
    if (!evaluateGroup(q.visibility ?? null, effective)) continue;
    visible.add(q.id);
    if (answers[q.id] !== undefined) effective[q.id] = answers[q.id];
  }
  return visible;
}

export interface LogicIssue {
  questionId?: string;
  sectionId?: string;
  message: string;
}

/** Validate conditional logic before publishing. */
export function validateLogic(def: Pick<FormDefinition, "sections" | "questions">): LogicIssue[] {
  const issues: LogicIssue[] = [];
  const sectionIndex = new Map(def.sections.map((s, n) => [s.id, n]));
  const position = new Map<string, number>();
  const ordered = [...def.questions].sort((a, b) => (sectionIndex.get(a.sectionId) ?? 0) - (sectionIndex.get(b.sectionId) ?? 0));
  ordered.forEach((q, n) => position.set(q.id, n));
  const byId = new Map(def.questions.map((q) => [q.id, q]));

  const checkCondition = (c: Condition, ownerPos: number, where: { questionId?: string; sectionId?: string }) => {
    const target = byId.get(c.questionId);
    if (!target) {
      issues.push({ ...where, message: "A rule refers to a question that no longer exists." });
      return;
    }
    if (DISPLAY_TYPES.includes(target.type)) issues.push({ ...where, message: `A rule refers to "${target.title || "a layout block"}", which collects no answer.` });
    const tp = position.get(target.id) ?? 0;
    if (tp >= ownerPos) issues.push({ ...where, message: `A rule depends on "${target.title || "Untitled"}", which appears later in the form.` });
    const needsValue = !["is_answered", "is_not_answered"].includes(c.operator);
    if (needsValue && (c.value === undefined || c.value === null || c.value === "")) issues.push({ ...where, message: "A rule is missing a comparison value." });
    else if (needsValue && ["equals", "not_equals", "contains", "not_contains"].includes(c.operator) && ["single_choice", "multiple_choice", "dropdown", "yes_no", "image_choice"].includes(target.type)) {
      const ids = target.type === "yes_no" ? ["yes", "no"] : [...(target.config.options ?? []).map((o) => o.id), ...(target.config.allowOther ? ["__other__"] : [])];
      if (!ids.includes(String(c.value))) issues.push({ ...where, message: `A rule compares "${target.title || "Untitled"}" with an option that does not exist.` });
    }
  };

  for (const q of ordered) {
    if (!q.visibility) continue;
    for (const c of q.visibility.conditions) checkCondition(c, position.get(q.id) ?? 0, { questionId: q.id });
  }
  def.sections.forEach((s, si) => {
    const lastPos = Math.max(-1, ...ordered.filter((q) => sectionIndex.get(q.sectionId)! <= si).map((q) => position.get(q.id)!));
    for (const j of s.jumps) {
      if (j.goTo !== "submit") {
        const t = sectionIndex.get(j.goTo);
        if (t === undefined) issues.push({ sectionId: s.id, message: "A section jump targets a section that no longer exists." });
        else if (t <= si) issues.push({ sectionId: s.id, message: "Section jumps can only move forward to a later section." });
      }
      for (const c of j.when.conditions) checkCondition(c, lastPos + 1, { sectionId: s.id });
    }
  });
  return issues;
}

/** Validate a form is publishable (has questions, titles, options, valid logic). */
export function publishIssues(def: FormDefinition): LogicIssue[] {
  const issues: LogicIssue[] = [];
  const answerable = def.questions.filter((q) => !DISPLAY_TYPES.includes(q.type));
  if (answerable.length === 0) issues.push({ message: "Add at least one question before publishing." });
  for (const q of def.questions) {
    if (!q.title.trim() && q.type !== "statement") issues.push({ questionId: q.id, message: "Every question needs a title." });
    if (["single_choice", "multiple_choice", "dropdown", "image_choice"].includes(q.type)) {
      const opts = q.config.options ?? [];
      if (opts.length < 1) issues.push({ questionId: q.id, message: `"${q.title || "Untitled"}" needs at least one option.` });
      if (opts.some((o) => !o.label.trim())) issues.push({ questionId: q.id, message: `"${q.title || "Untitled"}" has an empty option.` });
      const ids = new Set(opts.map((o) => o.id));
      if (ids.size !== opts.length) issues.push({ questionId: q.id, message: `"${q.title || "Untitled"}" has duplicate options.` });
    }
    if (q.type === "likert" && (q.config.rows ?? []).length === 0) issues.push({ questionId: q.id, message: `"${q.title || "Untitled"}" needs at least one statement.` });
  }
  return [...issues, ...validateLogic(def)];
}

export function questionsInSection(def: Pick<FormDefinition, "questions">, sectionId: string): Question[] {
  return def.questions.filter((q) => q.sectionId === sectionId);
}
