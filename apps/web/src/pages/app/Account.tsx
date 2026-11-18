import { useState } from "react";
import { toast } from "sonner";
import { Download, ImagePlus, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Avatar, Card, CardHeader, PageHeader, Switch } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/ui/dialog";
import { dbMessage, rpc, supabase } from "@/lib/supabase";
import { uploadImage } from "@/lib/uploads";
import { useAuth } from "@/hooks/useAuth";
import { usePlatformConfig } from "@/hooks/useConfig";
import { downloadBlob, fmtDate } from "@/lib/utils";

export default function Account() {
  const { profile, user, refreshProfile } = useAuth();
  const cfg = usePlatformConfig();
  const [name, setName] = useState(profile?.full_name ?? "");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const update = async (patch: Record<string, unknown>, msg: string) => {
    const { error } = await supabase.from("profiles").update(patch).eq("id", user!.id);
    if (error) return toast.error(dbMessage(error));
    toast.success(msg);
    refreshProfile();
  };
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Account & privacy" description="Manage your profile, security and personal data." />
      <Card>
        <CardHeader title="Profile" />
        <div className="space-y-5 p-5">
          <div className="flex items-center gap-4">
            <Avatar name={profile?.full_name} email={user?.email} url={profile?.avatar_url} size={56} />
            {cfg.data?.uploads.configured ? (
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm font-medium text-navy hover:bg-slate-50"><ImagePlus className="h-4 w-4" /> Change photo
                <input type="file" accept="image/*" className="sr-only" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; try { await update({ avatar_url: await uploadImage({ purpose: "avatar", file: f }) }, "Photo updated"); } catch (er) { toast.error((er as Error).message); } }} />
              </label>
            ) : <p className="text-xs text-ink-muted">Profile photos become available once image uploads are configured.</p>}
          </div>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); update({ full_name: name.trim() }, "Name updated"); }}>
            <Field label="Full name" className="flex-1">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />}</Field>
            <Button type="submit" variant="secondary" className="self-end">Save</Button>
          </form>
          <p className="text-sm text-ink-muted">Email: <strong className="text-navy">{user?.email}</strong></p>
        </div>
      </Card>
      <Card>
        <CardHeader title="Password" />
        <form className="flex flex-col gap-2 p-5 sm:flex-row" onSubmit={async (e) => { e.preventDefault(); if (pw.length < 8 || !/\d/.test(pw) || !/[A-Za-z]/.test(pw)) return toast.error("Use at least 8 characters with a letter and a number."); setBusy("pw"); const { error } = await supabase.auth.updateUser({ password: pw }); setBusy(null); if (error) return toast.error(error.message); setPw(""); toast.success("Password changed"); }}>
          <Input type="password" autoComplete="new-password" placeholder="New password" value={pw} onChange={(e) => setPw(e.target.value)} aria-label="New password" />
          <Button type="submit" loading={busy === "pw"}>Change password</Button>
        </form>
      </Card>
      <Card>
        <CardHeader title="Privacy" />
        <div className="space-y-5 p-5">
          <Switch checked={!!profile?.ai_processing_consent} onCheckedChange={(v) => update({ ai_processing_consent: v }, "Preference saved")} label="I understand AI features send aggregated survey data to an external AI provider" description="This records your preference. Workspace and form owners control whether AI analysis is enabled for their data." />
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" loading={busy === "export"} onClick={async () => { setBusy("export"); try { const d = await rpc<unknown>("export_my_data"); downloadBlob(new Blob([JSON.stringify(d, null, 2)], { type: "application/json" }), "datalab-my-data.json"); } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); } }}><Download /> Export my data</Button>
          </div>
          <p className="text-xs text-ink-muted">Form responses belong to the workspace that collected them. Export them from each form's Responses page.</p>
        </div>
      </Card>
      <Card className="border-red-200">
        <CardHeader title="Delete account" />
        <div className="p-5">
          {profile?.deletion_requested_at ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center"><ShieldAlert className="h-5 w-5 text-amber-600" /><p className="flex-1 text-sm text-ink-muted">Deletion requested on {fmtDate(profile.deletion_requested_at)}. The platform team will process it and contact you. Workspaces you own must be transferred or deleted first.</p><Button variant="secondary" onClick={async () => { await rpc("request_account_deletion", { p_cancel: true }); refreshProfile(); toast.success("Deletion request cancelled"); }}>Cancel request</Button></div>
          ) : (
            <ConfirmDialog title="Request account deletion?" description="We'll permanently delete your account and personal data after reviewing the request. Workspaces you own should be transferred or deleted first, or they'll be deleted with your account." destructive confirmLabel="Request deletion" onConfirm={async () => { await rpc("request_account_deletion", { p_cancel: false }); refreshProfile(); toast.success("Deletion requested"); }} trigger={<Button variant="danger">Request account deletion</Button>} />
          )}
        </div>
      </Card>
    </div>
  );
}
