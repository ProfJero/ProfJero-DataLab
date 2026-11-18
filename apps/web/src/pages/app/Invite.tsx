import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { LogoFull } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/misc";
import { rpc } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

interface Inv { workspaceName: string; role: string; email: string; expired: boolean; accepted: boolean; revoked: boolean; emailMatches: boolean }

export default function Invite() {
  const { token = "" } = useParams();
  const { user, signOut } = useAuth();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const q = useQuery({ queryKey: ["invite", token], queryFn: () => rpc<Inv | null>("get_invitation", { p_token: token }) });
  if (q.isLoading) return <Spinner className="min-h-screen" />;
  const inv = q.data;
  const invalid = !inv || inv.expired || inv.accepted || inv.revoked;
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="card w-full max-w-md p-8 text-center">
        <div className="flex justify-center"><LogoFull width={220} /></div>
        {invalid ? (
          <>
            <h1 className="mt-8 text-xl font-semibold">This invitation is no longer valid</h1>
            <p className="mt-2 text-sm text-ink-muted">{inv?.accepted ? "It has already been accepted." : inv?.expired ? "It has expired." : "It may have been revoked."} Ask the workspace admin to send a new one.</p>
            <Button asChild className="mt-6"><Link to="/app">Go to DataLab</Link></Button>
          </>
        ) : (
          <>
            <h1 className="mt-8 text-xl font-semibold">Join {inv.workspaceName}</h1>
            <p className="mt-2 text-sm text-ink-muted">You've been invited as <strong className="capitalize">{inv.role}</strong>.</p>
            {inv.emailMatches ? (
              <Button
                className="mt-6 w-full"
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await rpc("accept_invitation", { p_token: token });
                    localStorage.removeItem("datalab.workspace");
                    toast.success(`You joined ${inv.workspaceName}`);
                    window.location.assign("/app");
                  } catch (e) {
                    toast.error((e as Error).message);
                    setBusy(false);
                  }
                }}
              >
                Accept invitation
              </Button>
            ) : (
              <div className="mt-6 rounded-xl bg-amber-50 p-4 text-left text-sm text-amber-900">
                This invitation was sent to <strong>{inv.email}</strong>, but you're signed in as <strong>{user?.email}</strong>.
                <Button variant="secondary" className="mt-3 w-full" onClick={async () => { await signOut(); nav(`/auth/sign-in?next=/invite/${token}`); }}>Sign in with a different account</Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
