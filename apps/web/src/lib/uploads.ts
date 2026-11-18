import type { FileRef } from "@datalab/shared";
import { api } from "./api";

interface Signed { uploadUrl: string; fields: Record<string, string>; maxBytes: number }

/** Upload a file directly to Cloudinary using a short-lived signature issued by the API. */
export async function uploadToCloudinary(signed: Signed, file: File): Promise<{ public_id: string; secure_url: string; bytes: number; format?: string; width?: number; height?: number }> {
  if (file.size > signed.maxBytes) throw new Error(`Files must be ${Math.round(signed.maxBytes / 1048576)} MB or smaller.`);
  const body = new FormData();
  Object.entries(signed.fields).forEach(([k, v]) => body.append(k, v));
  body.append("file", file);
  const res = await fetch(signed.uploadUrl, { method: "POST", body });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message ? `Upload failed: ${json.error.message}` : "Upload failed. Please try again.");
  return json;
}

export async function uploadRespondentFile(slug: string, questionId: string, file: File): Promise<FileRef> {
  const signed = await api<Signed>(`/public/forms/${slug}/upload`, { method: "POST", anonymous: true, json: { questionId, fileName: file.name, fileSize: file.size } });
  const r = await uploadToCloudinary(signed, file);
  return { publicId: r.public_id, url: r.secure_url, bytes: r.bytes, format: (r.format ?? file.name.split(".").pop() ?? "").toLowerCase(), name: file.name };
}

/** Upload a workspace/form image and register it (Cloudinary reference stored in Supabase). */
export async function uploadImage(opts: { purpose: "form_cover" | "form_logo" | "workspace_logo" | "avatar" | "option_image"; workspaceId?: string; formId?: string; file: File }): Promise<string> {
  const { rpc } = await import("./supabase");
  if (!opts.file.type.startsWith("image/")) throw new Error("Choose an image file.");
  const signed = await api<Signed>("/uploads/sign", { method: "POST", json: { purpose: opts.purpose, workspaceId: opts.workspaceId, formId: opts.formId, fileName: opts.file.name, fileSize: opts.file.size } });
  const r = await uploadToCloudinary(signed, opts.file);
  await rpc("register_media_asset", { p_workspace_id: opts.workspaceId ?? null, p_form_id: opts.formId ?? null, p_purpose: opts.purpose, p_public_id: r.public_id, p_secure_url: r.secure_url, p_format: r.format ?? null, p_bytes: r.bytes, p_width: r.width ?? null, p_height: r.height ?? null });
  return r.secure_url;
}
