import { choiceOptions, DISPLAY_TYPES, fileRefSchema, isMultiSelect, OTHER_OPTION_ID, scaleRange, type Answers, type AnswerValue, type FileRef, type FormDefinition, type Question } from "./form";
import { visibleQuestionIds } from "./logic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?[0-9 ()\-.]{6,20}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface ValidationResult {
  ok: boolean;
  errors: Record<string, string>;
  /** Answers for visible questions only, normalised to canonical types. */
  answers: Answers;
  otherText: Record<string, string>;
}

function empty(v: unknown): boolean {
  return v === undefined || v === null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0) || (typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length === 0);
}

/** Validate one answer. Returns [normalisedValue, errorMessage|null]. */
export function validateAnswer(q: Question, raw: unknown, otherText?: string): [AnswerValue, string | null] {
  const custom = q.config.errorMessage;
  const fail = (msg: string): [AnswerValue, string] => [null, custom || msg];
  if (empty(raw)) return q.required ? fail("This question is required.") : [null, null];

  switch (q.type) {
    case "short_text":
    case "long_text": {
      if (typeof raw !== "string") return fail("Enter text.");
      const v = raw.trim();
      const max = q.config.maxLength ?? (q.type === "short_text" ? 1000 : 20000);
      if (v.length > max) return fail(`Keep this under ${max} characters.`);
      if (q.config.minLength && v.length < q.config.minLength) return fail(`Enter at least ${q.config.minLength} characters.`);
      return [v, null];
    }
    case "email": {
      if (typeof raw !== "string" || !EMAIL_RE.test(raw.trim()) || raw.length > 320) return fail("Enter a valid email address.");
      return [raw.trim().toLowerCase(), null];
    }
    case "phone": {
      if (typeof raw !== "string" || !PHONE_RE.test(raw.trim())) return fail("Enter a valid phone number.");
      return [raw.trim(), null];
    }
    case "url": {
      if (typeof raw !== "string") return fail("Enter a valid URL.");
      try {
        const u = new URL(raw.trim());
        if (!["http:", "https:"].includes(u.protocol)) throw new Error();
        return [u.toString(), null];
      } catch {
        return fail("Enter a valid URL starting with http:// or https://.");
      }
    }
    case "date": {
      if (typeof raw !== "string" || !DATE_RE.test(raw) || Number.isNaN(Date.parse(raw))) return fail("Enter a valid date.");
      return [raw, null];
    }
    case "time": {
      if (typeof raw !== "string" || !TIME_RE.test(raw)) return fail("Enter a valid time (HH:MM).");
      return [raw, null];
    }
    case "number":
    case "rating":
    case "linear_scale": {
      const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
      if (!Number.isFinite(n)) return fail("Enter a number.");
      const [min, max] = scaleRange(q);
      if (q.type !== "number" && !Number.isInteger(n)) return fail("Choose a value on the scale.");
      if (q.type === "number" && q.config.integerOnly && !Number.isInteger(n)) return fail("Enter a whole number.");
      if (n < min) return fail(`Enter a value of at least ${min}.`);
      if (n > max) return fail(`Enter a value no greater than ${max}.`);
      return [n, null];
    }
    case "single_choice":
    case "dropdown":
    case "yes_no":
    case "multiple_choice":
    case "image_choice": {
      const ids = new Set(choiceOptions(q).map((o) => o.id));
      const multi = isMultiSelect(q);
      const arr = Array.isArray(raw) ? raw : [raw];
      if (!arr.every((x) => typeof x === "string" && ids.has(x))) return fail("Choose one of the available options.");
      const uniq = [...new Set(arr as string[])];
      if (!multi && uniq.length !== 1) return fail("Choose one option.");
      if (multi) {
        if (q.config.minSelections && uniq.length < q.config.minSelections) return fail(`Choose at least ${q.config.minSelections} options.`);
        if (q.config.maxSelections && uniq.length > q.config.maxSelections) return fail(`Choose no more than ${q.config.maxSelections} options.`);
      }
      if (uniq.includes(OTHER_OPTION_ID) && !(otherText ?? "").trim()) return fail("Please specify your other answer.");
      return [multi ? uniq : uniq[0], null];
    }
    case "likert": {
      if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return fail("Answer each statement.");
      const rows = q.config.rows ?? [];
      const [min, max] = scaleRange(q);
      const out: Record<string, number> = {};
      for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        if (!rows.some((r) => r.id === k)) return fail("Unknown statement.");
        if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) return fail("Choose a value for each statement.");
        out[k] = v;
      }
      if (q.required && Object.keys(out).length < rows.length) return fail("Answer every statement.");
      return [out, null];
    }
    case "file_upload": {
      if (!Array.isArray(raw)) return fail("Upload a file.");
      const files: FileRef[] = [];
      const maxFiles = q.config.maxFiles ?? 1;
      if (raw.length > maxFiles) return fail(`Upload no more than ${maxFiles} file(s).`);
      const allowed = (q.config.allowedFileTypes ?? []).map((t) => t.toLowerCase());
      const maxBytes = (q.config.maxFileSizeMb ?? 5) * 1024 * 1024;
      for (const f of raw) {
        const parsed = fileRefSchema.safeParse(f);
        if (!parsed.success) return fail("Invalid upload.");
        const fmt = (parsed.data.format ?? parsed.data.name?.split(".").pop() ?? "").toLowerCase();
        if (allowed.length && !allowed.includes(fmt)) return fail(`Allowed file types: ${allowed.join(", ")}.`);
        if (parsed.data.bytes > maxBytes) return fail(`Files must be ${q.config.maxFileSizeMb ?? 5} MB or smaller.`);
        files.push(parsed.data);
      }
      return [files, null];
    }
    case "heading":
    case "statement":
      return [null, null];
  }
}

/** Validate a full submission against a definition, honouring conditional logic. */
export function validateSubmission(def: Pick<FormDefinition, "sections" | "questions">, rawAnswers: Record<string, unknown>, rawOther: Record<string, string> = {}): ValidationResult {
  const known = new Map(def.questions.map((q) => [q.id, q]));
  const errors: Record<string, string> = {};
  for (const id of Object.keys(rawAnswers)) if (!known.has(id)) errors[id] = "Unknown question.";
  // First pass: evaluate visibility using raw values (only visible answers count).
  const visible = visibleQuestionIds(def, rawAnswers as Answers);
  const answers: Answers = {};
  const otherText: Record<string, string> = {};
  for (const q of def.questions) {
    if (DISPLAY_TYPES.includes(q.type) || !visible.has(q.id)) continue;
    const [v, err] = validateAnswer(q, rawAnswers[q.id], rawOther[q.id]);
    if (err) errors[q.id] = err;
    else if (v !== null) {
      answers[q.id] = v;
      const sel = (Array.isArray(v) ? v : [v]) as unknown[];
      if (sel.includes(OTHER_OPTION_ID) && rawOther[q.id]) otherText[q.id] = rawOther[q.id].trim().slice(0, 1000);
    }
  }
  return { ok: Object.keys(errors).length === 0, errors, answers, otherText };
}

/** Rough upper bound on submission payload size (bytes) accepted by the API. */
export const MAX_SUBMISSION_BYTES = 256 * 1024;
