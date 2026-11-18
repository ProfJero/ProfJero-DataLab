import { DISPLAY_TYPES, REPORT_TYPE_LABELS, type QuestionSummary, type ReportType } from "@datalab/shared";
import type { AnalyticsBundle, CrosstabResult, GroupComparison } from "./analytics";

export interface DraftSection {
  kind: "markdown" | "question" | "findings" | "crosstab" | "table";
  title: string;
  body: string;
  data: Record<string, unknown>;
  source: "generated" | "ai" | "user";
}

function topLine(s: QuestionSummary): string | null {
  if (s.answered === 0) return null;
  switch (s.kind) {
    case "choice": {
      const top = [...s.options].sort((a, b) => b.count - a.count)[0];
      if (!top || top.count === 0) return null;
      return `For "${s.title}", the most selected option was **${top.label}** — ${top.count} of ${s.answered} respondents (${top.percent}%).`;
    }
    case "numeric":
      return `For "${s.title}", the mean was **${s.stats.mean}** and the median ${s.stats.median} (n = ${s.stats.n}${s.scale ? `, scale ${s.scale[0]}–${s.scale[1]}` : ""}).`;
    case "likert": {
      const best = [...s.rows].filter((r) => r.stats.mean !== null).sort((a, b) => (b.stats.mean ?? 0) - (a.stats.mean ?? 0));
      if (!best.length) return null;
      const hi = best[0];
      const lo = best[best.length - 1];
      return best.length > 1
        ? `In "${s.title}", agreement was highest for "${hi.label}" (mean ${hi.stats.mean}) and lowest for "${lo.label}" (mean ${lo.stats.mean}).`
        : `In "${s.title}", "${hi.label}" had a mean of ${hi.stats.mean}.`;
    }
    case "text":
      return s.keywords.length ? `Written answers to "${s.title}" (${s.answered}) most often mentioned: ${s.keywords.slice(0, 5).map((k) => `"${k.word}" (${k.documents})`).join(", ")}.` : null;
    default:
      return null;
  }
}

/** Deterministic report content built only from calculated results. */
export function buildReportSections(type: ReportType, bundle: AnalyticsBundle, meta: { description?: string; objectives?: string; methodology?: string; organisation: string }, extras: { crosstab?: CrosstabResult; comparison?: GroupComparison } = {}): DraftSection[] {
  const o = bundle.overview;
  const sections: DraftSection[] = [];
  const range = o.firstAt ? `between ${o.firstAt.slice(0, 10)} and ${(o.lastAt ?? "").slice(0, 10)}` : "";
  const answerable = bundle.form.definition.questions.filter((q) => !DISPLAY_TYPES.includes(q.type)).length;

  sections.push({
    kind: "markdown",
    title: type === "executive_summary" ? "Overview" : "Introduction",
    body: [
      meta.description?.trim() || `This ${REPORT_TYPE_LABELS[type].toLowerCase()} presents the results of "${bundle.form.definition.title}".`,
      `The analysis is based on **${o.completed} completed response(s)**${range ? ` collected ${range}` : ""}, covering ${answerable} question(s).`,
    ].join("\n\n"),
    data: {},
    source: "generated",
  });
  if (meta.objectives?.trim() && type !== "executive_summary") sections.push({ kind: "markdown", title: "Objectives", body: meta.objectives.trim(), data: {}, source: "user" });
  if (meta.methodology?.trim() && ["research_report", "comparative_report", "ai_findings"].includes(type)) sections.push({ kind: "markdown", title: "Methodology", body: meta.methodology.trim(), data: {}, source: "user" });

  sections.push({
    kind: "table",
    title: "Sample",
    body: "",
    data: { rows: [["Completed responses", String(o.completed)], ["Responses flagged for review", String(o.flagged)], ["First response", o.firstAt?.slice(0, 10) ?? "—"], ["Latest response", o.lastAt?.slice(0, 10) ?? "—"], ...(o.medianDurationSeconds ? [["Median completion time", `${Math.round(o.medianDurationSeconds / 60)} min`]] : [])] },
    source: "generated",
  });

  const findings = bundle.summaries.map(topLine).filter((x): x is string => !!x);
  sections.push({ kind: "findings", title: "Key findings", body: findings.length ? findings.slice(0, type === "executive_summary" ? 6 : 12).map((f) => `- ${f}`).join("\n") : "There are not yet enough responses to report findings.", data: {}, source: "generated" });

  if (type === "comparative_report" && extras.crosstab) {
    sections.push({ kind: "crosstab", title: `${extras.crosstab.rowQuestion.title} by ${extras.crosstab.colQuestion.title}`, body: extras.crosstab.test ? `Chi-square test: χ² = ${extras.crosstab.test.chi2}, df = ${extras.crosstab.test.df}, p = ${extras.crosstab.test.pValue}${extras.crosstab.test.lowExpected ? " (some expected counts are below 5; interpret with caution)" : ""}.` : "", data: { crosstab: extras.crosstab }, source: "generated" });
  }
  if (type === "comparative_report" && extras.comparison) {
    sections.push({ kind: "table", title: `${extras.comparison.valueQuestion.title} by ${extras.comparison.groupQuestion.title}`, body: "", data: { header: ["Group", "n", "Mean", "Median"], rows: extras.comparison.groups.map((g) => [g.label, String(g.n), g.mean === null ? "—" : String(g.mean), g.median === null ? "—" : String(g.median)]) }, source: "generated" });
  }

  if (type !== "executive_summary") {
    for (const s of bundle.summaries) {
      if (s.kind === "count" && s.sensitive) continue;
      sections.push({ kind: "question", title: s.title || "Untitled question", body: topLine(s) ?? (s.answered ? "" : "No responses to this question."), data: { questionId: s.questionId, summary: s }, source: "generated" });
    }
  }

  const limits = [
    o.completed < 30 ? `The sample is small (n = ${o.completed}); results may not be representative.` : null,
    "Responses are self-reported and reflect only those who chose to respond.",
    bundle.summaries.some((s) => s.skipped > 0) ? "Some questions were skipped by some respondents; percentages are based on those who answered each question." : null,
  ].filter(Boolean);
  sections.push({ kind: "markdown", title: "Limitations", body: limits.map((l) => `- ${l}`).join("\n"), data: {}, source: "generated" });
  sections.push({ kind: "markdown", title: "Recommendations", body: "_Add recommendations based on the findings above._", data: {}, source: "generated" });
  sections.push({ kind: "markdown", title: "Conclusion", body: "_Summarise what the results mean for your objectives._", data: {}, source: "generated" });
  return sections;
}
