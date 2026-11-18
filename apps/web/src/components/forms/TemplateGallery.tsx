import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, GitBranch, LayoutTemplate, Search } from "lucide-react";
import { buildTemplateDefinition, DISPLAY_TYPES, TEMPLATE_SPECS, type FormDefinition } from "@datalab/shared";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge, Card } from "@/components/ui/misc";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FormRenderer } from "./FormRenderer";
import { cn } from "@/lib/utils";

export interface TemplateItem { slug: string; category: string; title: string; summary: string; definition: FormDefinition; questionCount: number; usesLogic: boolean }

/** Built-in templates ship with the app; platform admins can add more in the database catalogue. */
export function useTemplates() {
  return useQuery({
    queryKey: ["templates"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const builtIn: TemplateItem[] = TEMPLATE_SPECS.map((s) => {
        const d = buildTemplateDefinition(s);
        return { slug: s.slug, category: s.category, title: s.title, summary: s.summary, definition: d, questionCount: d.questions.filter((q) => !DISPLAY_TYPES.includes(q.type)).length, usesLogic: d.questions.some((q) => q.visibility) };
      });
      const { data } = await supabase.from("form_templates").select("slug,category,title,summary,definition,question_count").eq("is_published", true).order("sort_order");
      const custom = (data ?? []).filter((t) => !builtIn.some((b) => b.slug === t.slug)).map((t) => ({ slug: t.slug, category: t.category, title: t.title, summary: t.summary ?? "", definition: t.definition as FormDefinition, questionCount: t.question_count, usesLogic: (t.definition as FormDefinition).questions.some((q) => q.visibility) }));
      return [...builtIn, ...custom];
    },
  });
}

export function TemplateGallery({ onUse, actionLabel = "Use template", busySlug }: { onUse: (t: TemplateItem) => void; actionLabel?: string; busySlug?: string | null }) {
  const q = useTemplates();
  const [cat, setCat] = useState("All");
  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState<TemplateItem | null>(null);
  const cats = ["All", "Education", "Research", "Business", "Organisations"];
  const items = useMemo(() => (q.data ?? []).filter((t) => (cat === "All" || t.category === cat) && (t.title + t.summary).toLowerCase().includes(search.toLowerCase())), [q.data, cat, search]);
  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-wrap gap-1.5" role="tablist">
          {cats.map((c) => <button key={c} role="tab" aria-selected={cat === c} onClick={() => setCat(c)} className={cn("rounded-full px-3 py-1.5 text-sm font-medium transition", cat === c ? "bg-navy text-white" : "bg-white text-ink-muted ring-1 ring-line hover:text-navy")}>{c}</button>)}
        </div>
        <div className="relative sm:ml-auto sm:w-64"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" /><Input className="pl-9" placeholder="Search templates" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search templates" /></div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((t) => (
          <Card key={t.slug} className="flex flex-col p-5 transition hover:border-brand-200 hover:shadow-pop">
            <div className="flex items-center gap-2"><span className="rounded-lg bg-brand-50 p-2 text-brand"><LayoutTemplate className="h-4 w-4" /></span><Badge>{t.category}</Badge>{t.usesLogic && <Badge tone="brand"><GitBranch /> Logic</Badge>}</div>
            <h3 className="mt-3 font-semibold text-navy">{t.title}</h3>
            <p className="mt-1 flex-1 text-sm text-ink-muted">{t.summary}</p>
            <p className="mt-3 text-xs text-ink-subtle">{t.questionCount} questions · {t.definition.sections.length} section{t.definition.sections.length > 1 ? "s" : ""}</p>
            <div className="mt-4 flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setPreview(t)}><Eye /> Preview</Button>
              <Button size="sm" onClick={() => onUse(t)} loading={busySlug === t.slug}>{actionLabel}</Button>
            </div>
          </Card>
        ))}
      </div>
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        {preview && (
          <DialogContent title={preview.title} description="Template preview — answers are not saved." wide className="bg-canvas p-0 sm:p-0">
            <div className="max-h-[70vh] overflow-y-auto"><FormRenderer definition={preview.definition} mode="preview" branding={false} embed /></div>
            <div className="sticky bottom-0 flex justify-end gap-2 border-t border-line bg-white p-4"><Button onClick={() => { onUse(preview); setPreview(null); }}>{actionLabel}</Button></div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
