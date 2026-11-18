import { Link } from "react-router-dom";
import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/brand/Logo";

export default function About() {
  return (
    <MarketingLayout>
      <section className="container max-w-3xl py-16">
        <LogoMark size={48} />
        <h1 className="mt-6 text-4xl font-semibold">About ProfJero DataLab</h1>
        <div className="mt-6 space-y-4 text-lg leading-relaxed text-ink-muted">
          <p>ProfJero DataLab is an intelligent data collection, survey, research and analytics platform. It helps individuals and organisations create forms, collect responses, understand their data and make informed decisions.</p>
          <p>We built DataLab around one idea: <strong className="text-navy">Create. Collect. Analyse. Understand.</strong> Collecting responses is only the beginning — the value is in what you learn from them. That's why analytics, an AI Data Analyst and report generation are built in, and why every figure is calculated and verifiable.</p>
          <p>DataLab is designed for educators, researchers, businesses, non-profits, churches and public institutions, with a mobile-first respondent experience that works well on any phone.</p>
          <p>ProfJero DataLab is a product of <strong className="text-navy">ProfJero Digital Studio</strong>.</p>
        </div>
        <Button className="mt-8" asChild><Link to="/contact">Get in touch</Link></Button>
      </section>
    </MarketingLayout>
  );
}
