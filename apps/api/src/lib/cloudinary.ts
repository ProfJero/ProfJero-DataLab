import type { Env } from "../env";
import { isConfigured, sha1Hex } from "./util";

export function cloudinaryConfigured(env: Env): boolean {
  return isConfigured(env.CLOUDINARY_CLOUD_NAME) && isConfigured(env.CLOUDINARY_API_KEY) && isConfigured(env.CLOUDINARY_API_SECRET);
}

/**
 * Cloudinary signature: SHA-1 of the alphabetically sorted "key=value" pairs joined by "&",
 * followed by the API secret. https://cloudinary.com/documentation/authentication_signatures
 */
export async function signParams(params: Record<string, string | number>, secret: string): Promise<string> {
  const toSign = Object.keys(params)
    .filter((k) => params[k] !== "" && params[k] !== undefined)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return sha1Hex(toSign + secret);
}

export interface SignedUpload {
  uploadUrl: string;
  fields: Record<string, string>;
  maxBytes: number;
}

export async function createSignedUpload(env: Env, opts: { folder: string; allowedFormats: string[]; maxBytes: number; resourceType: "image" | "auto" }): Promise<SignedUpload> {
  const timestamp = Math.floor(Date.now() / 1000);
  const params: Record<string, string | number> = { timestamp, folder: opts.folder, allowed_formats: opts.allowedFormats.join(",") };
  const signature = await signParams(params, env.CLOUDINARY_API_SECRET!);
  return {
    uploadUrl: `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/${opts.resourceType}/upload`,
    fields: { api_key: env.CLOUDINARY_API_KEY!, timestamp: String(timestamp), folder: opts.folder, allowed_formats: params.allowed_formats as string, signature },
    maxBytes: opts.maxBytes,
  };
}

export interface CloudinaryResource {
  public_id: string;
  secure_url: string;
  bytes: number;
  format?: string;
  resource_type: string;
  width?: number;
  height?: number;
}

/** Look up an uploaded asset via the Admin API so its real size/format can be verified server-side. */
export async function fetchResource(env: Env, publicId: string): Promise<CloudinaryResource | null> {
  const auth = btoa(`${env.CLOUDINARY_API_KEY}:${env.CLOUDINARY_API_SECRET}`);
  for (const type of ["image", "raw", "video"]) {
    const res = await fetch(`https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/resources/${type}/upload/${encodeURIComponent(publicId).replace(/%2F/g, "/")}`, { headers: { Authorization: `Basic ${auth}` } });
    if (res.ok) return (await res.json()) as CloudinaryResource;
    if (res.status !== 404) return null;
  }
  return null;
}

export async function destroyResource(env: Env, publicId: string, resourceType = "image"): Promise<void> {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = await signParams({ public_id: publicId, timestamp }, env.CLOUDINARY_API_SECRET!);
  const body = new URLSearchParams({ public_id: publicId, timestamp: String(timestamp), api_key: env.CLOUDINARY_API_KEY!, signature });
  await fetch(`https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/${resourceType}/destroy`, { method: "POST", body });
}
