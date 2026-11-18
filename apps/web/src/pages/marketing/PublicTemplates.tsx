import { useNavigate } from "react-router-dom";
import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { TemplateGallery } from "@/components/forms/TemplateGallery";

export default function PublicTemplates() {
  const nav = useNavigate();
  return (
    <MarketingLayout>
      <section className="container py-14">
        <h1 className="text-4xl font-semibold">Survey & form templates</h1>
        <p className="mt-3 max-w-2xl text-lg text-ink-muted">Professionally structured, fully editable templates for education, research, business and organisations. Preview any template, then sign up to use it.</p>
        <div className="mt-10"><TemplateGallery actionLabel="Use this template" onUse={() => nav("/auth/sign-up?next=/app/templates")} /></div>
      </section>
    </MarketingLayout>
  );
}
