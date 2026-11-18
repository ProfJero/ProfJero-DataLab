import { useState, type ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { Logo, LogoFull, Endorsement } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const LINKS = [["/features", "Features"], ["/templates", "Templates"], ["/pricing", "Pricing"], ["/about", "About"]] as const;

export function MarketingLayout({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen bg-white">
      <a href="#content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2">Skip to content</a>
      <header className="sticky top-0 z-30 border-b border-line/70 bg-white/85 backdrop-blur">
        <div className="container flex h-16 items-center gap-8">
          <Link to="/" aria-label="ProfJero DataLab home"><Logo /></Link>
          <nav className="hidden flex-1 gap-1 md:flex" aria-label="Main">
            {LINKS.map(([to, l]) => <NavLink key={to} to={to} className={({ isActive }) => cn("rounded-lg px-3 py-2 text-sm font-medium", isActive ? "text-brand" : "text-ink-muted hover:text-navy")}>{l}</NavLink>)}
          </nav>
          <div className="ml-auto hidden items-center gap-2 md:flex">
            {session ? <Button asChild><Link to="/app">Open DataLab</Link></Button> : <><Button variant="ghost" asChild><Link to="/auth/sign-in">Sign in</Link></Button><Button asChild><Link to="/auth/sign-up">Start for free</Link></Button></>}
          </div>
          <button className="ml-auto rounded-lg p-2 md:hidden" onClick={() => setOpen((o) => !o)} aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open}>{open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
        </div>
        {open && (
          <nav className="border-t border-line bg-white px-4 py-3 md:hidden" aria-label="Mobile">
            {LINKS.map(([to, l]) => <Link key={to} to={to} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2.5 font-medium text-navy hover:bg-slate-50">{l}</Link>)}
            <div className="mt-2 grid gap-2">{session ? <Button asChild><Link to="/app">Open DataLab</Link></Button> : <><Button variant="secondary" asChild><Link to="/auth/sign-in">Sign in</Link></Button><Button asChild><Link to="/auth/sign-up">Start for free</Link></Button></>}</div>
          </nav>
        )}
      </header>
      <main id="content">{children}</main>
      <footer className="border-t border-line bg-canvas">
        <div className="container grid gap-10 py-14 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div><LogoFull width={230} /><Endorsement className="mt-4 block" /></div>
          {[["Product", [["/features", "Features"], ["/templates", "Templates"], ["/pricing", "Pricing"]]], ["Company", [["/about", "About"], ["/contact", "Contact"]]], ["Legal", [["/privacy", "Privacy policy"], ["/terms", "Terms of service"]]]].map(([h, items]) => (
            <div key={h as string}><p className="text-sm font-semibold text-navy">{h as string}</p><ul className="mt-3 space-y-2">{(items as string[][]).map(([to, l]) => <li key={to}><Link to={to} className="text-sm text-ink-muted hover:text-navy">{l}</Link></li>)}</ul></div>
          ))}
        </div>
        <div className="border-t border-line"><div className="container flex flex-col gap-2 py-5 text-xs text-ink-muted sm:flex-row sm:justify-between"><span>© {new Date().getFullYear()} ProfJero Digital Studio. All rights reserved.</span><span>This site uses only essential cookies/storage needed to keep you signed in.</span></div></div>
      </footer>
    </div>
  );
}
