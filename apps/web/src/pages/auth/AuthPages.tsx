import { forwardRef, useEffect, useState, type ReactNode } from "react";
import { Link, Navigate, Route, Routes, useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { BarChart3, CheckCircle2, Eye, EyeOff, MailCheck, ShieldAlert, Sparkles } from "lucide-react";
import { LogoFull, Endorsement } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/misc";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { APP_URL } from "@/lib/utils";

function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/app";
}

function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.05fr]">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <Link to="/" className="w-fit"><LogoFull width={210} /></Link>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <h1 className="text-2xl font-semibold">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-ink-muted">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-6 text-center text-sm text-ink-muted">{footer}</div>}
        </div>
        <Endorsement />
      </div>
      <div className="relative hidden overflow-hidden bg-navy lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(40,100,197,.45),transparent_55%)]" />
        <div className="relative flex h-full flex-col justify-center px-16 text-white">
          <p className="text-sm font-medium uppercase tracking-widest text-brand-200">Create. Collect. Analyse. Understand.</p>
          <h2 className="mt-4 max-w-md text-4xl font-semibold leading-tight text-white">From a question to a decision — in one place.</h2>
          <ul className="mt-10 space-y-5 text-slate-300">
            {[
              [CheckCircle2, "Build beautiful, mobile-first forms with logic"],
              [BarChart3, "See verified statistics the moment responses arrive"],
              [Sparkles, "Ask the AI Data Analyst questions about your data"],
            ].map(([Icon, text], i) => {
              const I = Icon as typeof Sparkles;
              return (
                <li key={i} className="flex items-center gap-3">
                  <span className="rounded-lg bg-white/10 p-2"><I className="h-5 w-5 text-insight-100" /></span>
                  {text as string}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}

const PasswordInput = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { describedBy?: string; invalid?: boolean }>(function PasswordInput({ id, describedBy, invalid, ...rest }, ref) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input ref={ref} id={id} type={show ? "text" : "password"} aria-describedby={describedBy} aria-invalid={invalid} className="pr-10" {...rest} />
      <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-ink-muted hover:text-navy" aria-label={show ? "Hide password" : "Show password"}>
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
});

const passwordRule = z.string().min(8, "Use at least 8 characters.").max(72).regex(/[A-Za-z]/, "Include a letter.").regex(/\d/, "Include a number.");

function SignIn() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const schema = z.object({ email: z.string().email("Enter a valid email."), password: z.string().min(1, "Enter your password.") });
  const f = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to your DataLab workspace." footer={<>New to DataLab? <Link className="font-medium text-brand" to={`/auth/sign-up${params.get("next") ? `?next=${encodeURIComponent(params.get("next")!)}` : ""}`}>Create a free account</Link></>}>
      <form
        className="space-y-4"
        noValidate
        onSubmit={f.handleSubmit(async (v) => {
          setError(null);
          const { error } = await supabase.auth.signInWithPassword(v);
          if (error) return setError(/confirm/i.test(error.message) ? "Please verify your email address first — check your inbox for the confirmation link." : "Incorrect email or password.");
          nav(safeNext(params.get("next")), { replace: true });
        })}
      >
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <Field label="Email" error={f.formState.errors.email?.message}>{(id, d) => <Input id={id} type="email" autoComplete="email" aria-describedby={d} aria-invalid={!!f.formState.errors.email} {...f.register("email")} />}</Field>
        <Field label="Password" error={f.formState.errors.password?.message}>
          {(id, d) => <PasswordInput id={id} autoComplete="current-password" describedBy={d} invalid={!!f.formState.errors.password} {...f.register("password")} />}
        </Field>
        <div className="-mt-2 text-right"><Link to="/auth/forgot" className="text-sm text-brand">Forgot password?</Link></div>
        <Button type="submit" className="w-full" size="lg" loading={f.formState.isSubmitting}>Sign in</Button>
      </form>
    </AuthLayout>
  );
}

function SignUp() {
  const [params] = useSearchParams();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const nav = useNavigate();
  const schema = z.object({ fullName: z.string().trim().min(2, "Enter your name.").max(200), email: z.string().email("Enter a valid email."), password: passwordRule, terms: z.literal(true, { errorMap: () => ({ message: "You must accept the terms to continue." }) }) });
  const f = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  if (sentTo)
    return (
      <AuthLayout title="Check your email" subtitle={<>We sent a confirmation link to <strong>{sentTo}</strong>. Open it to verify your account, then sign in.</>} footer={<Link className="font-medium text-brand" to="/auth/sign-in">Back to sign in</Link>}>
        <div className="flex items-center gap-3 rounded-xl bg-insight-50 p-4 text-sm text-insight-700"><MailCheck className="h-5 w-5" /> Didn't get it? Check spam, or try signing up again in a few minutes.</div>
      </AuthLayout>
    );
  return (
    <AuthLayout title="Create your account" subtitle="Start creating for free. No credit card required." footer={<>Already have an account? <Link className="font-medium text-brand" to="/auth/sign-in">Sign in</Link></>}>
      <form
        className="space-y-4"
        noValidate
        onSubmit={f.handleSubmit(async (v) => {
          setError(null);
          const next = safeNext(params.get("next"));
          const { data, error } = await supabase.auth.signUp({ email: v.email, password: v.password, options: { data: { full_name: v.fullName }, emailRedirectTo: `${APP_URL}/auth/callback?next=${encodeURIComponent(next)}` } });
          if (error) return setError(/registered|exists/i.test(error.message) ? "An account with this email already exists. Try signing in." : error.message);
          if (data.session) nav(next === "/app" ? "/app/onboarding" : next, { replace: true });
          else setSentTo(v.email);
        })}
      >
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <Field label="Full name" error={f.formState.errors.fullName?.message}>{(id, d) => <Input id={id} autoComplete="name" aria-describedby={d} aria-invalid={!!f.formState.errors.fullName} {...f.register("fullName")} />}</Field>
        <Field label="Work email" error={f.formState.errors.email?.message}>{(id, d) => <Input id={id} type="email" autoComplete="email" aria-describedby={d} aria-invalid={!!f.formState.errors.email} {...f.register("email")} />}</Field>
        <Field label="Password" hint="At least 8 characters with a letter and a number." error={f.formState.errors.password?.message}>
          {(id, d) => <PasswordInput id={id} autoComplete="new-password" describedBy={d} invalid={!!f.formState.errors.password} {...f.register("password")} />}
        </Field>
        <label className="flex items-start gap-2 text-sm text-ink-muted">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand" {...f.register("terms")} />
          <span>I agree to the <Link to="/terms" target="_blank" className="text-brand underline">Terms of Service</Link> and <Link to="/privacy" target="_blank" className="text-brand underline">Privacy Policy</Link>.</span>
        </label>
        {f.formState.errors.terms && <p role="alert" className="text-xs font-medium text-red-600">{f.formState.errors.terms.message}</p>}
        <Button type="submit" className="w-full" size="lg" loading={f.formState.isSubmitting}>Create account</Button>
      </form>
    </AuthLayout>
  );
}

function Forgot() {
  const [sent, setSent] = useState(false);
  const schema = z.object({ email: z.string().email("Enter a valid email.") });
  const f = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  return (
    <AuthLayout title="Reset your password" subtitle="Enter your email and we'll send you a reset link." footer={<Link className="font-medium text-brand" to="/auth/sign-in">Back to sign in</Link>}>
      {sent ? (
        <div className="rounded-xl bg-insight-50 p-4 text-sm text-insight-700">If an account exists for that email, a reset link is on its way.</div>
      ) : (
        <form
          className="space-y-4"
          noValidate
          onSubmit={f.handleSubmit(async (v) => {
            await supabase.auth.resetPasswordForEmail(v.email, { redirectTo: `${APP_URL}/auth/reset` });
            setSent(true); // Same message either way, so accounts can't be enumerated.
          })}
        >
          <Field label="Email" error={f.formState.errors.email?.message}>{(id, d) => <Input id={id} type="email" autoComplete="email" aria-describedby={d} {...f.register("email")} />}</Field>
          <Button type="submit" className="w-full" size="lg" loading={f.formState.isSubmitting}>Send reset link</Button>
        </form>
      )}
    </AuthLayout>
  );
}

function Reset() {
  const nav = useNavigate();
  const { session, loading } = useAuth();
  const schema = z.object({ password: passwordRule, confirm: z.string() }).refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords don't match." });
  const f = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  if (loading) return <Spinner className="min-h-screen" />;
  if (!session)
    return (
      <AuthLayout title="Link expired" subtitle="This password reset link is invalid or has expired." footer={<Link className="font-medium text-brand" to="/auth/forgot">Request a new link</Link>}>
        <span />
      </AuthLayout>
    );
  return (
    <AuthLayout title="Choose a new password">
      <form
        className="space-y-4"
        noValidate
        onSubmit={f.handleSubmit(async (v) => {
          const { error } = await supabase.auth.updateUser({ password: v.password });
          if (error) return toast.error(error.message);
          toast.success("Password updated.");
          nav("/app", { replace: true });
        })}
      >
        <Field label="New password" error={f.formState.errors.password?.message}>{(id, d) => <PasswordInput id={id} autoComplete="new-password" describedBy={d} {...f.register("password")} />}</Field>
        <Field label="Confirm password" error={f.formState.errors.confirm?.message}>{(id, d) => <PasswordInput id={id} autoComplete="new-password" describedBy={d} {...f.register("confirm")} />}</Field>
        <Button type="submit" className="w-full" size="lg" loading={f.formState.isSubmitting}>Update password</Button>
      </form>
    </AuthLayout>
  );
}

/** Handles email verification / magic-link redirects (PKCE code exchange). */
function Callback() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [error, setError] = useState<string | null>(params.get("error_description"));
  useEffect(() => {
    if (error) return;
    const code = params.get("code");
    (async () => {
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) return setError("This verification link is invalid or has expired.");
      }
      const { data } = await supabase.auth.getSession();
      if (data.session) nav(safeNext(params.get("next")), { replace: true });
      else setError("Your email is verified. Please sign in to continue.");
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!error) return <Spinner className="min-h-screen" label="Verifying" />;
  return (
    <AuthLayout title="Email verification" subtitle={error} footer={<Link className="font-medium text-brand" to="/auth/sign-in">Go to sign in</Link>}>
      <span />
    </AuthLayout>
  );
}

function Suspended() {
  const { signOut } = useAuth();
  return (
    <AuthLayout title="Account suspended" subtitle="Your account has been suspended by the platform administrator. If you believe this is a mistake, please contact support.">
      <div className="flex items-center gap-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-800"><ShieldAlert className="h-5 w-5" /> You can't access workspaces while suspended.</div>
      <Button variant="secondary" className="mt-6 w-full" onClick={() => signOut()}>Sign out</Button>
    </AuthLayout>
  );
}

export default function AuthPages() {
  const { session, loading } = useAuth();
  return (
    <Routes>
      <Route path="sign-in" element={!loading && session ? <Navigate to="/app" replace /> : <SignIn />} />
      <Route path="sign-up" element={!loading && session ? <Navigate to="/app" replace /> : <SignUp />} />
      <Route path="forgot" element={<Forgot />} />
      <Route path="reset" element={<Reset />} />
      <Route path="callback" element={<Callback />} />
      <Route path="suspended" element={<Suspended />} />
      <Route path="*" element={<Navigate to="/auth/sign-in" replace />} />
    </Routes>
  );
}
