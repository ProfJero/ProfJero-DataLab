import { describe, expect, it } from "vitest";
import { buildTemplateDefinition, cloneDefinitionWithNewIds, emptyDefinition, formDefinitionSchema, importQuestionsFromText, publishIssues, sectionPath, TEMPLATE_SPECS, validateLogic, validateSubmission, visibleQuestionIds, type FormDefinition, type Question } from "../src";

const S1 = "11111111-1111-4111-8111-111111111111";
const S2 = "22222222-2222-4222-8222-222222222222";
const S3 = "33333333-3333-4333-8333-333333333333";
const Q1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const Q2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const Q3 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const Q4 = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function def(): FormDefinition {
  const base = emptyDefinition("Test");
  const qs: Question[] = [
    { id: Q1, sectionId: S1, type: "yes_no", title: "Do you own a phone?", required: true, config: {}, visibility: null },
    { id: Q2, sectionId: S1, type: "single_choice", title: "Which network?", required: true, config: { options: [{ id: "mtn", label: "MTN" }, { id: "tel", label: "Telecel" }], allowOther: true }, visibility: { match: "all", conditions: [{ questionId: Q1, operator: "equals", value: "yes" }] } },
    { id: Q3, sectionId: S2, type: "rating", title: "Rate it", required: true, config: { scaleMax: 5 }, visibility: null },
    { id: Q4, sectionId: S3, type: "long_text", title: "Anything else?", required: false, config: { maxLength: 20 }, visibility: null },
  ];
  return {
    ...base,
    sections: [
      { id: S1, title: "A", description: "", jumps: [{ when: { match: "all", conditions: [{ questionId: Q1, operator: "equals", value: "no" }] }, goTo: S3 }] },
      { id: S2, title: "B", description: "", jumps: [] },
      { id: S3, title: "C", description: "", jumps: [] },
    ],
    questions: qs,
  };
}

describe("conditional logic", () => {
  it("shows follow-up only when condition matches", () => {
    expect(visibleQuestionIds(def(), { [Q1]: "yes" }).has(Q2)).toBe(true);
    expect(visibleQuestionIds(def(), { [Q1]: "no" }).has(Q2)).toBe(false);
  });
  it("skips sections via jumps", () => {
    expect(sectionPath(def(), { [Q1]: "no" })).toEqual([S1, S3]);
    expect(sectionPath(def(), { [Q1]: "yes" })).toEqual([S1, S2, S3]);
  });
  it("ignores backward jumps to avoid loops", () => {
    const d = def();
    d.sections[2].jumps = [{ when: { match: "any", conditions: [{ questionId: Q1, operator: "is_answered" }] }, goTo: S1 }];
    expect(sectionPath(d, { [Q1]: "yes" })).toEqual([S1, S2, S3]);
    expect(validateLogic(d).some((i) => /forward/.test(i.message))).toBe(true);
  });
  it("flags rules that depend on later questions", () => {
    const d = def();
    d.questions[0].visibility = { match: "all", conditions: [{ questionId: Q3, operator: "gt", value: 2 }] };
    expect(validateLogic(d).length).toBeGreaterThan(0);
  });
  it("valid definition has no publish issues", () => {
    expect(publishIssues(def())).toEqual([]);
    expect(formDefinitionSchema.safeParse(def()).success).toBe(true);
  });
  it("requires at least one question to publish", () => {
    expect(publishIssues(emptyDefinition()).length).toBe(1);
  });
});

describe("submission validation", () => {
  it("accepts a valid submission and drops hidden answers", () => {
    const r = validateSubmission(def(), { [Q1]: "no", [Q2]: "mtn", [Q4]: "ok" });
    expect(r.ok).toBe(true);
    expect(r.answers).toEqual({ [Q1]: "no", [Q4]: "ok" }); // Q2 hidden, S2 skipped
  });
  it("enforces required visible questions", () => {
    const r = validateSubmission(def(), { [Q1]: "yes" });
    expect(r.ok).toBe(false);
    expect(Object.keys(r.errors).sort()).toEqual([Q2, Q3].sort());
  });
  it("rejects unknown options, out-of-range ratings and long text", () => {
    const r = validateSubmission(def(), { [Q1]: "yes", [Q2]: "vodafone", [Q3]: 9, [Q4]: "x".repeat(50) });
    expect(Object.keys(r.errors).sort()).toEqual([Q2, Q3, Q4].sort());
  });
  it("requires other text when Other selected", () => {
    expect(validateSubmission(def(), { [Q1]: "yes", [Q2]: "__other__", [Q3]: 3 }).ok).toBe(false);
    const r = validateSubmission(def(), { [Q1]: "yes", [Q2]: "__other__", [Q3]: 3 }, { [Q2]: "AT" });
    expect(r.ok).toBe(true);
    expect(r.otherText[Q2]).toBe("AT");
  });
  it("rejects answers for unknown questions", () => {
    const r = validateSubmission(def(), { [Q1]: "no", "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee": "x" });
    expect(r.ok).toBe(false);
  });
});

describe("templates", () => {
  it("every template builds a valid, publishable definition", () => {
    for (const spec of TEMPLATE_SPECS) {
      const d = buildTemplateDefinition(spec);
      const parsed = formDefinitionSchema.safeParse(d);
      expect(parsed.success, spec.slug + JSON.stringify(parsed.error?.issues?.[0])).toBe(true);
      expect(publishIssues(d), spec.slug).toEqual([]);
    }
  });
  it("has templates in all four categories", () => {
    expect(new Set(TEMPLATE_SPECS.map((t) => t.category)).size).toBe(4);
    expect(TEMPLATE_SPECS.length).toBeGreaterThanOrEqual(19);
  });
  it("clones with new ids and remaps logic", () => {
    const d = buildTemplateDefinition(TEMPLATE_SPECS.find((t) => t.slug === "product-feedback")!);
    const c = cloneDefinitionWithNewIds(d);
    const ids = new Set(d.questions.map((q) => q.id));
    expect(c.questions.every((q) => !ids.has(q.id))).toBe(true);
    const withLogic = c.questions.find((q) => q.visibility)!;
    expect(c.questions.some((q) => q.id === withLogic.visibility!.conditions[0].questionId)).toBe(true);
  });
});

describe("text import", () => {
  it("parses questions, options, required markers and type hints", () => {
    const qs = importQuestionsFromText("1. What is your name? *\n2. Which network do you use?\n- MTN\n- Telecel\nHow old are you? [number]\nTell us more [long]", S1);
    expect(qs.map((q) => q.type)).toEqual(["short_text", "single_choice", "number", "long_text"]);
    expect(qs[0].required).toBe(true);
    expect(qs[0].title).toBe("What is your name?");
    expect(qs[1].config.options?.map((o) => o.label)).toEqual(["MTN", "Telecel"]);
  });
});
