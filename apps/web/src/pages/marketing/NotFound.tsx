import { Link } from "react-router-dom";
import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <MarketingLayout>
      <section className="container py-24 text-center">
        <p className="text-sm font-semibold text-brand">404</p>
        <h1 className="mt-2 text-3xl font-semibold">Page not found</h1>
        <p className="mt-3 text-ink-muted">The page you're looking for doesn't exist or has moved.</p>
        <Button className="mt-8" asChild><Link to="/">Go home</Link></Button>
      </section>
    </MarketingLayout>
  );
}
