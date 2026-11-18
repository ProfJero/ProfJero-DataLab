import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNowStrict } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export const fmtNumber = (n: number | null | undefined) => (n === null || n === undefined ? "—" : new Intl.NumberFormat("en-GB").format(n));
export const fmtDate = (d: string | Date | null | undefined, f = "d MMM yyyy") => (d ? format(new Date(d), f) : "—");
export const fmtDateTime = (d: string | Date | null | undefined) => fmtDate(d, "d MMM yyyy, HH:mm");
export const timeAgo = (d: string | Date | null | undefined) => (d ? `${formatDistanceToNowStrict(new Date(d))} ago` : "—");
export const fmtDuration = (s: number | null | undefined) => {
  if (s === null || s === undefined) return "—";
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m ${Math.round(s % 60)}s` : `${Math.floor(m / 60)}h ${m % 60}m`;
};
export const fmtMoney = (minor: number | null | undefined, currency = "GHS") => (minor === null || minor === undefined ? "—" : new Intl.NumberFormat("en-GH", { style: "currency", currency, maximumFractionDigits: minor % 100 === 0 ? 0 : 2 }).format(minor / 100));
export function initials(name?: string | null, email?: string | null) {
  const src = (name || email || "?").trim();
  const parts = src.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const APP_URL = (import.meta.env.VITE_APP_URL as string | undefined) ?? window.location.origin;
export const STATUS_STYLES: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  published: "bg-insight-50 text-insight-700",
  closed: "bg-amber-50 text-amber-800",
  archived: "bg-slate-100 text-slate-500",
};
