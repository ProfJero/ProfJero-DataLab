import { Link } from "react-router-dom";
import { ArrowRight, BarChart3, Bot, Check, FileBarChart, GitBranch, Grid3x3, Layers, Lock, MousePointerClick, ShieldCheck, Smartphone, Sparkles, Users, Wand2 } from "lucide-react";
import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { Button } from "@/components/ui/button";
import { CategoryBars } from "@/components/charts/Charts";

const STEPS = [
  { icon: Wand2, title: "Create", text: "Build forms with 19 question types, sections and conditional logic — or start from a template or an AI draft." },
  { icon: MousePointerClick, title: "Collect", text: "Share a link, QR code or embed. Respondents get a fast, accessible, mobile-first experience." },
  { icon: BarChart3, title: "Analyse", text: "Verified statistics, charts, filters, cross-tabulation and group comparisons update as responses arrive." },
  { icon: Sparkles, title: "Understand", text: "Ask the AI Data Analyst questions and generate professional reports grounded in your actual data." },
];

const FAQ = [
  ["How is DataLab different from an ordinary form builder?", "Form builders stop at collecting responses. DataLab continues into analysis: statistics are calculated for every question, you can cross-tabulate and compare groups, ask an AI analyst questions in plain language, and generate editable reports — all from the same place."],
  ["Does the AI make up numbers?", "No. DataLab calculates every statistic itself and gives the AI only those verified figures. Any number in an AI answer that doesn't match a calculation is flagged, and the evidence behind each answer is shown alongside it."],
  ["Do respondents need an account?", "No. Public forms work without registration. You can optionally require sign-in for a form."],
  ["Is my data shared with AI providers?", "Only if you use AI features, and only aggregated statistics plus a redacted sample of written answers (contact questions are excluded). Workspace and form owners can switch AI analysis off entirely."],
  ["Can my team work together?", "Yes. Workspaces support owners, admins, editors, analysts and viewers, with permissions enforced in the database."],
  ["Can I export my data?", "Yes — CSV and Excel exports of responses, plus printable/PDF reports."],
];

export default function Landing() {
  return (
    <MarketingLayout>
      <section className="relative overflow-hidden bg-navy text-white">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(40,100,197,.5),transparent_60%)]" aria-hidden />
        <div className="container relative grid gap-12 py-20 lg:grid-cols-[1.05fr_1fr] lg:py-28">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-brand-100"><Sparkles className="h-3.5 w-3.5" /> Create. Collect. Analyse. Understand.</p>
            <h1 className="mt-6 text-4xl font-semibold leading-[1.1] text-white sm:text-5xl lg:text-6xl">Smarter Surveys.<br /><span className="text-brand-200">Better Decisions.</span></h1>
            <p className="mt-6 max-w-xl text-lg text-slate-300">Create powerful forms, collect meaningful responses and turn your data into actionable insights.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" asChild><Link to="/auth/sign-up">Start creating for free <ArrowRight /></Link></Button>
              <Button size="lg" variant="secondary" className="border-white/20 bg-white/5 text-white hover:bg-white/10" asChild><Link to="/features">Explore features</Link></Button>
            </div>
            <p className="mt-4 text-sm text-slate-400">Free plan available · No credit card required</p>
          </div>
          <div className="relative" aria-hidden>
            <div className="rounded-2xl bg-white p-5 text-ink shadow-pop">
              <div className="flex items-center justify-between"><p className="text-sm font-semibold text-navy">Which mobile network do you use most?</p><span className="rounded-full bg-insight-50 px-2 py-0.5 text-[11px] font-medium text-insight-700">Illustrative example</span></div>
              <p className="mt-1 text-xs text-ink-muted">How results appear in DataLab</p>
              <div className="mt-4"><CategoryBars total={80} items={[{ label: "Network A", count: 48, percent: 60 }, { label: "Network B", count: 20, percent: 25 }, { label: "Network C", count: 12, percent: 15 }]} /></div>
            </div>
            <div className="ml-auto mt-4 max-w-sm rounded-2xl bg-white p-4 text-sm text-ink shadow-pop sm:-mt-6 sm:mr-[-12px]">
              <p className="flex items-center gap-2 font-semibold text-navy"><Bot className="h-4 w-4 text-brand" /> AI Data Analyst</p>
              <p className="mt-2 text-ink-muted">“Network A was selected by <strong className="text-navy">48 of the 80 respondents (60%)</strong>, making it the most frequently selected network.”</p>
              <p className="mt-2 flex items-center gap-1 text-xs text-insight-700"><ShieldCheck className="h-3.5 w-3.5" /> Figures verified against calculated results</p>
            </div>
          </div>
        </div>
      </section>

      <section className="container py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold sm:text-4xl">More than a form builder</h2>
          <p className="mt-4 text-lg text-ink-muted">Most tools stop when the responses arrive. DataLab takes you from the first question to an informed decision — in one platform.</p>
        </div>
        <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <div key={s.title} className="relative rounded-2xl border border-line p-6">
              <span className="text-xs font-semibold text-brand">0{i + 1}</span>
              <s.icon className="mt-3 h-7 w-7 text-navy" />
              <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm text-ink-muted">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-canvas py-20">
        <div className="container grid items-center gap-12 lg:grid-cols-2">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-brand">Form builder</p>
            <h2 className="mt-2 text-3xl font-semibold">Professional forms without technical knowledge</h2>
            <ul className="mt-6 space-y-3 text-ink-muted">{["19 question types — from rating scales and Likert grids to file uploads", "Drag-and-drop ordering, sections and multi-page layouts", "Plain-language conditional logic and section skips, validated before publishing", "Reliable autosave with undo/redo — your work is never silently lost", "Templates for education, research, business and organisations"].map((t) => <li key={t} className="flex gap-3"><Check className="mt-0.5 h-5 w-5 shrink-0 text-insight-600" />{t}</li>)}</ul>
          </div>
          <div className="rounded-2xl border border-line bg-white p-6 shadow-card" aria-hidden>
            {["How satisfied are you with our service?", "What could we do better?"].map((t, i) => (
              <div key={t} className={`rounded-xl border p-4 ${i === 0 ? "border-brand shadow-[0_0_0_3px_rgba(40,100,197,.12)]" : "mt-3 border-line"}`}>
                <p className="text-xs text-ink-muted">Q{i + 1} · {i === 0 ? "Single choice" : "Long text"}{i === 1 && <span className="ml-2 inline-flex items-center gap-1 rounded bg-brand-50 px-1.5 text-brand-700"><GitBranch className="h-3 w-3" /> Shown if dissatisfied</span>}</p>
                <p className="mt-1 font-medium text-navy">{t}</p>
                {i === 0 && <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-ink-muted">{["Very satisfied", "Satisfied", "Neutral", "Dissatisfied"].map((o) => <span key={o} className="rounded-lg border border-line px-3 py-1.5">{o}</span>)}</div>}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="container grid items-center gap-12 py-20 lg:grid-cols-2">
        <div className="order-2 grid grid-cols-2 gap-4 lg:order-1" aria-hidden>
          {[[BarChart3, "Question-level charts", "The right chart for each question type"], [Grid3x3, "Cross-tabulation", "With chi-square significance tests"], [Users, "Group comparison", "Means and medians across groups"], [Layers, "Filters", "Date ranges, answers and review status"]].map(([I, t, d]) => { const Icon = I as typeof BarChart3; return <div key={t as string} className="rounded-2xl border border-line p-5"><Icon className="h-6 w-6 text-brand" /><p className="mt-3 font-semibold text-navy">{t as string}</p><p className="mt-1 text-sm text-ink-muted">{d as string}</p></div>; })}
        </div>
        <div className="order-1 lg:order-2">
          <p className="text-sm font-semibold uppercase tracking-wide text-brand">Analytics</p>
          <h2 className="mt-2 text-3xl font-semibold">Accurate statistics, calculated for you</h2>
          <p className="mt-4 text-ink-muted">Counts, percentages, means, medians, distributions and outliers are computed in the database with tested functions. Sample sizes and skipped answers are always shown, so you never mistake a percentage for a fact it isn't.</p>
        </div>
      </section>

      <section className="bg-navy py-20 text-white">
        <div className="container grid gap-12 lg:grid-cols-2">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-brand-200">AI Data Analyst</p>
            <h2 className="mt-2 text-3xl font-semibold text-white">Ask questions. Get answers you can trust.</h2>
            <p className="mt-4 text-slate-300">Ask “What are the main challenges respondents reported?” or “Compare male and female respondents.” The analyst chooses from controlled calculations, runs them on your data, and explains what the figures show — separating verified results from interpretation and recommendations.</p>
            <ul className="mt-6 space-y-3 text-slate-300">{["No AI-generated SQL — only approved analytics operations", "Respondent text treated as untrusted data, with personal details redacted", "Evidence panel shows every statistic behind an answer", "Usage limits and full on/off control per workspace and per form"].map((t) => <li key={t} className="flex gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-insight-100" />{t}</li>)}</ul>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {[[Sparkles, "Theme identification", "Themes are suggested by AI; DataLab counts the matching answers itself."], [FileBarChart, "Report drafting", "Executive summaries and research reports you can edit before export."], [Bot, "Natural-language questions", "Conversational follow-ups with context."], [Lock, "Privacy first", "Contact fields are never sent to the AI provider."]].map(([I, t, d]) => { const Icon = I as typeof Bot; return <div key={t as string} className="rounded-2xl bg-white/5 p-5 ring-1 ring-white/10"><Icon className="h-6 w-6 text-brand-200" /><p className="mt-3 font-semibold text-white">{t as string}</p><p className="mt-1 text-sm text-slate-400">{d as string}</p></div>; })}
          </div>
        </div>
      </section>

      <section className="container py-20">
        <h2 className="text-center text-3xl font-semibold">Built for people who need answers</h2>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[["Education", "Course evaluations, student feedback, registrations and school surveys."], ["Research", "Questionnaires with consent, demographics, cross-tabulation and reporting."], ["Business", "Customer satisfaction, NPS, product feedback and employee pulse surveys."], ["Non-profits", "Community needs assessments, volunteer and membership registration."], ["Churches & associations", "Member registration, event feedback and ministry sign-ups."], ["Government & public sector", "Public opinion polls and service evaluations, with mobile-first access."]].map(([t, d]) => <div key={t} className="rounded-2xl border border-line p-6"><h3 className="font-semibold">{t}</h3><p className="mt-2 text-sm text-ink-muted">{d}</p></div>)}
        </div>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-6 text-sm text-ink-muted"><span className="inline-flex items-center gap-2"><Smartphone className="h-4 w-4" /> Mobile-first respondent experience</span><span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Row-level security & tenant isolation</span><span className="inline-flex items-center gap-2"><Users className="h-4 w-4" /> Role-based teams</span></div>
      </section>

      <section className="bg-canvas py-20">
        <div className="container max-w-3xl">
          <h2 className="text-center text-3xl font-semibold">Frequently asked questions</h2>
          <div className="mt-10 divide-y divide-line rounded-2xl border border-line bg-white">
            {FAQ.map(([q, a]) => <details key={q} className="group p-5"><summary className="cursor-pointer list-none font-medium text-navy marker:hidden">{q}<span className="float-right text-ink-subtle transition group-open:rotate-45">+</span></summary><p className="mt-3 text-sm text-ink-muted">{a}</p></details>)}
          </div>
        </div>
      </section>

      <section className="container py-20 text-center">
        <h2 className="text-3xl font-semibold sm:text-4xl">Turn your next survey into a decision</h2>
        <p className="mx-auto mt-4 max-w-xl text-ink-muted">Start free. Upgrade when you need advanced analytics, research tools or your whole team.</p>
        <div className="mt-8 flex justify-center gap-3"><Button size="lg" asChild><Link to="/auth/sign-up">Start creating for free</Link></Button><Button size="lg" variant="secondary" asChild><Link to="/pricing">See pricing</Link></Button></div>
      </section>
    </MarketingLayout>
  );
}
