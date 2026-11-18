import { useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import * as Popover from "@radix-ui/react-popover";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Building2, Check, ChevronsUpDown, CreditCard, FileBarChart, FileText, LayoutDashboard, LayoutTemplate, LogOut, Menu as MenuIcon, Plus, Settings, Shield, User, Users, X } from "lucide-react";
import { Logo, Endorsement } from "@/components/brand/Logo";
import { Avatar, Badge, Progress } from "@/components/ui/misc";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { supabase } from "@/lib/supabase";
import { cn, fmtNumber, timeAgo } from "@/lib/utils";

const NAV = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/app/forms", label: "Forms & surveys", icon: FileText },
  { to: "/app/templates", label: "Templates", icon: LayoutTemplate },
  { to: "/app/reports", label: "Reports", icon: FileBarChart },
];
const SETTINGS_NAV = [
  { to: "/app/settings", label: "Workspace", icon: Settings, end: true },
  { to: "/app/settings/members", label: "Team", icon: Users },
  { to: "/app/settings/billing", label: "Plan & usage", icon: CreditCard },
];

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  const { isPlatformAdmin } = useAuth();
  const link = (item: { to: string; label: string; icon: typeof FileText; end?: boolean }) => (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) => cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors", isActive ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white")}
    >
      <item.icon className="h-[18px] w-[18px]" aria-hidden />
      {item.label}
    </NavLink>
  );
  return (
    <nav className="space-y-6" aria-label="Main">
      <div className="space-y-1">{NAV.map(link)}</div>
      <div>
        <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Settings</p>
        <div className="space-y-1">{SETTINGS_NAV.map(link)}</div>
      </div>
      {isPlatformAdmin && (
        <div>
          <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Platform</p>
          {link({ to: "/admin", label: "Administration", icon: Shield })}
        </div>
      )}
    </nav>
  );
}

function WorkspaceSwitcher() {
  const { workspaces, current, switchTo } = useWorkspace();
  const nav = useNavigate();
  if (!current) return null;
  return (
    <Menu>
      <MenuTrigger className="flex w-full items-center gap-3 rounded-xl bg-white/5 p-2.5 text-left hover:bg-white/10">
        {current.logo_url ? <img src={current.logo_url} alt="" className="h-8 w-8 rounded-lg object-cover" /> : <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-sm font-semibold text-white">{current.name[0]?.toUpperCase()}</span>}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-white">{current.name}</span>
          <span className="block text-xs capitalize text-slate-400">{current.role}{current.is_demo ? " · sample data" : ""}</span>
        </span>
        <ChevronsUpDown className="h-4 w-4 text-slate-400" aria-hidden />
      </MenuTrigger>
      <MenuContent align="start" className="w-64">
        <MenuLabel>Workspaces</MenuLabel>
        {workspaces.map((w) => (
          <MenuItem key={w.id} onSelect={() => { switchTo(w.id); nav("/app"); }}>
            <Building2 />
            <span className="flex-1 truncate">{w.name}</span>
            {w.id === current.id && <Check className="text-brand" />}
          </MenuItem>
        ))}
        <MenuSeparator />
        <MenuItem onSelect={() => nav("/app/workspaces/new")}><Plus /> New workspace</MenuItem>
      </MenuContent>
    </Menu>
  );
}

function UsageMeter() {
  const { entitlements } = useWorkspace();
  if (!entitlements) return null;
  const lim = entitlements.limits.responses_per_month;
  const used = entitlements.usage.responses_per_month ?? 0;
  return (
    <Link to="/app/settings/billing" className="block rounded-xl bg-white/5 p-3 hover:bg-white/10">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-white">{entitlements.plan_name} plan</span>
        {entitlements.plan_code === "free" && <span className="font-medium text-brand-200">Upgrade</span>}
      </div>
      {lim ? (
        <>
          <Progress value={(used / lim) * 100} className="mt-2 bg-white/10" tone={used / lim > 0.9 ? "amber" : "green"} />
          <p className="mt-1.5 text-[11px] text-slate-400">{fmtNumber(used)} / {fmtNumber(lim)} responses this month</p>
        </>
      ) : (
        <p className="mt-1 text-[11px] text-slate-400">{fmtNumber(used)} responses this month</p>
      )}
    </Link>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col gap-6 bg-navy px-3 py-5">
      <Link to="/app" className="px-2" onClick={onNavigate}><Logo light /></Link>
      <WorkspaceSwitcher />
      <div className="flex-1 overflow-y-auto"><NavItems onNavigate={onNavigate} /></div>
      <UsageMeter />
      <Endorsement light className="px-2" />
    </div>
  );
}

interface Notification { id: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string }

function Notifications() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const nav = useNavigate();
  const q = useQuery({
    queryKey: ["notifications", user?.id],
    enabled: !!user,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("notifications").select("id,title,body,link,read_at,created_at").order("created_at", { ascending: false }).limit(20);
      if (error) throw error;
      return data as Notification[];
    },
  });
  const markAll = useMutation({
    mutationFn: async () => {
      await supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const unread = (q.data ?? []).filter((n) => !n.read_at).length;
  return (
    <Popover.Root>
      <Popover.Trigger className="relative rounded-lg p-2 text-ink-muted hover:bg-slate-100" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}>
        <Bell className="h-5 w-5" />
        {unread > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">{unread > 9 ? "9+" : unread}</span>}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={8} className="z-50 w-[min(380px,calc(100vw-2rem))] rounded-xl border border-line bg-white shadow-pop">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-sm font-semibold text-navy">Notifications</p>
            {unread > 0 && <button className="text-xs font-medium text-brand" onClick={() => markAll.mutate()}>Mark all as read</button>}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {(q.data ?? []).length === 0 && <p className="px-4 py-8 text-center text-sm text-ink-muted">You're all caught up.</p>}
            {(q.data ?? []).map((n) => (
              <button
                key={n.id}
                className={cn("block w-full border-b border-line px-4 py-3 text-left last:border-0 hover:bg-slate-50", !n.read_at && "bg-brand-50/40")}
                onClick={async () => {
                  if (!n.read_at) await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", n.id);
                  qc.invalidateQueries({ queryKey: ["notifications"] });
                  if (n.link) nav(n.link);
                }}
              >
                <p className="text-sm font-medium text-navy">{n.title}</p>
                {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-ink-muted">{n.body}</p>}
                <p className="mt-1 text-[11px] text-ink-subtle">{timeAgo(n.created_at)}</p>
              </button>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function UserMenu() {
  const { profile, user, signOut } = useAuth();
  const nav = useNavigate();
  return (
    <Menu>
      <MenuTrigger className="flex items-center gap-2 rounded-full p-0.5 hover:ring-2 hover:ring-brand-100" aria-label="Account menu">
        <Avatar name={profile?.full_name} email={user?.email} url={profile?.avatar_url} size={34} />
      </MenuTrigger>
      <MenuContent>
        <div className="px-2.5 py-2">
          <p className="truncate text-sm font-semibold text-navy">{profile?.full_name || "Your account"}</p>
          <p className="truncate text-xs text-ink-muted">{user?.email}</p>
        </div>
        <MenuSeparator />
        <MenuItem onSelect={() => nav("/app/account")}><User /> Account & privacy</MenuItem>
        <MenuItem onSelect={() => nav("/app/settings")}><Settings /> Workspace settings</MenuItem>
        <MenuSeparator />
        <MenuItem onSelect={async () => { await signOut(); nav("/"); }}><LogOut /> Sign out</MenuItem>
      </MenuContent>
    </Menu>
  );
}

export function AppShell({ children }: { children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { current } = useWorkspace();
  return (
    <div className="min-h-screen lg:pl-64">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2">Skip to content</a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block"><Sidebar /></aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-navy/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 animate-fade-in">
            <Sidebar onNavigate={() => setOpen(false)} />
            <button className="absolute right-3 top-4 rounded-lg p-2 text-slate-300 hover:bg-white/10" onClick={() => setOpen(false)} aria-label="Close navigation"><X className="h-5 w-5" /></button>
          </div>
        </div>
      )}
      <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-white/85 px-4 backdrop-blur sm:px-6">
        <button className="rounded-lg p-2 text-navy hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Open navigation"><MenuIcon className="h-5 w-5" /></button>
        <div className="lg:hidden"><Logo compact /></div>
        <div className="min-w-0 flex-1">{current?.is_demo && <Badge tone="amber">Demonstration workspace — sample data</Badge>}</div>
        <Notifications />
        <UserMenu />
      </header>
      <main id="main" className="mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-6 lg:py-8">{children ?? <Outlet />}</main>
    </div>
  );
}
