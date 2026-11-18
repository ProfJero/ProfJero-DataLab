import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/misc";
import { TemplateGallery } from "@/components/forms/TemplateGallery";
import { createForm } from "@/lib/forms";
import { useWorkspace } from "@/hooks/useWorkspace";

export default function Templates() {
  const { current, can } = useWorkspace();
  const nav = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <div>
      <PageHeader title="Template library" description="Professionally structured forms you can preview, customise and launch in minutes." />
      <TemplateGallery
        busySlug={busy}
        actionLabel={can("forms.edit") ? "Use template" : "Preview only"}
        onUse={async (t) => {
          if (!can("forms.edit")) return toast.error("You need editor access to create forms.");
          setBusy(t.slug);
          try {
            const id = await createForm(current!.id, t.definition, t.slug);
            nav(`/app/forms/${id}/edit`);
          } catch (e) {
            toast.error((e as Error).message);
          } finally {
            setBusy(null);
          }
        }}
      />
    </div>
  );
}
