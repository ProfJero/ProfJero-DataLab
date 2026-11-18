import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { FilePlus2, FileInput, LayoutTemplate, Sparkles } from "lucide-react";
import { emptyDefinition, importQuestionsFromText } from "@datalab/shared";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Card, PageHeader } from "@/components/ui/misc";
import { TemplateGallery } from "@/components/forms/TemplateGallery";
import { createForm } from "@/lib/forms";
import { api, ApiRequestError } from "@/lib/api";
import { useWorkspace } from "@/hooks/useWorkspace";
import { usePlatformConfig } from "@/hooks/useConfig";
import { cn } from "@/lib/utils";

type Mode = "blank" | "template" | "ai" | "import";

export default function NewForm() {
  const [params] = useSearchParams();
  const [mode, setMode] = useState<Mode>((params.get("mode") as Mode) || "blank");
  const { current, can } = useWorkspace();
  const cfg = usePlatformConfig();
  const nav = useNavigate();
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  if (!can("forms.edit")) return <PageHeader title="Create a form" description="You need editor access in this workspace to create forms." />;

  const go = async (key: string, fn: () => Promise<string>) => {
    setBusy(key);
    try {
      nav(`/app/forms/${await fn()}/edit`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const modes = [
    { id: "blank", icon: FilePlus2, title: "Start from scratch", text: "A blank canvas with full control." },
    { id: "template", icon: LayoutTemplate, title: "Use a template", text: "20+ ready-made, editable forms." },
    { id: "ai", icon: Sparkles, title: "Draft with AI", text: "Describe your goal; get a draft to refine." },
    { id: "import", icon: FileInput, title: "Import questions", text: "Paste questions from a document." },
  ] as const;
  return (
    <div>
      <PageHeader title="Create a form" description="Choose how you'd like to start. You can change everything later." />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" role="tablist">
        {modes.map((m) => (
          <button key={m.id} role="tab" aria-selected={mode === m.id} onClick={() => setMode(m.id)} className={cn("rounded-xl border bg-white p-4 text-left transition", mode === m.id ? "border-brand shadow-[0_0_0_3px_rgba(40,100,197,.15)]" : "border-line hover:border-brand-200")}>
            <m.icon className="h-5 w-5 text-brand" />
            <p className="mt-3 font-semibold text-navy">{m.title}</p>
            <p className="mt-0.5 text-sm text-ink-muted">{m.text}</p>
          </button>
        ))}
      </div>
      {mode === "blank" && (
        <Card className="max-w-xl p-6">
          <form onSubmit={(e) => { e.preventDefault(); go("blank", () => createForm(current!.id, emptyDefinition(title.trim() || "Untitled form"))); }}>
            <Field label="Form title">{(id) => <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Customer satisfaction survey" autoFocus maxLength={300} />}</Field>
            <Button type="submit" className="mt-4" loading={busy === "blank"}>Create form</Button>
          </form>
        </Card>
      )}
      {mode === "template" && <TemplateGallery busySlug={busy} onUse={(t) => go(t.slug, () => createForm(current!.id, t.definition, t.slug))} />}
      {mode === "ai" && (
        <Card className="max-w-2xl p-6">
          {cfg.data && !cfg.data.ai.configured ? (
            <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">AI drafting isn't available yet — the platform administrator hasn't configured an AI provider. You can start from a template or from scratch instead.</p>
          ) : (
            <form onSubmit={(e) => {
              e.preventDefault();
              go("ai", async () => {
                try {
                  const r = await api<{ definition: ReturnType<typeof emptyDefinition> }>("/ai/generate-form", { method: "POST", json: { workspaceId: current!.id, prompt } });
                  return createForm(current!.id, r.definition);
                } catch (er) {
                  throw new Error(er instanceof ApiRequestError ? er.message : "The AI draft could not be created.");
                }
              });
            }}>
              <Field label="What do you want to learn?" hint="Include your audience, goals and any topics to cover. The AI produces a draft — review every question before publishing.">
                {(id) => <Textarea id={id} value={prompt} onChange={(e) => setPrompt(e.target.value)} minLength={10} maxLength={2000} className="min-h-[140px]" placeholder="e.g. A survey for university students in Ghana about mobile data costs, preferred networks and how connectivity affects their studies." />}
              </Field>
              <p className="mt-2 text-xs text-ink-muted">Your description is sent to the configured AI provider to generate the draft. Uses AI credits.</p>
              <Button type="submit" className="mt-4" loading={busy === "ai"} disabled={prompt.trim().length < 10}><Sparkles /> Generate draft</Button>
            </form>
          )}
        </Card>
      )}
      {mode === "import" && (
        <Card className="max-w-2xl p-6">
          <form onSubmit={(e) => {
            e.preventDefault();
            go("import", async () => {
              const def = emptyDefinition(title.trim() || "Imported form");
              def.questions = importQuestionsFromText(text, def.sections[0].id);
              if (!def.questions.length) throw new Error("No questions found in that text.");
              return createForm(current!.id, def);
            });
          }}>
            <Field label="Form title">{(id) => <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Imported form" />}</Field>
            <Field className="mt-4" label="Questions" hint="One question per line. Lines starting with “-” or “a)” become options. End with * for required. Hints: [number] [long] [email] [phone] [date] [time] [rating] [scale] [multi] [dropdown] [yesno] [url].">
              {(id) => <Textarea id={id} value={text} onChange={(e) => setText(e.target.value)} className="min-h-[220px] font-mono text-xs" placeholder={"1. Full name *\n2. Which network do you use most?\n- MTN\n- Telecel\n- AT\n3. Monthly data spend (GHS) [number]"} />}
            </Field>
            <Button type="submit" className="mt-4" loading={busy === "import"} disabled={!text.trim()}>Import and edit</Button>
          </form>
        </Card>
      )}
    </div>
  );
}
