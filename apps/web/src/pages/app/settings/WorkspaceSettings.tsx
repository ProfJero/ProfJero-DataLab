import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ImagePlus, LogOut, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { Card, CardHeader, PageHeader, Switch } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/ui/dialog";
import { dbMessage, rpc, supabase } from "@/lib/supabase";
import { uploadImage } from "@/lib/uploads";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { usePlatformConfig } from "@/hooks/useConfig";
import { fmtDateTime } from "@/lib/utils";

export default function WorkspaceSettings() {
  const { current, can, refresh, workspaces, switchTo } = useWorkspace();
  const { user } = useAuth();
  const cfg = usePlatformConfig();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [name, setName] = useState(current?.name ?? "");
  const [retention, setRetention] = useState<string>(current?.data_retention_days ? String(current.data_retention_days) : "");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setName(current?.name ?? ""); setRetention(current?.data_retention_days ? String(current.data_retention_days) : ""); }, [current]);
  const audit = useQuery({ queryKey: ["audit", current?.id], enabled: can("members.manage"), queryFn: async () => (await supabase.from("audit_logs").select("id,action,target_type,details,created_at,profiles(full_name,email)").eq("workspace_id", current!.id).order("created_at", { ascending: false }).limit(30)).data ?? [] });
  if (!current) return null;
  const manage = can("workspace.manage");
  const update = async (patch: Record<string, unknown>, msg = "Workspace updated") => {
    const { error } = await supabase.from("workspaces").update(patch).eq("id", current.id);
    if (error) return toast.error(dbMessage(error));
    toast.success(msg);
    refresh();
  };
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Workspace settings" description="Manage how this workspace is identified and how its data is handled." />
      <Card>
        <CardHeader title="General" />
        <form className="space-y-5 p-5" onSubmit={async (e) => { e.preventDefault(); setBusy(true); await update({ name: name.trim() }); setBusy(false); }}>
          <Field label="Workspace name">{(id) => <Input id={id} value={name} disabled={!manage} onChange={(e) => setName(e.target.value)} maxLength={120} />}</Field>
          <div>
            <p className="label mb-2">Logo</p>
            <div className="flex items-center gap-4">
              {current.logo_url ? <img src={current.logo_url} alt="" className="h-14 w-14 rounded-xl border border-line object-cover" /> : <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-brand text-xl font-semibold text-white">{current.name[0]}</span>}
              {manage && (cfg.data?.uploads.configured ? (
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm font-medium text-navy hover:bg-slate-50">
                  <ImagePlus className="h-4 w-4" /> Upload logo
                  <input type="file" accept="image/*" className="sr-only" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; try { await update({ logo_url: await uploadImage({ purpose: "workspace_logo", workspaceId: current.id, file: f }) }, "Logo updated"); } catch (er) { toast.error((er as Error).message); } }} />
                </label>
              ) : <p className="text-xs text-ink-muted">Image uploads become available once Cloudinary is configured.</p>)}
              {manage && current.logo_url && <Button variant="ghost" size="sm" onClick={() => update({ logo_url: null }, "Logo removed")}>Remove</Button>}
            </div>
          </div>
          {manage && <Button type="submit" loading={busy}>Save</Button>}
        </form>
      </Card>
      <Card>
        <CardHeader title="Data & privacy" />
        <div className="space-y-5 p-5">
          <Switch disabled={!manage} checked={current.ai_enabled} onCheckedChange={(v) => update({ ai_enabled: v }, v ? "AI analysis enabled" : "AI analysis disabled")} label="Allow AI analysis in this workspace" description="When off, no response data from this workspace is sent to the AI provider." />
          <Field label="Response retention" hint="Your retention policy for this workspace. Responses older than this should be deleted by an admin; DataLab shows the policy to your team. Leave blank to keep data until you delete it.">
            {(id) => (
              <div className="flex gap-2">
                <Select id={id} disabled={!manage} value={retention} onChange={(e) => setRetention(e.target.value)} className="max-w-xs"><option value="">Keep until deleted</option><option value="90">90 days</option><option value="180">6 months</option><option value="365">1 year</option><option value="730">2 years</option><option value="1825">5 years</option></Select>
                {manage && <Button variant="secondary" onClick={() => update({ data_retention_days: retention ? Number(retention) : null }, "Retention policy saved")}>Save</Button>}
              </div>
            )}
          </Field>
        </div>
      </Card>
      {can("members.manage") && (
        <Card>
          <CardHeader title="Activity log" description="Recent important changes in this workspace." />
          <ul className="divide-y divide-line">
            {(audit.data ?? []).map((a) => {
              const p = a.profiles as unknown as { full_name: string | null; email: string } | null;
              return <li key={a.id} className="flex flex-wrap justify-between gap-2 px-5 py-2.5 text-sm"><span><span className="font-medium text-navy">{p?.full_name || p?.email || "System"}</span> <span className="text-ink-muted">{a.action.replace(/[._]/g, " ")}{(a.details as Record<string, string>)?.title ? ` — ${(a.details as Record<string, string>).title}` : ""}</span></span><span className="text-xs text-ink-subtle">{fmtDateTime(a.created_at)}</span></li>;
            })}
            {audit.data?.length === 0 && <li className="px-5 py-6 text-center text-sm text-ink-muted">No activity yet.</li>}
          </ul>
        </Card>
      )}
      <Card className="border-red-200">
        <CardHeader title="Danger zone" />
        <div className="flex flex-wrap gap-3 p-5">
          {current.role !== "owner" && (
            <ConfirmDialog title="Leave this workspace?" description="You'll lose access to its forms and responses until someone invites you again." confirmLabel="Leave workspace" destructive onConfirm={async () => { await rpc("remove_member", { p_workspace_id: current.id, p_user_id: user!.id }); const next = workspaces.find((w) => w.id !== current.id); if (next) switchTo(next.id); refresh(); nav("/app"); }} trigger={<Button variant="secondary"><LogOut /> Leave workspace</Button>} />
          )}
          {current.role === "owner" && (
            <ConfirmDialog title={`Delete “${current.name}”?`} description="All forms, responses, reports and members of this workspace will be permanently deleted. This cannot be undone." confirmLabel="Delete workspace" destructive onConfirm={async () => { const { error } = await supabase.from("workspaces").delete().eq("id", current.id); if (error) return toast.error(dbMessage(error)); toast.success("Workspace deleted"); localStorage.removeItem("datalab.workspace"); await qc.invalidateQueries(); window.location.assign("/app"); }} trigger={<Button variant="danger"><Trash2 /> Delete workspace</Button>} />
          )}
        </div>
      </Card>
    </div>
  );
}
