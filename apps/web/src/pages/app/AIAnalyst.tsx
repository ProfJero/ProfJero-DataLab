import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Bot, ChevronDown, FileText, Info, Lightbulb, ListChecks, MessageSquarePlus, Send, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Avatar, Badge, Card, EmptyState, Spinner } from "@/components/ui/misc";
import { Markdown } from "@/lib/markdown";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { usePlatformConfig } from "@/hooks/useConfig";
import { cn, timeAgo } from "@/lib/utils";
import { useFormContext } from "./FormLayout";

interface Grounding { sampleSize: number; facts: string[]; operations: { op: string; description: string; facts: string[] }[]; unverifiedFigures: string[] }
interface Msg { id: string; role: "user" | "assistant"; content: string; grounding?: Grounding | null; status?: string; created_at: string }

const SUGGESTIONS = ["What are the most common responses?", "Summarise the key findings.", "What patterns can you identify?", "Compare responses across groups.", "What are the main challenges respondents reported?", "What recommendations does the evidence support?"];

function Evidence({ g }: { g: Grounding }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3 rounded-lg border border-line bg-canvas/70 text-xs">
      {g.unverifiedFigures.length > 0 && (
        <p className="flex items-start gap-2 border-b border-line px-3 py-2 text-amber-800"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> These figures in the answer could not be matched to DataLab's calculations — treat them with caution: {g.unverifiedFigures.join(", ")}</p>
      )}
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-3 py-2 text-left font-medium text-ink-muted hover:text-navy" aria-expanded={open}>
        <ShieldCheck className="h-3.5 w-3.5 text-insight-600" /> Based on {g.sampleSize} response{g.sampleSize === 1 ? "" : "s"} · {g.facts.length + g.operations.reduce((s, o) => s + o.facts.length, 0)} verified statistics{g.operations.length > 0 && ` · ${g.operations.length} extra calculation${g.operations.length > 1 ? "s" : ""}`}
        <ChevronDown className={cn("ml-auto h-3.5 w-3.5 transition", open && "rotate-180")} />
      </button>
      {open && (
        <div className="space-y-3 border-t border-line px-3 py-3">
          {g.operations.map((o, i) => (
            <div key={i}><p className="font-semibold text-navy">{o.description}</p><ul className="mt-1 list-disc space-y-0.5 pl-4 text-ink-muted">{o.facts.map((f, j) => <li key={j}>{f}</li>)}</ul></div>
          ))}
          <div><p className="font-semibold text-navy">Survey statistics provided to the AI</p><ul className="mt-1 list-disc space-y-0.5 pl-4 text-ink-muted">{g.facts.map((f, j) => <li key={j}>{f}</li>)}</ul></div>
        </div>
      )}
    </div>
  );
}

export default function AIAnalyst() {
  const { form } = useFormContext();
  const { profile, user } = useAuth();
  const { has, current } = useWorkspace();
  const cfg = usePlatformConfig();
  const qc = useQueryClient();
  const [conv, setConv] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [insight, setInsight] = useState<{ mode: string; content: string; grounding: Grounding } | null>(null);
  const end = useRef<HTMLDivElement>(null);

  const convs = useQuery({
    queryKey: ["ai-convs", form.id],
    queryFn: async () => (await supabase.from("ai_conversations").select("id,title,updated_at").eq("form_id", form.id).eq("user_id", user!.id).order("updated_at", { ascending: false }).limit(30)).data ?? [],
  });
  const msgs = useQuery({
    queryKey: ["ai-msgs", conv],
    enabled: !!conv,
    queryFn: async () => ((await supabase.from("ai_messages").select("id,role,content,grounding,status,created_at").eq("conversation_id", conv!).order("created_at")).data ?? []) as Msg[],
  });
  useEffect(() => end.current?.scrollIntoView({ behavior: "smooth", block: "end" }), [msgs.data, pending]);

  const ask = useMutation({
    mutationFn: (question: string) => api<{ conversationId: string }>(`/forms/${form.id}/ai/ask`, { method: "POST", json: { question, conversationId: conv ?? undefined } }),
    onMutate: (question) => { setPending(question); setError(null); setInput(""); },
    onSuccess: (r) => { setConv(r.conversationId); qc.invalidateQueries({ queryKey: ["ai-msgs", r.conversationId] }); qc.invalidateQueries({ queryKey: ["ai-convs", form.id] }); qc.invalidateQueries({ queryKey: ["entitlements"] }); },
    onError: (e) => { setError((e as Error).message); if (conv) qc.invalidateQueries({ queryKey: ["ai-msgs", conv] }); },
    onSettled: () => setPending(null),
  });
  const gen = useMutation({
    mutationFn: (mode: "summary" | "executive" | "recommendations") => api<{ content: string; grounding: Grounding }>(`/forms/${form.id}/ai/insight`, { method: "POST", json: { mode } }),
    onSuccess: (r, mode) => { setInsight({ mode, ...r }); qc.invalidateQueries({ queryKey: ["entitlements"] }); },
    onError: (e) => setError((e as Error).message),
  });

  if (cfg.isLoading) return <Spinner />;
  if (!cfg.data?.ai.configured) return <EmptyState icon={<Bot />} title="The AI Data Analyst isn't configured yet" description="An administrator needs to connect an AI provider (for example OpenAI, Anthropic or an OpenAI-compatible service) in the server configuration. Analytics, cross-tabulation and reports work without AI." action={<Button variant="secondary" asChild><Link to="../analytics">Go to analytics</Link></Button>} />;
  if (!has("ai_analyst")) return <EmptyState icon={<Sparkles />} title="AI analysis isn't included in your plan" action={<Button asChild><Link to="/app/settings/billing">View plans</Link></Button>} />;
  if (!current?.ai_enabled) return <EmptyState icon={<Sparkles />} title="AI analysis is turned off for this workspace" description="A workspace admin can enable it in workspace settings." />;
  if (!form.publication.aiAnalysisEnabled) return <EmptyState icon={<Sparkles />} title="AI analysis is turned off for this form" description="Enable “Allow AI analysis of responses” in Share & settings." action={<Button variant="secondary" asChild><Link to="../share">Open settings</Link></Button>} />;

  const messages = msgs.data ?? [];
  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      <aside className="space-y-4">
        <Button variant="secondary" className="w-full" onClick={() => { setConv(null); setInsight(null); setError(null); }}><MessageSquarePlus /> New analysis</Button>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Instant insights</p>
          <div className="space-y-1.5">
            <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => gen.mutate("summary")} loading={gen.isPending && gen.variables === "summary"}><FileText /> Survey summary</Button>
            <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => gen.mutate("executive")} loading={gen.isPending && gen.variables === "executive"}><ListChecks /> Executive summary</Button>
            <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => gen.mutate("recommendations")} loading={gen.isPending && gen.variables === "recommendations"}><Lightbulb /> Recommendations</Button>
          </div>
        </div>
        {(convs.data ?? []).length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Your conversations</p>
            <ul className="space-y-0.5">
              {convs.data!.map((c) => (
                <li key={c.id} className="group flex items-center">
                  <button onClick={() => { setConv(c.id); setInsight(null); }} className={cn("min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-left text-sm", conv === c.id ? "bg-brand-50 font-medium text-brand-700" : "text-navy hover:bg-slate-100")}>{c.title}<span className="block text-[11px] text-ink-subtle">{timeAgo(c.updated_at)}</span></button>
                  <button aria-label="Delete conversation" className="rounded p-1 text-ink-subtle opacity-0 hover:text-red-600 group-hover:opacity-100" onClick={async () => { await supabase.from("ai_conversations").delete().eq("id", c.id); if (conv === c.id) setConv(null); qc.invalidateQueries({ queryKey: ["ai-convs", form.id] }); }}><Trash2 className="h-3.5 w-3.5" /></button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="flex gap-2 rounded-lg bg-slate-50 p-3 text-xs text-ink-muted"><Info className="h-4 w-4 shrink-0" /> Questions are answered using statistics calculated by DataLab. Aggregated results and a redacted sample of written answers (emails, phone numbers and links removed; contact questions excluded) are sent to the configured AI provider ({cfg.data.ai.provider}). Each analysis uses AI credits.</p>
      </aside>

      <Card className="flex min-h-[600px] flex-col">
        <div className="flex-1 space-y-6 overflow-y-auto p-5">
          {insight && (
            <div>
              <Badge tone="brand"><Sparkles /> {insight.mode === "executive" ? "Executive summary" : insight.mode === "recommendations" ? "Recommendations" : "Survey summary"}</Badge>
              <div className="mt-3 text-sm text-navy"><Markdown text={insight.content} /></div>
              <Evidence g={insight.grounding} />
              <p className="mt-2 text-[11px] text-ink-subtle">AI-generated interpretation. Verify before sharing. Save it into a report from the Reports page.</p>
            </div>
          )}
          {!insight && !conv && !pending && (
            <div className="py-10 text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand"><Sparkles className="h-6 w-6" /></span>
              <h2 className="mt-4 text-lg font-semibold">Ask anything about “{form.definition.title}”</h2>
              <p className="mx-auto mt-1 max-w-md text-sm text-ink-muted">The analyst cites the figures it uses and tells you when the data can't support a conclusion.</p>
              <div className="mx-auto mt-6 flex max-w-2xl flex-wrap justify-center gap-2">{SUGGESTIONS.map((s) => <button key={s} onClick={() => ask.mutate(s)} className="rounded-full border border-line bg-white px-3 py-1.5 text-sm text-navy hover:border-brand-200 hover:bg-brand-50">{s}</button>)}</div>
            </div>
          )}
          {!insight && messages.map((m) => (
            <div key={m.id} className={cn("flex gap-3", m.role === "user" && "flex-row-reverse")}>
              {m.role === "user" ? <Avatar name={profile?.full_name} email={user?.email} size={30} /> : <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-navy text-white"><Sparkles className="h-4 w-4" /></span>}
              <div className={cn("max-w-[85%] rounded-2xl px-4 py-3 text-sm", m.role === "user" ? "bg-brand text-white" : m.status === "error" ? "bg-red-50 text-red-800" : "bg-slate-50 text-navy")}>
                {m.role === "user" ? <p className="whitespace-pre-wrap">{m.content}</p> : <Markdown text={m.content} />}
                {m.role === "assistant" && m.grounding && <Evidence g={m.grounding} />}
              </div>
            </div>
          ))}
          {pending && (
            <>
              <div className="flex flex-row-reverse gap-3"><Avatar name={profile?.full_name} email={user?.email} size={30} /><div className="max-w-[85%] rounded-2xl bg-brand px-4 py-3 text-sm text-white">{pending}</div></div>
              <div className="flex gap-3"><span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-navy text-white"><Sparkles className="h-4 w-4 animate-pulse" /></span><div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-ink-muted">Calculating statistics and analysing…</div></div>
            </>
          )}
          {error && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
          <div ref={end} />
        </div>
        <form className="border-t border-line p-3" onSubmit={(e) => { e.preventDefault(); if (input.trim().length >= 2) { setInsight(null); ask.mutate(input.trim()); } }}>
          <div className="flex items-end gap-2">
            <Textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} placeholder="Ask a question about your data… (Enter to send, Shift+Enter for a new line)" className="max-h-40 min-h-[48px] flex-1 resize-none" rows={1} maxLength={2000} aria-label="Ask the AI Data Analyst" />
            <Button type="submit" size="icon" className="h-12 w-12" disabled={ask.isPending || input.trim().length < 2} aria-label="Send"><Send /></Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
