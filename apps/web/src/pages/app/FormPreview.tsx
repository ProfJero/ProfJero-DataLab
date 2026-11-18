import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Monitor, Smartphone } from "lucide-react";
import { useState } from "react";
import { FormRenderer } from "@/components/forms/FormRenderer";
import { Button } from "@/components/ui/button";
import { ErrorState, Spinner } from "@/components/ui/misc";
import { getForm } from "@/lib/forms";
import { cn } from "@/lib/utils";

export default function FormPreview() {
  const { id = "" } = useParams();
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const q = useQuery({ queryKey: ["form", id], queryFn: () => getForm(id) });
  if (q.isLoading) return <Spinner className="min-h-screen" />;
  if (q.isError || !q.data) return <div className="p-6"><ErrorState error={q.error} /></div>;
  return (
    <div className="min-h-screen bg-slate-200/60">
      <div className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line bg-white px-4 py-2.5">
        <Button variant="ghost" size="sm" asChild><Link to={`/app/forms/${id}/edit`}><ArrowLeft /> Back to editor</Link></Button>
        <p className="hidden text-sm text-ink-muted sm:block">Previewing as a respondent — responses are not saved</p>
        <div className="flex rounded-lg bg-slate-100 p-1">
          <button aria-pressed={device === "desktop"} onClick={() => setDevice("desktop")} className={cn("rounded-md p-1.5", device === "desktop" && "bg-white shadow-sm")} aria-label="Desktop preview"><Monitor className="h-4 w-4" /></button>
          <button aria-pressed={device === "mobile"} onClick={() => setDevice("mobile")} className={cn("rounded-md p-1.5", device === "mobile" && "bg-white shadow-sm")} aria-label="Mobile preview"><Smartphone className="h-4 w-4" /></button>
        </div>
      </div>
      <div className={cn("mx-auto transition-all", device === "mobile" ? "my-6 max-w-[390px] overflow-hidden rounded-[28px] border-8 border-navy shadow-pop" : "")}>
        <FormRenderer key={device} definition={q.data.definition} mode="preview" collectEmail={q.data.publication.collectRespondentEmail} />
      </div>
    </div>
  );
}
