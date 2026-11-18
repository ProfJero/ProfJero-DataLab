import { defaultQuestion, newId, type Question } from "./form";

/**
 * Import questions from plain text (e.g. pasted from Word/Google Docs).
 * Format: one question per line. Lines beginning with "-", "*", "•", "a)", "1." etc.
 * directly after a question become its options. A trailing "*" marks required.
 * Hints in square brackets set the type: [long], [number], [email], [phone], [date],
 * [time], [rating], [scale], [multi], [dropdown], [yesno], [url].
 */
export function importQuestionsFromText(text: string, sectionId: string): Question[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out: Question[] = [];
  const optionRe = /^(?:[-*•▪◦]|\(?[a-hA-H]\))\s+(.+)$/;
  let current: Question | null = null;
  let pendingOptions: string[] = [];
  const flush = () => {
    if (!current) return;
    if (pendingOptions.length) {
      if (!["multiple_choice", "dropdown"].includes(current.type)) current.type = "single_choice";
      current.config = { ...current.config, options: pendingOptions.map((label) => ({ id: newId().slice(0, 8), label: label.slice(0, 500) })) };
      delete current.config.maxLength;
    }
    out.push(current);
    current = null;
    pendingOptions = [];
  };
  for (const raw of lines) {
    const opt = raw.match(optionRe);
    if (opt && current) {
      pendingOptions.push(opt[1].trim());
      continue;
    }
    flush();
    let title = raw.replace(/^\d{1,3}[.)]\s+/, "");
    const hint = title.match(/\[(\w+)\]\s*$/)?.[1]?.toLowerCase();
    if (hint) title = title.replace(/\[(\w+)\]\s*$/, "").trim();
    let required = false;
    if (title.endsWith("*")) {
      required = true;
      title = title.slice(0, -1).trim();
    }
    const typeMap: Record<string, Question["type"]> = { long: "long_text", number: "number", email: "email", phone: "phone", date: "date", time: "time", rating: "rating", scale: "linear_scale", multi: "multiple_choice", dropdown: "dropdown", yesno: "yes_no", url: "url" };
    const q = defaultQuestion(typeMap[hint ?? ""] ?? "short_text", sectionId);
    q.title = title.slice(0, 1000);
    q.required = required;
    current = q;
  }
  flush();
  return out.slice(0, 200);
}
