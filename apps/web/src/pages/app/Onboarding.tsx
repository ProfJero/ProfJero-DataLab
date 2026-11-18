import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BookOpen, Briefcase, Church, FlaskConical, HandHeart, MoreHorizontal, User } from "lucide-react";
import { LogoFull } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { rpc } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { cn } from "@/lib/utils";

const USES = [
  { id: "education", label: "Education", icon: BookOpen },
  { id: "research", label: "Research", icon: FlaskConical },
  { id: "business", label: "Business", icon: Briefcase },
  { id: "nonprofit", label: "Non-profit", icon: HandHeart },
  { id: "religious", label: "Church or religious", icon: Church },
  { id: "personal", label: "Personal use", icon: User },
  { id: "other", label: "Other", icon: MoreHorizontal },
];

export default function Onboarding() {
  const { profile, refreshProfile, user } = useAuth();
  const { current, refresh } = useWorkspace();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(profile?.full_name ?? (user?.user_metadata?.full_name as string) ?? "");
  const [ws, setWs] = useState("");
  const [use, setUse] = useState<string | null>(null);
  const [orgType, setOrgType] = useState("");
  const [busy, setBusy] = useState(false);
  if (profile?.onboarded_at && current) return <Navigate to="/app" replace />;

  async function finish() {
    setBusy(true);
    try {
      await rpc("complete_onboarding", { p_full_name: name, p_intended_use: use, p_organisation_type: orgType, p_workspace_name: ws || (name ? `${name.split(" ")[0]}'s workspace` : "My workspace") });
      refreshProfile();
      refresh();
      await qc.invalidateQueries();
      nav("/app", { replace: true });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto flex max-w-xl flex-col px-4 py-10">
        <LogoFull width={200} />
        <div className="mt-10 flex gap-2" aria-label={`Step ${step + 1} of 3`}>{[0, 1, 2].map((i) => <span key={i} className={cn("h-1.5 flex-1 rounded-full", i <= step ? "bg-brand" : "bg-slate-200")} />)}</div>
        <div className="card mt-6 p-6 sm:p-8">
          {step === 0 && (
            <>
              <h1 className="text-2xl font-semibold">Welcome to DataLab 👋</h1>
              <p className="mt-2 text-sm text-ink-muted">Let's set up your workspace. It only takes a moment.</p>
              <div className="mt-6 space-y-4">
                <Field label="Your name" required>{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} autoFocus />}</Field>
                <Field label="Workspace or organisation name" hint="You can change this later and create more workspaces.">{(id) => <Input id={id} value={ws} onChange={(e) => setWs(e.target.value)} placeholder="e.g. Accra Research Unit" />}</Field>
              </div>
              <div className="mt-8 flex justify-end"><Button onClick={() => setStep(1)} disabled={name.trim().length < 2}>Continue</Button></div>
            </>
          )}
          {step === 1 && (
            <>
              <h1 className="text-2xl font-semibold">How will you use DataLab?</h1>
              <p className="mt-2 text-sm text-ink-muted">This helps us suggest relevant templates.</p>
              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3" role="radiogroup">
                {USES.map((u) => (
                  <button key={u.id} role="radio" aria-checked={use === u.id} onClick={() => setUse(u.id)} className={cn("flex flex-col items-start gap-3 rounded-xl border p-4 text-left text-sm font-medium transition", use === u.id ? "border-brand bg-brand-50 text-brand-700 shadow-focus" : "border-line bg-white hover:border-brand-200")}>
                    <u.icon className="h-5 w-5" />
                    {u.label}
                  </button>
                ))}
              </div>
              <div className="mt-8 flex justify-between">
                <Button variant="ghost" onClick={() => setStep(0)}>Back</Button>
                <div className="flex gap-2"><Button variant="ghost" onClick={() => setStep(2)}>Skip</Button><Button onClick={() => setStep(2)} disabled={!use}>Continue</Button></div>
              </div>
            </>
          )}
          {step === 2 && (
            <>
              <h1 className="text-2xl font-semibold">Anything else? <span className="text-ink-muted">(optional)</span></h1>
              <div className="mt-6 space-y-4">
                <Field label="Organisation type" hint="For example: university, SME, NGO, church, government agency.">{(id) => <Input id={id} value={orgType} onChange={(e) => setOrgType(e.target.value)} />}</Field>
              </div>
              <div className="mt-8 flex justify-between">
                <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
                <Button onClick={finish} loading={busy}>Go to my dashboard</Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
