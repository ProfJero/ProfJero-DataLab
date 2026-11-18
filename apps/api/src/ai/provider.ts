import type { Env } from "../env";
import { isConfigured } from "../lib/util";

export type AIErrorCode = "not_configured" | "rate_limited" | "provider_error" | "invalid_response" | "timeout" | "network" | "context_too_large" | "auth_failed";

export class AIError extends Error {
  constructor(
    public code: AIErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  system: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  /** Ask the provider for a JSON object response where supported. */
  json?: boolean;
}

export interface ChatResult {
  text: string;
  tokensIn: number;
  tokensOut: number;
  model: string;
  provider: string;
}

/** Provider-neutral interface. Add a provider by implementing `chat`. */
export interface AIProvider {
  name: string;
  model: string;
  chat(req: ChatRequest): Promise<ChatResult>;
}

const TIMEOUT_MS = 60_000;

async function post(url: string, headers: Record<string, string>, body: unknown): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), signal: ctrl.signal });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new AIError("timeout", "The AI provider took too long to respond.");
    throw new AIError("network", "Could not reach the AI provider.");
  } finally {
    clearTimeout(timer);
  }
}

function mapStatus(status: number, body: string): AIError {
  if (status === 401 || status === 403) return new AIError("auth_failed", "The AI provider rejected the configured credentials.");
  if (status === 429) return new AIError("rate_limited", "The AI provider is rate limiting requests. Please try again shortly.");
  if (status === 400 && /context|too long|maximum|token/i.test(body)) return new AIError("context_too_large", "This survey is too large to analyse in one request. Try filtering the data.");
  return new AIError("provider_error", `The AI provider returned an error (${status}).`);
}

/** OpenAI Chat Completions and any OpenAI-compatible endpoint (e.g. Azure, OpenRouter, Groq, local gateways). */
export class OpenAICompatibleProvider implements AIProvider {
  name: string;
  constructor(
    private apiKey: string,
    public model: string,
    private baseUrl = "https://api.openai.com/v1",
    name = "openai",
  ) {
    this.name = name;
  }
  async chat(req: ChatRequest): Promise<ChatResult> {
    const res = await post(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, { Authorization: `Bearer ${this.apiKey}` }, {
      model: this.model,
      messages: [{ role: "system", content: req.system }, ...req.messages],
      max_tokens: req.maxTokens ?? 1500,
      temperature: req.temperature ?? 0.2,
      ...(req.json ? { response_format: { type: "json_object" } } : {}),
    });
    const text = await res.text();
    if (!res.ok) throw mapStatus(res.status, text);
    let data: { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number }; model?: string };
    try {
      data = JSON.parse(text);
    } catch {
      throw new AIError("invalid_response", "The AI provider returned an unreadable response.");
    }
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) throw new AIError("invalid_response", "The AI provider returned an empty response.");
    return { text: content, tokensIn: data.usage?.prompt_tokens ?? 0, tokensOut: data.usage?.completion_tokens ?? 0, model: data.model ?? this.model, provider: this.name };
  }
}

/** Anthropic Messages API. */
export class AnthropicProvider implements AIProvider {
  name = "anthropic";
  constructor(
    private apiKey: string,
    public model: string,
    private baseUrl = "https://api.anthropic.com/v1",
  ) {}
  async chat(req: ChatRequest): Promise<ChatResult> {
    const system = req.json ? `${req.system}\n\nRespond with a single valid JSON object and nothing else.` : req.system;
    const res = await post(`${this.baseUrl.replace(/\/$/, "")}/messages`, { "x-api-key": this.apiKey, "anthropic-version": "2023-06-01" }, {
      model: this.model,
      system,
      max_tokens: req.maxTokens ?? 1500,
      temperature: req.temperature ?? 0.2,
      messages: req.messages,
    });
    const text = await res.text();
    if (!res.ok) throw mapStatus(res.status, text);
    let data: { content?: { type: string; text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number }; model?: string };
    try {
      data = JSON.parse(text);
    } catch {
      throw new AIError("invalid_response", "The AI provider returned an unreadable response.");
    }
    const content = (data.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
    if (!content.trim()) throw new AIError("invalid_response", "The AI provider returned an empty response.");
    return { text: content, tokensIn: data.usage?.input_tokens ?? 0, tokensOut: data.usage?.output_tokens ?? 0, model: data.model ?? this.model, provider: this.name };
  }
}

/** Resolve the configured provider from server-side environment variables, or null. */
export function getProvider(env: Env): AIProvider | null {
  const p = (env.AI_PROVIDER ?? "none").toLowerCase();
  if (p === "none" || !isConfigured(env.AI_API_KEY) || !isConfigured(env.AI_MODEL)) return null;
  if (p === "anthropic") return new AnthropicProvider(env.AI_API_KEY, env.AI_MODEL, env.AI_BASE_URL || undefined);
  if (p === "openai") return new OpenAICompatibleProvider(env.AI_API_KEY, env.AI_MODEL, env.AI_BASE_URL || undefined, "openai");
  if (p === "openai_compatible") {
    if (!isConfigured(env.AI_BASE_URL)) return null;
    return new OpenAICompatibleProvider(env.AI_API_KEY, env.AI_MODEL, env.AI_BASE_URL, "openai_compatible");
  }
  return null;
}

/** Extract the first JSON object from model output (tolerates code fences). */
export function parseJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new AIError("invalid_response", "The AI response was not in the expected format.");
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    throw new AIError("invalid_response", "The AI response was not in the expected format.");
  }
}
