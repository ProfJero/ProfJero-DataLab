import { cloneDefinitionWithNewIds, type FormDefinition, type FormStatus, type PublicationSettings } from "@datalab/shared";
import { rpc } from "./supabase";
import { api } from "./api";

export interface FormDetail {
  id: string;
  workspaceId: string;
  slug: string;
  status: FormStatus;
  version: number;
  responseCount: number;
  updatedAt: string;
  publishedAt: string | null;
  definition: FormDefinition;
  publication: PublicationSettings;
  answeredQuestionIds: string[];
}

export const getForm = (id: string) => rpc<FormDetail>("get_form_definition", { p_form_id: id });

export async function createForm(workspaceId: string, def: FormDefinition, templateSlug?: string) {
  return rpc<string>("create_form", { p_workspace_id: workspaceId, p_definition: cloneDefinitionWithNewIds(def), p_template_slug: templateSlug ?? null });
}

export async function duplicateForm(id: string) {
  const f = await getForm(id);
  return rpc<string>("create_form", { p_workspace_id: f.workspaceId, p_definition: { ...cloneDefinitionWithNewIds(f.definition), title: `${f.definition.title} (copy)`.slice(0, 300) }, p_template_slug: null });
}

export async function setStatus(id: string, status: FormStatus) {
  if (status === "published") return api<{ status: string }>(`/forms/${id}/publish`, { method: "POST" });
  return rpc<{ status: string }>("set_form_status", { p_form_id: id, p_status: status });
}

export const publicUrl = (slug: string) => `${window.location.origin}/f/${slug}`;
