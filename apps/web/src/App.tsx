import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import { WorkspaceProvider, useWorkspace } from "./hooks/useWorkspace";
import { AppShell } from "./components/layout/AppShell";
import { Spinner } from "./components/ui/misc";

const Landing = lazy(() => import("./pages/marketing/Landing"));
const Features = lazy(() => import("./pages/marketing/Features"));
const Pricing = lazy(() => import("./pages/marketing/Pricing"));
const About = lazy(() => import("./pages/marketing/About"));
const Contact = lazy(() => import("./pages/marketing/Contact"));
const Legal = lazy(() => import("./pages/marketing/Legal"));
const PublicTemplates = lazy(() => import("./pages/marketing/PublicTemplates"));
const NotFound = lazy(() => import("./pages/marketing/NotFound"));
const AuthPages = lazy(() => import("./pages/auth/AuthPages"));
const PublicForm = lazy(() => import("./pages/public/PublicForm"));
const Invite = lazy(() => import("./pages/app/Invite"));
const Onboarding = lazy(() => import("./pages/app/Onboarding"));
const Dashboard = lazy(() => import("./pages/app/Dashboard"));
const FormsList = lazy(() => import("./pages/app/FormsList"));
const NewForm = lazy(() => import("./pages/app/NewForm"));
const Builder = lazy(() => import("./pages/app/builder/Builder"));
const FormPreview = lazy(() => import("./pages/app/FormPreview"));
const FormLayout = lazy(() => import("./pages/app/FormLayout"));
const FormShare = lazy(() => import("./pages/app/FormShare"));
const Responses = lazy(() => import("./pages/app/Responses"));
const Analytics = lazy(() => import("./pages/app/Analytics"));
const AIAnalyst = lazy(() => import("./pages/app/AIAnalyst"));
const Templates = lazy(() => import("./pages/app/Templates"));
const Reports = lazy(() => import("./pages/app/Reports"));
const ReportEditor = lazy(() => import("./pages/app/ReportEditor"));
const WorkspaceSettings = lazy(() => import("./pages/app/settings/WorkspaceSettings"));
const Members = lazy(() => import("./pages/app/settings/Members"));
const Billing = lazy(() => import("./pages/app/settings/Billing"));
const Account = lazy(() => import("./pages/app/Account"));
const NewWorkspace = lazy(() => import("./pages/app/NewWorkspace"));
const Admin = lazy(() => import("./pages/admin/Admin"));

const Loading = () => <Spinner className="min-h-[50vh]" />;

function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading, profile } = useAuth();
  const loc = useLocation();
  if (loading) return <Loading />;
  if (!session) return <Navigate to={`/auth/sign-in?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (profile?.account_status === "suspended") return <Navigate to="/auth/suspended" replace />;
  return <>{children}</>;
}

/** Sends new users through onboarding until they have a workspace. */
function RequireWorkspace() {
  const { profile } = useAuth();
  const { current, loading } = useWorkspace();
  if (loading) return <Loading />;
  if (!current || !profile?.onboarded_at) return <Navigate to="/app/onboarding" replace />;
  return <Outlet />;
}

function RequirePlatformAdmin({ children }: { children: ReactNode }) {
  const { isPlatformAdmin, loading } = useAuth();
  if (loading) return <Loading />;
  // UI guard only — every admin operation is authorised again in the database.
  if (!isPlatformAdmin) return <Navigate to="/app" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/features" element={<Features />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/about" element={<About />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/privacy" element={<Legal doc="privacy" />} />
        <Route path="/terms" element={<Legal doc="terms" />} />
        <Route path="/templates" element={<PublicTemplates />} />
        <Route path="/auth/*" element={<AuthPages />} />
        <Route path="/f/:slug" element={<PublicForm />} />
        <Route path="/invite/:token" element={<RequireAuth><Invite /></RequireAuth>} />

        <Route path="/app" element={<RequireAuth><WorkspaceProvider><Outlet /></WorkspaceProvider></RequireAuth>}>
          <Route path="onboarding" element={<Onboarding />} />
          <Route element={<RequireWorkspace />}>
            <Route path="forms/:id/edit" element={<Builder />} />
            <Route path="forms/:id/preview" element={<FormPreview />} />
            <Route element={<AppShell />}>
              <Route index element={<Dashboard />} />
              <Route path="forms" element={<FormsList />} />
              <Route path="forms/new" element={<NewForm />} />
              <Route path="forms/:id" element={<FormLayout />}>
                <Route index element={<Navigate to="responses" replace />} />
                <Route path="share" element={<FormShare />} />
                <Route path="responses" element={<Responses />} />
                <Route path="analytics" element={<Analytics />} />
                <Route path="ai" element={<AIAnalyst />} />
              </Route>
              <Route path="templates" element={<Templates />} />
              <Route path="reports" element={<Reports />} />
              <Route path="reports/:id" element={<ReportEditor />} />
              <Route path="settings" element={<WorkspaceSettings />} />
              <Route path="settings/members" element={<Members />} />
              <Route path="settings/billing" element={<Billing />} />
              <Route path="account" element={<Account />} />
              <Route path="workspaces/new" element={<NewWorkspace />} />
            </Route>
          </Route>
        </Route>
        <Route path="/admin/*" element={<RequireAuth><RequirePlatformAdmin><WorkspaceProvider><Admin /></WorkspaceProvider></RequirePlatformAdmin></RequireAuth>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
