import { useQuery } from "@tanstack/react-query";
import { Mail } from "lucide-react";
import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { supabase } from "@/lib/supabase";

export default function Contact() {
  const q = useQuery({ queryKey: ["support-email"], queryFn: async () => (await supabase.from("platform_settings").select("value").eq("key", "support.email").maybeSingle()).data?.value as string | null });
  return (
    <MarketingLayout>
      <section className="container max-w-2xl py-16">
        <h1 className="text-4xl font-semibold">Contact us</h1>
        <p className="mt-4 text-lg text-ink-muted">Questions about DataLab, plans for your organisation, or data protection? We'd like to hear from you.</p>
        <div className="mt-8 rounded-2xl border border-line p-6">
          <Mail className="h-6 w-6 text-brand" />
          {q.data ? <p className="mt-3">Email us at <a className="font-medium text-brand underline" href={`mailto:${q.data}`}>{q.data}</a></p> : <p className="mt-3 text-ink-muted">Our support address will be published here shortly. Signed-in users can reach the team through their workspace owner or platform administrator.</p>}
          <p className="mt-4 text-sm text-ink-muted">To report a form that is being misused, use the “Report this form” link at the bottom of that form.</p>
        </div>
      </section>
    </MarketingLayout>
  );
}
