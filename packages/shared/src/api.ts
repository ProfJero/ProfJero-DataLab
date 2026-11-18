import { z } from "zod";
import { formDefinitionSchema } from "./form";

/** Request/response contracts shared by the web app and the API Worker. */
export const aiAskSchema = z.object({
  question: z.string().trim().min(2).max(2000),
  conversationId: z.string().uuid().optional(),
});

export const aiGenerateFormSchema = z.object({
  workspaceId: z.string().uuid(),
  prompt: z.string().trim().min(10).max(2000),
});

export const reportGenerateSchema = z.object({
  formId: z.string().uuid(),
  type: z.enum(["survey_summary", "research_report", "executive_summary", "question_analysis", "comparative_report", "ai_findings"]),
  title: z.string().trim().min(1).max(300),
  description: z.string().max(5000).optional(),
  objectives: z.string().max(5000).optional(),
  methodology: z.string().max(5000).optional(),
  compareQuestionId: z.string().uuid().optional(),
  useAi: z.boolean().default(false),
});
export type ReportType = z.infer<typeof reportGenerateSchema>["type"];

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  survey_summary: "Survey summary",
  research_report: "Research report",
  executive_summary: "Executive summary",
  question_analysis: "Question-by-question analysis",
  comparative_report: "Comparative report",
  ai_findings: "AI-assisted findings report",
};

export const uploadSignSchema = z.object({
  purpose: z.enum(["form_cover", "form_logo", "workspace_logo", "avatar", "option_image", "response_file"]),
  workspaceId: z.string().uuid().optional(),
  formId: z.string().uuid().optional(),
  questionId: z.string().uuid().optional(),
  fileName: z.string().max(300).optional(),
  fileSize: z.number().int().positive().optional(),
});

export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  role: z.enum(["admin", "editor", "analyst", "viewer"]),
});

export const importQuestionsSchema = z.object({ text: z.string().min(1).max(50000) });

export { formDefinitionSchema };

export interface ApiError {
  error: { code: string; message: string; details?: unknown };
}
