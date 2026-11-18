import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Crown, Lock, MailPlus, Trash2, UserMinus } from "lucide-react";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, type WorkspaceRole } from "@datalab/shared";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { Avatar, Badge, Card, CardHeader, PageHeader } from "@/components/ui/misc";
import { ConfirmDialog, Dialog, DialogContent } from "@/components/ui/dialog";
import { rpc, supabase } from "@/lib/supabase";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { fmtDate } from "@/lib/utils";

interface Member { user_id: string; role: WorkspaceRole; created_at: string; profiles: { full_name: string | null; email: string; avatar_url: string | null } }

export default function Members() {
  const { current, can, has, refresh, entitlements } = useWorkspace();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<WorkspaceRole>("editor");
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const members = useQuery({ queryKey: ["members", current?.id], queryFn: async () => ((await supabase.from("workspace_members").select("user_id,role,created_at,profiles!workspace_members_user_id_fkey(full_name,email,avatar_url)").eq("workspace_id", current!.id).order("created_at")).data ?? []) as unknown as Member[] });
  const invites = useQuery({ queryKey: ["invites", current?.id], enabled: can("members.manage"), queryFn: async () => (await supabase.from("workspace_invitations").select("id,email,role,created_at,expires_at").eq("workspace_id", current!.id).is("accepted_at", null).is("revoked_at", null).order("created_at", { ascending: false })).data ?? [] });
  const reload = () => { qc.invalidateQueries({ queryKey: ["members"] }); qc.invalidateQueries({ queryKey: ["invites"] }); refresh(); };
  const manage = can("members.manage");
  const myRole = current?.role;
  const run = async (fn: () => Promise<unknown>, msg: string) => { try { await fn(); toast.success(msg); reload(); } catch (e) { toast.error((e as Error).message); } };
  const assignable: WorkspaceRole[] = myRole === "owner" ? ["admin", "editor", "analyst", "viewer"] : ["editor", "analyst", "viewer"];
  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader title="Team" description={`People with access to ${current?.name}.`} actions={manage && has("team_collaboration") && <Button onClick={() => { setOpen(true); setLink(null); }}><MailPlus /> Invite member</Button>} />
      {!has("team_collaboration") && (
        <Card className="flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center"><Lock className="h-5 w-5 text-brand" /><p className="flex-1 text-sm text-ink-muted">Team collaboration is available on the Research and Organisation plans. Invite colleagues as editors, analysts or viewers with role-based permissions.</p><Button size="sm" asChild><Link to="/app/settings/billing">View plans</Link></Button></Card>
      )}
      <Card>
        <CardHeader title="Members" description={entitlements?.limits.members ? `${entitlements.usage.members ?? 0} of ${entitlements.limits.members} seats used (including pending invitations)` : undefined} />
        <ul className="divide-y divide-line">
          {(members.data ?? []).map((m) => {
            const self = m.user_id === user?.id;
            const canChange = manage && m.role !== "owner" && !self && (myRole === "owner" || m.role !== "admin");
            return (
              <li key={m.user_id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <Avatar name={m.profiles?.full_name} email={m.profiles?.email} url={m.profiles?.avatar_url} size={36} />
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-navy">{m.profiles?.full_name || m.profiles?.email}{self && <span className="text-ink-muted"> (you)</span>}</p><p className="truncate text-xs text-ink-muted">{m.profiles?.email} · joined {fmtDate(m.created_at)}</p></div>
                {canChange ? (
                  <Select aria-label={`Role for ${m.profiles?.email}`} className="h-9 w-36" value={m.role} onChange={(e) => run(() => rpc("update_member_role", { p_workspace_id: current!.id, p_user_id: m.user_id, p_role: e.target.value }), "Role updated")}>
                    {assignable.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </Select>
                ) : <Badge tone={m.role === "owner" ? "navy" : "default"}>{m.role === "owner" && <Crown />}{ROLE_LABELS[m.role]}</Badge>}
                {myRole === "owner" && !self && <ConfirmDialog title={`Transfer ownership to ${m.profiles?.full_name || m.profiles?.email}?`} description="They will become the owner with full control, including billing. You will become an admin." confirmLabel="Transfer ownership" onConfirm={() => run(() => rpc("transfer_workspace_ownership", { p_workspace_id: current!.id, p_new_owner: m.user_id }), "Ownership transferred")} trigger={<Button variant="ghost" size="icon-sm" aria-label="Transfer ownership"><Crown /></Button>} />}
                {canChange && <ConfirmDialog title="Remove member?" description={`${m.profiles?.email} will lose access to this workspace.`} destructive confirmLabel="Remove" onConfirm={() => run(() => rpc("remove_member", { p_workspace_id: current!.id, p_user_id: m.user_id }), "Member removed")} trigger={<Button variant="ghost" size="icon-sm" aria-label="Remove member"><UserMinus /></Button>} />}
              </li>
            );
          })}
        </ul>
      </Card>
      {manage && (invites.data ?? []).length > 0 && (
        <Card>
          <CardHeader title="Pending invitations" />
          <ul className="divide-y divide-line">
            {invites.data!.map((i) => (
              <li key={i.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <span className="min-w-0 flex-1 truncate text-navy">{i.email}</span><Badge>{ROLE_LABELS[i.role as WorkspaceRole]}</Badge><span className="hidden text-xs text-ink-muted sm:inline">expires {fmtDate(i.expires_at)}</span>
                <ConfirmDialog title="Revoke invitation?" description={`The link sent to ${i.email} will stop working.`} destructive confirmLabel="Revoke" onConfirm={() => run(() => rpc("revoke_invitation", { p_invitation_id: i.id }), "Invitation revoked")} trigger={<Button variant="ghost" size="icon-sm" aria-label="Revoke invitation"><Trash2 /></Button>} />
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card>
        <CardHeader title="Roles & permissions" />
        <dl className="grid gap-4 p-5 sm:grid-cols-2">{(Object.keys(ROLE_LABELS) as WorkspaceRole[]).map((r) => <div key={r}><dt className="text-sm font-semibold text-navy">{ROLE_LABELS[r]}</dt><dd className="text-sm text-ink-muted">{ROLE_DESCRIPTIONS[r]}</dd></div>)}</dl>
      </Card>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Invite a team member" description="They'll get access as soon as they accept with this email address.">
          {link ? (
            <div className="space-y-3">
              <p className="text-sm text-ink-muted">Invitation created. If email delivery isn't configured, share this link with them directly (it can only be used by {email}):</p>
              <div className="flex gap-2"><Input readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Invitation link" /><Button variant="secondary" onClick={() => navigator.clipboard.writeText(link).then(() => toast.success("Link copied"))}><Copy /></Button></div>
              <div className="flex justify-end"><Button onClick={() => { setOpen(false); setEmail(""); }}>Done</Button></div>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                const r = await api<{ inviteUrl: string; emailed: boolean }>(`/workspaces/${current!.id}/invitations`, { method: "POST", json: { email, role } });
                toast.success(r.emailed ? `Invitation emailed to ${email}` : "Invitation created");
                setLink(r.inviteUrl);
                reload();
              } catch (er) { toast.error((er as Error).message); } finally { setBusy(false); }
            }}>
              <Field label="Email address" required>{(id) => <Input id={id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />}</Field>
              <Field label="Role" hint={ROLE_DESCRIPTIONS[role]}>{(id) => <Select id={id} value={role} onChange={(e) => setRole(e.target.value as WorkspaceRole)}>{assignable.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</Select>}</Field>
              <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" loading={busy}>Send invitation</Button></div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
