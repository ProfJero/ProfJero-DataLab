import { z } from "zod";

/** Every question type supported by the builder and respondent renderer. */
export const QUESTION_TYPES = [
  "short_text",
  "long_text",
  "single_choice",
  "multiple_choice",
  "dropdown",
  "yes_no",
  "number",
  "email",
  "phone",
  "date",
  "time",
  "rating",
  "linear_scale",
  "likert",
  "file_upload",
  "image_choice",
  "url",
  "heading",
  "statement",
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

/** Display-only blocks that never collect an answer. */
export const DISPLAY_TYPES: QuestionType[] = ["heading", "statement"];
export const CHOICE_TYPES: QuestionType[] = ["single_choice", "multiple_choice", "dropdown", "image_choice", "yes_no"];
export const TEXT_TYPES: QuestionType[] = ["short_text", "long_text"];
export const NUMERIC_TYPES: QuestionType[] = ["number", "rating", "linear_scale"];
/** Types that usually contain personal identifiers; excluded from AI context. */
export const PII_TYPES: QuestionType[] = ["email", "phone", "url", "file_upload"];
/** Question types only available on paid plans (feature key: advanced_questions). */
export const ADVANCED_TYPES: QuestionType[] = ["file_upload", "image_choice", "likert"];

export const OTHER_OPTION_ID = "__other__";

export const QUESTION_TYPE_META: Record<QuestionType, { label: string; group: "Text" | "Choice" | "Scale" | "Contact" | "Date & time" | "Media" | "Layout" }> = {
  short_text: { label: "Short text", group: "Text" },
  long_text: { label: "Long text", group: "Text" },
  single_choice: { label: "Single choice", group: "Choice" },
  multiple_choice: { label: "Multiple choice", group: "Choice" },
  dropdown: { label: "Dropdown", group: "Choice" },
  yes_no: { label: "Yes / No", group: "Choice" },
  image_choice: { label: "Image choice", group: "Choice" },
  number: { label: "Number", group: "Scale" },
  rating: { label: "Rating", group: "Scale" },
  linear_scale: { label: "Linear scale", group: "Scale" },
  likert: { label: "Likert scale", group: "Scale" },
  email: { label: "Email", group: "Contact" },
  phone: { label: "Phone number", group: "Contact" },
  url: { label: "Website URL", group: "Contact" },
  date: { label: "Date", group: "Date & time" },
  time: { label: "Time", group: "Date & time" },
  file_upload: { label: "File upload", group: "Media" },
  heading: { label: "Section heading", group: "Layout" },
  statement: { label: "Statement", group: "Layout" },
};

export const optionSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().max(500),
  imageUrl: z.string().url().max(1000).optional(),
});
export type ChoiceOption = z.infer<typeof optionSchema>;

export const likertRowSchema = z.object({ id: z.string().min(1).max(64), label: z.string().max(500) });

export const questionConfigSchema = z
  .object({
    placeholder: z.string().max(300).optional(),
    minLength: z.number().int().min(0).max(100000).optional(),
    maxLength: z.number().int().min(1).max(100000).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    step: z.number().positive().optional(),
    integerOnly: z.boolean().optional(),
    options: z.array(optionSchema).max(200).optional(),
    allowOther: z.boolean().optional(),
    shuffle: z.boolean().optional(),
    minSelections: z.number().int().min(0).optional(),
    maxSelections: z.number().int().min(1).optional(),
    multiple: z.boolean().optional(),
    scaleMax: z.number().int().min(3).max(10).optional(),
    scaleMin: z.number().int().min(0).max(1).optional(),
    minLabel: z.string().max(100).optional(),
    maxLabel: z.string().max(100).optional(),
    icon: z.enum(["star", "heart", "number"]).optional(),
    rows: z.array(likertRowSchema).max(50).optional(),
    scaleLabels: z.array(z.string().max(100)).max(10).optional(),
    allowedFileTypes: z.array(z.string().max(20)).max(20).optional(),
    maxFileSizeMb: z.number().positive().max(25).optional(),
    maxFiles: z.number().int().min(1).max(10).optional(),
    errorMessage: z.string().max(300).optional(),
  })
  .strict();
export type QuestionConfig = z.infer<typeof questionConfigSchema>;

export const CONDITION_OPERATORS = [
  "equals",
  "not_equals",
  "contains",
  "not_contains",
  "gt",
  "gte",
  "lt",
  "lte",
  "is_answered",
  "is_not_answered",
] as const;
export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];

export const conditionSchema = z.object({
  questionId: z.string().uuid(),
  operator: z.enum(CONDITION_OPERATORS),
  value: z.union([z.string(), z.number(), z.null()]).optional(),
});
export type Condition = z.infer<typeof conditionSchema>;

export const conditionGroupSchema = z.object({
  match: z.enum(["all", "any"]),
  conditions: z.array(conditionSchema).min(1).max(20),
});
export type ConditionGroup = z.infer<typeof conditionGroupSchema>;

export const questionSchema = z.object({
  id: z.string().uuid(),
  sectionId: z.string().uuid(),
  type: z.enum(QUESTION_TYPES),
  title: z.string().max(1000),
  description: z.string().max(4000).optional().nullable(),
  required: z.boolean().default(false),
  config: questionConfigSchema.default({}),
  /** Show this question only when the condition group is satisfied. */
  visibility: conditionGroupSchema.nullable().optional(),
});
export type Question = z.infer<typeof questionSchema>;

export const sectionJumpSchema = z.object({
  when: conditionGroupSchema,
  /** Target section id, or "submit" to end the form. */
  goTo: z.union([z.string().uuid(), z.literal("submit")]),
});
export type SectionJump = z.infer<typeof sectionJumpSchema>;

export const sectionSchema = z.object({
  id: z.string().uuid(),
  title: z.string().max(500).default(""),
  description: z.string().max(4000).optional().nullable(),
  jumps: z.array(sectionJumpSchema).max(20).default([]),
});
export type Section = z.infer<typeof sectionSchema>;

export const themeSchema = z.object({
  primary: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#2864C5"),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#F5F7FB"),
  font: z.enum(["Inter", "Manrope", "Serif"]).default("Inter"),
  radius: z.enum(["sm", "md", "lg"]).default("md"),
});
export type FormTheme = z.infer<typeof themeSchema>;

export const formSettingsSchema = z.object({
  layout: z.enum(["single", "paged"]).default("paged"),
  showProgress: z.boolean().default(true),
  welcomeTitle: z.string().max(300).optional().nullable(),
  welcomeMessage: z.string().max(4000).optional().nullable(),
  instructions: z.string().max(4000).optional().nullable(),
  thankYouTitle: z.string().max(300).default("Thank you!"),
  thankYouMessage: z.string().max(4000).default("Your response has been recorded."),
  allowAnotherResponse: z.boolean().default(false),
  redirectUrl: z.string().url().max(1000).optional().nullable(),
});
export type FormSettings = z.infer<typeof formSettingsSchema>;

export const publicationSchema = z.object({
  isPublic: z.boolean().default(true),
  requireAuth: z.boolean().default(false),
  closesAt: z.string().datetime({ offset: true }).nullable().optional(),
  responseLimit: z.number().int().positive().max(10_000_000).nullable().optional(),
  preventDuplicates: z.boolean().default(false),
  honeypot: z.boolean().default(true),
  collectRespondentEmail: z.boolean().default(false),
  aiAnalysisEnabled: z.boolean().default(true),
  closedMessage: z.string().max(1000).optional().nullable(),
});
export type PublicationSettings = z.infer<typeof publicationSchema>;

/** The complete editable definition the builder autosaves. */
export const formDefinitionSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(5000).optional().nullable(),
  coverImageUrl: z.string().url().max(1000).optional().nullable(),
  logoUrl: z.string().url().max(1000).optional().nullable(),
  theme: themeSchema,
  settings: formSettingsSchema,
  sections: z.array(sectionSchema).min(1).max(100),
  questions: z.array(questionSchema).max(500),
});
export type FormDefinition = z.infer<typeof formDefinitionSchema>;

export type FormStatus = "draft" | "published" | "closed" | "archived";

export const fileRefSchema = z.object({
  publicId: z.string().min(1).max(500),
  url: z.string().url().max(1000),
  bytes: z.number().int().nonnegative(),
  format: z.string().max(20).optional(),
  name: z.string().max(300).optional(),
});
export type FileRef = z.infer<typeof fileRefSchema>;

export type AnswerValue = string | number | string[] | Record<string, number> | FileRef[] | null;
export type Answers = Record<string, AnswerValue>;

export const submissionPayloadSchema = z.object({
  answers: z.record(z.string().uuid(), z.unknown()),
  otherText: z.record(z.string().uuid(), z.string().max(1000)).optional(),
  /** Honeypot field — must stay empty. */
  website: z.string().max(0).optional().or(z.literal("")),
  startedAt: z.number().int().optional(),
  respondentEmail: z.string().email().max(320).optional(),
});
export type SubmissionPayload = z.infer<typeof submissionPayloadSchema>;

export function newId(): string {
  return crypto.randomUUID();
}

export function emptyDefinition(title = "Untitled form"): FormDefinition {
  const sectionId = newId();
  return {
    title,
    description: "",
    coverImageUrl: null,
    logoUrl: null,
    theme: themeSchema.parse({}),
    settings: formSettingsSchema.parse({}),
    sections: [{ id: sectionId, title: "", description: "", jumps: [] }],
    questions: [],
  };
}

/** Default configuration when a new question of a given type is added. */
export function defaultQuestion(type: QuestionType, sectionId: string): Question {
  const base: Question = {
    id: newId(),
    sectionId,
    type,
    title: "",
    description: "",
    required: false,
    config: {},
    visibility: null,
  };
  const opt = (label: string) => ({ id: newId().slice(0, 8), label });
  switch (type) {
    case "single_choice":
    case "multiple_choice":
    case "dropdown":
      base.config = { options: [opt("Option 1"), opt("Option 2")] };
      break;
    case "image_choice":
      base.config = { options: [opt("Image 1"), opt("Image 2")], multiple: false };
      break;
    case "rating":
      base.config = { scaleMax: 5, icon: "star" };
      break;
    case "linear_scale":
      base.config = { scaleMin: 1, scaleMax: 5, minLabel: "Not at all", maxLabel: "Extremely" };
      break;
    case "likert":
      base.config = {
        rows: [opt("Statement 1"), opt("Statement 2")],
        scaleLabels: ["Strongly disagree", "Disagree", "Neutral", "Agree", "Strongly agree"],
      };
      break;
    case "file_upload":
      base.config = { allowedFileTypes: ["pdf", "jpg", "png"], maxFileSizeMb: 5, maxFiles: 1 };
      break;
    case "long_text":
      base.config = { maxLength: 5000 };
      break;
    case "short_text":
      base.config = { maxLength: 300 };
      break;
  }
  return base;
}

/** Options for a choice question, including the synthetic Yes/No options. */
export function choiceOptions(q: Pick<Question, "type" | "config">): ChoiceOption[] {
  if (q.type === "yes_no") return [{ id: "yes", label: "Yes" }, { id: "no", label: "No" }];
  const opts = q.config.options ?? [];
  return q.config.allowOther ? [...opts, { id: OTHER_OPTION_ID, label: "Other" }] : opts;
}

export function isMultiSelect(q: Pick<Question, "type" | "config">): boolean {
  return q.type === "multiple_choice" || (q.type === "image_choice" && !!q.config.multiple);
}

export function scaleRange(q: Pick<Question, "type" | "config">): [number, number] {
  if (q.type === "rating") return [1, q.config.scaleMax ?? 5];
  if (q.type === "linear_scale") return [q.config.scaleMin ?? 1, q.config.scaleMax ?? 5];
  if (q.type === "likert") return [1, (q.config.scaleLabels ?? []).length || 5];
  return [q.config.min ?? -Infinity, q.config.max ?? Infinity];
}
