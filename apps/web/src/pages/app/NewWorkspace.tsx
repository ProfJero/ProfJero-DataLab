import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Card, PageHeader } from "@/components/ui/misc";
import { dbMessage, supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";

export default function NewWorkspace() {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const { user } = useAuth();
  const { switchTo, refresh } = useWorkspace();
  const nav = useNavigate();
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Create a workspace" description="Workspaces keep forms, responses and team members separate — for example per organisation, department or project." />
      <Card className="p-6">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const { data, error } = await supabase.from("workspaces").insert({ name: name.trim(), owner_id: user!.id, slug: "" }).select("id").single();
            setBusy(false);
            if (error) return toast.error(dbMessage(error));
            refresh();
            switchTo(data.id);
            toast.success("Workspace created");
            nav("/app");
          }}
        >
          <Field label="Workspace name" required>{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoFocus />}</Field>
          <div className="mt-6 flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => nav(-1)}>Cancel</Button><Button type="submit" loading={busy} disabled={name.trim().length < 1}>Create workspace</Button></div>
        </form>
      </Card>
    </div>
  );
}
