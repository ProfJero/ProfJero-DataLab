import { Link } from "react-router-dom";
import { BarChart3, Bot, ClipboardList, Download, FileBarChart, GitBranch, Inbox, LayoutTemplate, Lock, QrCode, ShieldCheck, Users } from "lucide-react";
import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { Button } from "@/components/ui/button";

const GROUPS = [
  { icon: ClipboardList, title: "Form builder", items: ["19 question types including Likert, rating, scales, file upload and image choice", "Drag-and-drop reordering, sections and multi-page forms", "Validation: required, length, numeric ranges, selection limits, custom messages", "Autosave with clear save status, undo/redo and conflict detection", "Themes, cover images, logos, welcome and thank-you screens", "Import questions from pasted text, or draft with AI"] },
  { icon: GitBranch, title: "Conditional logic", items: ["Show questions based on earlier answers", "Skip to later sections or end the form", "Rules written in plain language", "Logic is validated before you can publish"] },
  { icon: QrCode, title: "Publishing & collection", items: ["Public link, QR code and embed code", "Close dates, response limits and one-response-per-device", "Optional sign-in requirement", "Spam protection: honeypot, timing checks and rate limiting"] },
  { icon: Inbox, title: "Response management", items: ["Paginated table and detailed response view", "Search, filter by date, answer and review status", "Flag suspicious responses and track reviews", "Bulk actions with confirmation"] },
  { icon: BarChart3, title: "Analytics", items: ["Charts chosen to suit each question type", "Means, medians, distributions and outliers", "Cross-tabulation with chi-square tests", "Group comparisons and filters"] },
  { icon: Bot, title: "AI Data Analyst", items: ["Natural-language questions about your data", "Summaries, executive briefs and recommendations", "Theme identification with platform-calculated counts", "Evidence panel and unverified-figure warnings"] },
  { icon: FileBarChart, title: "Reports", items: ["Survey summary, executive, research, comparative and AI-assisted reports", "Edit every section before exporting", "Printable layout and PDF export", "Results tables as CSV or Excel"] },
  { icon: Users, title: "Teams & workspaces", items: ["Multiple workspaces per person", "Owner, admin, editor, analyst and viewer roles", "Invitations, ownership transfer and activity log"] },
  { icon: ShieldCheck, title: "Security & privacy", items: ["Row-level security enforces tenant isolation in the database", "Secrets never reach the browser", "Data minimisation for AI processing", "Data export and account deletion requests"] },
  { icon: Download, title: "Exports", items: ["CSV with spreadsheet-formula protection", "Native Excel (.xlsx) workbooks", "Your personal data as JSON"] },
  { icon: LayoutTemplate, title: "Templates", items: ["20 templates across education, research, business and organisations", "Preview before using; customise everything"] },
  { icon: Lock, title: "Plans & usage", items: ["Configurable plans and limits", "Usage tracking for responses, AI credits and exports", "Payments via Paystack (cards & mobile money) when enabled"] },
];

export default function Features() {
  return (
    <MarketingLayout>
      <section className="container py-16 text-center">
        <h1 className="text-4xl font-semibold">Everything from question to decision</h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-ink-muted">A complete data collection and intelligence platform — not just a form builder.</p>
      </section>
      <section className="container grid gap-6 pb-20 md:grid-cols-2 lg:grid-cols-3">
        {GROUPS.map((g) => (
          <div key={g.title} className="rounded-2xl border border-line p-6">
            <g.icon className="h-6 w-6 text-brand" />
            <h2 className="mt-4 text-lg font-semibold">{g.title}</h2>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-ink-muted">{g.items.map((i) => <li key={i}>{i}</li>)}</ul>
          </div>
        ))}
      </section>
      <section className="bg-canvas py-16 text-center"><Button size="lg" asChild><Link to="/auth/sign-up">Start creating for free</Link></Button></section>
    </MarketingLayout>
  );
}
