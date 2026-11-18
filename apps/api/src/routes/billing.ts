import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv, Env } from "../env";
import { ApiError } from "../lib/errors";
import { Db } from "../lib/supabase";
import { hmacHex, isConfigured, readJson, recordError, safeEqual } from "../lib/util";

/**
 * Payment provider abstraction. Paystack (Ghana: cards + mobile money) is implemented;
 * other providers can be added by implementing PaymentProvider and registering it below.
 */
interface PaymentProvider {
  name: string;
  initialize(opts: { email: string; amountMinor: number; currency: string; reference: string; callbackUrl: string; metadata: Record<string, unknown> }): Promise<{ authorizationUrl: string }>;
  verify(reference: string): Promise<{ status: "success" | "failed" | "abandoned" | "pending"; amountMinor: number; currency: string; customerId: string | null; raw: unknown }>;
  verifyWebhook(rawBody: string, headers: Headers): Promise<boolean>;
}

class PaystackProvider implements PaymentProvider {
  name = "paystack";
  constructor(private secret: string) {}
  private async call<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`https://api.paystack.co${path}`, { ...init, headers: { Authorization: `Bearer ${this.secret}`, "Content-Type": "application/json" } });
    const body = (await res.json().catch(() => ({}))) as { status?: boolean; message?: string; data?: T };
    if (!res.ok || !body.status) throw new ApiError(502, "payment_provider_error", body.message || "The payment provider returned an error.");
    return body.data as T;
  }
  async initialize(o: Parameters<PaymentProvider["initialize"]>[0]) {
    const d = await this.call<{ authorization_url: string }>("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({ email: o.email, amount: o.amountMinor, currency: o.currency, reference: o.reference, callback_url: o.callbackUrl, metadata: o.metadata, channels: ["card", "mobile_money", "bank_transfer"] }),
    });
    return { authorizationUrl: d.authorization_url };
  }
  async verify(reference: string) {
    const d = await this.call<{ status: string; amount: number; currency: string; customer?: { customer_code?: string } }>(`/transaction/verify/${encodeURIComponent(reference)}`);
    const status = d.status === "success" ? "success" : d.status === "abandoned" ? "abandoned" : d.status === "failed" ? "failed" : "pending";
    return { status: status as "success" | "failed" | "abandoned" | "pending", amountMinor: d.amount, currency: d.currency, customerId: d.customer?.customer_code ?? null, raw: { status: d.status, amount: d.amount, currency: d.currency } };
  }
  async verifyWebhook(rawBody: string, headers: Headers) {
    const sig = headers.get("x-paystack-signature") ?? "";
    const expected = await hmacHex("SHA-512", this.secret, rawBody);
    return sig.length > 0 && safeEqual(sig, expected);
  }
}

export function paymentProvider(env: Env): PaymentProvider | null {
  if (env.PAYMENT_PROVIDER === "paystack" && isConfigured(env.PAYSTACK_SECRET_KEY)) return new PaystackProvider(env.PAYSTACK_SECRET_KEY);
  return null;
}

async function confirm(env: Env, provider: PaymentProvider, reference: string) {
  const v = await provider.verify(reference);
  if (v.status === "pending") return { status: "pending" };
  return new Db(env).rpc<{ status: string }>("billing_confirm_transaction", {
    p_gateway: env.GATEWAY_KEY,
    p_reference: reference,
    p_status: v.status,
    p_amount_minor: v.amountMinor,
    p_currency: v.currency,
    p_payload: v.raw,
    p_customer_id: v.customerId,
  });
}

export const billingRoutes = new Hono<AppEnv>();

const checkoutSchema = z.object({ workspaceId: z.string().uuid(), planCode: z.string().regex(/^[a-z0-9_]{2,40}$/), interval: z.enum(["monthly", "yearly"]) });

billingRoutes.post("/checkout", async (c) => {
  const provider = paymentProvider(c.env);
  if (!provider) throw new ApiError(503, "payments_not_configured", "Online payment is not available yet. Contact the platform owner to upgrade your plan.");
  const body = checkoutSchema.parse(await readJson(c, 2048));
  const user = c.get("user");
  const reference = `dl_${crypto.randomUUID().replace(/-/g, "")}`;
  const tx = await new Db(c.env).rpc<{ amountMinor: number; currency: string; planName: string }>("billing_create_transaction", {
    p_gateway: c.env.GATEWAY_KEY,
    p_workspace_id: body.workspaceId,
    p_user_id: user.id,
    p_plan_code: body.planCode,
    p_interval: body.interval,
    p_provider: provider.name,
    p_reference: reference,
  });
  const init = await provider.initialize({ email: user.email, amountMinor: tx.amountMinor, currency: tx.currency, reference, callbackUrl: `${c.env.APP_BASE_URL}/app/settings/billing?reference=${reference}`, metadata: { workspaceId: body.workspaceId, plan: body.planCode } });
  return c.json({ authorizationUrl: init.authorizationUrl, reference });
});

billingRoutes.post("/verify", async (c) => {
  const provider = paymentProvider(c.env);
  if (!provider) throw new ApiError(503, "payments_not_configured", "Online payment is not configured.");
  const { reference } = z.object({ reference: z.string().regex(/^dl_[a-f0-9]{32}$/) }).parse(await readJson(c, 1024));
  return c.json(await confirm(c.env, provider, reference));
});

/** Public webhook (signature-verified); mounted outside auth middleware. */
export async function paystackWebhook(env: Env, req: Request): Promise<Response> {
  const provider = paymentProvider(env);
  if (!provider) return new Response("not configured", { status: 503 });
  const raw = await req.text();
  if (raw.length > 100_000 || !(await provider.verifyWebhook(raw, req.headers))) return new Response("invalid signature", { status: 401 });
  try {
    const evt = JSON.parse(raw) as { event?: string; data?: { reference?: string } };
    if (evt.event === "charge.success" && evt.data?.reference?.startsWith("dl_")) await confirm(env, provider, evt.data.reference);
  } catch (e) {
    await recordError(env, "billing", "webhook_failed", String((e as Error).message ?? e));
    return new Response("error", { status: 500 });
  }
  return new Response("ok");
}
