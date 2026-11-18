import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Flag, Lock } from "lucide-react";
import type { FormDefinition } from "@datalab/shared";
import { FormRenderer } from "@/components/forms/FormRenderer";
import { Spinner } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { LogoMark } from "@/components/brand/Logo";
import { api, ApiRequestError } from "@/lib/api";
import { uploadRespondentFile } from "@/lib/uploads";
import { useAuth } from "@/hooks/useAuth";

interface PublicFormData { id: string; slug: string; version: number; available: boolean; unavailableReason: string | null; closedMessage: string | null; requireAuth: boolean; honeypot: boolean; collectRespondentEmail: boolean; workspace: { name: string; logoUrl: string | null }; branding: boolean; definition: FormDefinition }

function ReportAbuse({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("spam");
  const [details, setDetails] = useState("");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"><Flag className="h-3 w-3" /> Report this form</DialogTrigger>
      <DialogContent title="Report this form" description="Tell us if this form is being used for phishing, spam or other abuse. Reports are reviewed by the platform team.">
        {state === "done" ? (
          <p className="rounded-lg bg-insight-50 p-4 text-sm text-insight-700">Thank you. Your report has been submitted.</p>
        ) : (
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setState("busy");
              try {
                await api("/public/abuse-reports", { method: "POST", anonymous: true, json: { slug, reason, details, email } });
                setState("done");
              } catch {
                setState("error");
              }
            }}
          >
            <Field label="Reason">{(id) => <Select id={id} value={reason} onChange={(e) => setReason(e.target.value)}><option value="phishing">Phishing or asks for passwords</option><option value="spam">Spam</option><option value="harassment">Harassment or hate</option><option value="illegal">Illegal content</option><option value="privacy">Privacy violation</option><option value="other">Other</option></Select>}</Field>
            <Field label="Details (optional)">{(id) => <Textarea id={id} value={details} onChange={(e) => setDetails(e.target.value)} maxLength={4000} />}</Field>
            <Field label="Your email (optional)">{(id) => <Input id={id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
            {state === "error" && <p className="text-sm text-red-600">Could not submit the report. Please try again later.</p>}
            <div className="flex justify-end"><Button type="submit" loading={state === "busy"}>Submit report</Button></div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function PublicForm() {
  const { slug = "" } = useParams();
  const [params] = useSearchParams();
  const embed = params.get("embed") === "1";
  const { session } = useAuth();
  const q = useQuery({ queryKey: ["public-form", slug], queryFn: () => api<PublicFormData>(`/public/forms/${slug}`, { anonymous: true }), retry: false });
  useEffect(() => {
    if (q.data) document.title = `${q.data.definition.title} — ProfJero DataLab`;
  }, [q.data]);

  if (q.isLoading) return <Spinner className="min-h-screen" />;
  if (q.isError || !q.data) {
    const notFound = q.error instanceof ApiRequestError && q.error.status === 404;
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-4 text-center">
        <LogoMark size={44} />
        <h1 className="mt-6 text-xl font-semibold">{notFound ? "This form isn't available" : "We couldn't load this form"}</h1>
        <p className="mt-2 max-w-sm text-sm text-ink-muted">{notFound ? "The link may be incorrect, or the form may have been unpublished." : "Please check your connection and try again."}</p>
      </div>
    );
  }
  const f = q.data;
  if (!f.available) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center" style={{ background: f.definition.theme.background }}>
        <div className="card max-w-md p-8">
          <Lock className="mx-auto h-8 w-8 text-slate-400" />
          <h1 className="mt-4 text-xl font-semibold">{f.definition.title}</h1>
          <p className="mt-2 text-sm text-ink-muted">{f.closedMessage || (f.unavailableReason === "limit_reached" ? "This form has reached its maximum number of responses." : "This form is no longer accepting responses.")}</p>
        </div>
      </div>
    );
  }
  if (f.requireAuth && !session) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center" style={{ background: f.definition.theme.background }}>
        <div className="card max-w-md p-8">
          <h1 className="text-xl font-semibold">{f.definition.title}</h1>
          <p className="mt-2 text-sm text-ink-muted">The form owner requires respondents to sign in before responding.</p>
          <Button asChild className="mt-6"><Link to={`/auth/sign-in?next=/f/${slug}`}>Sign in to respond</Link></Button>
        </div>
      </div>
    );
  }
  return (
    <div>
      <FormRenderer
        definition={f.definition}
        mode="live"
        embed={embed}
        branding={f.branding}
        workspace={f.workspace}
        collectEmail={f.collectRespondentEmail}
        honeypot={f.honeypot}
        onUpload={(qq, file) => uploadRespondentFile(slug, qq.id, file)}
        onSubmit={async (payload) => {
          try {
            await api(`/public/forms/${slug}/submit`, { method: "POST", anonymous: !f.requireAuth, json: payload });
            return { ok: true };
          } catch (e) {
            if (e instanceof ApiRequestError) return { ok: false, message: e.message, errors: e.code === "validation_failed" ? (e.details as Record<string, string>) : undefined };
            return { ok: false };
          }
        }}
      />
      {!embed && <div className="pb-8 text-center" style={{ background: f.definition.theme.background }}><ReportAbuse slug={slug} /></div>}
    </div>
  );
}
