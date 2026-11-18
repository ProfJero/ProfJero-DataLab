import type { Env } from "../env";
import { isConfigured } from "./util";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export function emailConfigured(env: Env): boolean {
  return env.EMAIL_PROVIDER === "resend" && isConfigured(env.EMAIL_API_KEY) && isConfigured(env.EMAIL_FROM);
}

/** Sends an email through the configured provider. Returns false (never throws) when unavailable. */
export async function sendEmail(env: Env, msg: EmailMessage): Promise<{ sent: boolean; reason?: string }> {
  if (!emailConfigured(env)) return { sent: false, reason: "not_configured" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.EMAIL_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text }),
    });
    if (!res.ok) return { sent: false, reason: `provider_${res.status}` };
    return { sent: true };
  } catch {
    return { sent: false, reason: "network" };
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

export function layout(title: string, body: string, cta?: { label: string; url: string }): string {
  return `<!doctype html><html><body style="margin:0;background:#F5F7FB;font-family:Inter,Segoe UI,Arial,sans-serif;color:#112442">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:12px;padding:32px">
<tr><td>${cta ? `<img src="${esc(new URL(cta.url).origin)}/brand/logo-full.png" width="200" alt="ProfJero DataLab" style="display:block;width:200px;height:auto" />` : `<span style="font-weight:700;font-size:18px;color:#112442">ProfJero <span style="color:#1F51A6">Data</span><span style="color:#178563">Lab</span></span>`}</td></tr>
<tr><td style="padding-top:24px;font-size:20px;font-weight:600">${esc(title)}</td></tr>
<tr><td style="padding-top:12px;font-size:15px;line-height:1.6;color:#334155">${body}</td></tr>
${cta ? `<tr><td style="padding-top:24px"><a href="${esc(cta.url)}" style="background:#2864C5;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;display:inline-block">${esc(cta.label)}</a></td></tr>` : ""}
<tr><td style="padding-top:32px;font-size:12px;color:#64748B">A product of ProfJero Digital Studio.</td></tr>
</table></td></tr></table></body></html>`;
}

export function invitationEmail(workspace: string, role: string, url: string, inviter: string): EmailMessage & { to: "" } {
  const body = `${esc(inviter)} invited you to join <strong>${esc(workspace)}</strong> on ProfJero DataLab as ${esc(role)}. The invitation expires in 14 days.`;
  return {
    to: "",
    subject: `You're invited to ${workspace} on ProfJero DataLab`,
    html: layout("You have been invited", body, { label: "Accept invitation", url }),
    text: `${inviter} invited you to join ${workspace} on ProfJero DataLab as ${role}.\nAccept: ${url}\nThe invitation expires in 14 days.`,
  };
}
