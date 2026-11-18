import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import { toast } from "sonner";
import { Code2, Copy, Download, ExternalLink, Link2, Lock, QrCode, Rocket, Unlock } from "lucide-react";
import type { PublicationSettings } from "@datalab/shared";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Card, CardHeader, Switch } from "@/components/ui/misc";
import { publicUrl, setStatus } from "@/lib/forms";
import { rpc } from "@/lib/supabase";
import { useWorkspace } from "@/hooks/useWorkspace";
import { downloadBlob } from "@/lib/utils";
import { useFormContext } from "./FormLayout";

function copy(text: string, what: string) {
  navigator.clipboard.writeText(text).then(() => toast.success(`${what} copied`), () => toast.error("Couldn't copy — select and copy manually."));
}

export default function FormShare() {
  const { form, refetch } = useFormContext();
  const { can } = useWorkspace();
  const qc = useQueryClient();
  const url = publicUrl(form.slug);
  const [qr, setQr] = useState<string | null>(null);
  const [pub, setPub] = useState<PublicationSettings>(form.publication);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const editable = can("forms.edit");
  useEffect(() => {
    QRCode.toDataURL(url, { width: 512, margin: 1, color: { dark: "#112442", light: "#FFFFFF" } }).then(setQr);
  }, [url]);
  const embed = `<iframe src="${url}?embed=1" width="100%" height="720" style="border:0;max-width:760px" title="${form.definition.title.replace(/"/g, "&quot;")}" loading="lazy"></iframe>`;

  async function changeStatus(s: "published" | "closed" | "draft") {
    setBusy(true);
    try {
      await setStatus(form.id, s);
      toast.success(s === "published" ? "Form is accepting responses" : s === "closed" ? "Form closed" : "Moved back to draft");
      refetch();
      qc.invalidateQueries({ queryKey: ["forms"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveSettings() {
    setSaving(true);
    try {
      await rpc("update_publication_settings", { p_form_id: form.id, p_settings: { ...pub, closesAt: pub.closesAt ?? "", responseLimit: pub.responseLimit ?? "" } });
      toast.success("Settings saved");
      refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const live = form.status === "published";
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        <Card>
          <CardHeader title="Status" description={live ? "Your form is live and accepting responses." : form.status === "closed" ? "Your form is closed. Respondents see a closed message." : form.status === "draft" ? "Publish your form to start collecting responses." : "Archived forms are read-only."} />
          <div className="flex flex-wrap gap-2 p-5">
            {editable && form.status === "draft" && <Button onClick={() => changeStatus("published")} loading={busy}><Rocket /> Publish form</Button>}
            {editable && live && <Button variant="secondary" onClick={() => changeStatus("closed")} loading={busy}><Lock /> Close form</Button>}
            {editable && form.status === "closed" && <Button onClick={() => changeStatus("published")} loading={busy}><Unlock /> Reopen form</Button>}
            {editable && form.status !== "draft" && form.status !== "archived" && form.responseCount === 0 && <Button variant="ghost" onClick={() => changeStatus("draft")} loading={busy}>Unpublish</Button>}
          </div>
        </Card>
        <Card>
          <CardHeader title="Share link" description={form.status === "draft" ? "The link works once the form is published." : "Anyone with this link can respond."} />
          <div className="space-y-4 p-5">
            <div className="flex gap-2">
              <Input readOnly value={url} aria-label="Public form link" onFocus={(e) => e.target.select()} />
              <Button variant="secondary" onClick={() => copy(url, "Link")}><Copy /> Copy</Button>
              <Button variant="secondary" size="icon" asChild aria-label="Open form"><a href={url} target="_blank" rel="noopener"><ExternalLink /></a></Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="subtle" size="sm" asChild><a href={`https://wa.me/?text=${encodeURIComponent(`${form.definition.title}: ${url}`)}`} target="_blank" rel="noopener noreferrer"><Link2 /> Share on WhatsApp</a></Button>
              <Button variant="subtle" size="sm" asChild><a href={`mailto:?subject=${encodeURIComponent(form.definition.title)}&body=${encodeURIComponent(url)}`}><Link2 /> Email</a></Button>
            </div>
          </div>
        </Card>
        <Card>
          <CardHeader title="Embed on a website" description="Paste this code into any web page." action={<Code2 className="h-5 w-5 text-ink-subtle" />} />
          <div className="p-5">
            <Textarea readOnly value={embed} className="font-mono text-xs" aria-label="Embed code" onFocus={(e) => e.target.select()} />
            <Button variant="secondary" size="sm" className="mt-3" onClick={() => copy(embed, "Embed code")}><Copy /> Copy embed code</Button>
          </div>
        </Card>
        <Card>
          <CardHeader title="Collection settings" />
          <div className="space-y-5 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Close automatically on" hint="Leave empty to keep open.">{(id) => <Input id={id} type="datetime-local" disabled={!editable} value={pub.closesAt ? new Date(new Date(pub.closesAt).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ""} onChange={(e) => setPub({ ...pub, closesAt: e.target.value ? new Date(e.target.value).toISOString() : null })} />}</Field>
              <Field label="Response limit" hint="Stop accepting after this many responses.">{(id) => <Input id={id} type="number" min={1} disabled={!editable} value={pub.responseLimit ?? ""} onChange={(e) => setPub({ ...pub, responseLimit: e.target.value ? Number(e.target.value) : null })} />}</Field>
            </div>
            <Switch disabled={!editable} checked={pub.preventDuplicates} onCheckedChange={(v) => setPub({ ...pub, preventDuplicates: v })} label="Limit to one response per device" description="Uses a privacy-preserving hash of network and browser details (no cookies). Signed-in respondents are limited by account." />
            <Switch disabled={!editable} checked={pub.requireAuth} onCheckedChange={(v) => setPub({ ...pub, requireAuth: v })} label="Require respondents to sign in" description="Respondents must have a DataLab account." />
            <Switch disabled={!editable} checked={pub.collectRespondentEmail} onCheckedChange={(v) => setPub({ ...pub, collectRespondentEmail: v })} label="Ask for respondent email (optional field)" description="Only enable if you need it — collect no more personal data than necessary." />
            <Switch disabled={!editable} checked={pub.honeypot} onCheckedChange={(v) => setPub({ ...pub, honeypot: v })} label="Spam protection" description="Invisible honeypot field and submission-speed checks. Rate limiting is always on." />
            <Switch disabled={!editable} checked={pub.aiAnalysisEnabled} onCheckedChange={(v) => setPub({ ...pub, aiAnalysisEnabled: v })} label="Allow AI analysis of responses" description="When off, responses to this form are never sent to the AI provider." />
            <Switch disabled={!editable} checked={pub.isPublic} onCheckedChange={(v) => setPub({ ...pub, isPublic: v })} label="Public link enabled" description="Turn off to temporarily disable the public link without closing the form." />
            <Field label="Message shown when closed">{(id) => <Input id={id} disabled={!editable} value={pub.closedMessage ?? ""} maxLength={1000} onChange={(e) => setPub({ ...pub, closedMessage: e.target.value || null })} placeholder="This form is no longer accepting responses." />}</Field>
            {editable && <Button onClick={saveSettings} loading={saving}>Save settings</Button>}
          </div>
        </Card>
      </div>
      <Card className="h-fit">
        <CardHeader title="QR code" description="Print it on posters, flyers or slides." action={<QrCode className="h-5 w-5 text-ink-subtle" />} />
        <div className="p-5">
          {qr && <img src={qr} alt={`QR code linking to ${url}`} className="mx-auto w-full max-w-[280px] rounded-lg border border-line" />}
          <Button variant="secondary" className="mt-4 w-full" disabled={!qr} onClick={() => { const bin = atob(qr!.split(",")[1]); downloadBlob(new Blob([Uint8Array.from(bin, (ch) => ch.charCodeAt(0))], { type: "image/png" }), `${form.slug}-qr.png`); }}><Download /> Download PNG</Button>
        </div>
      </Card>
    </div>
  );
}
