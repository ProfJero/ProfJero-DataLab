import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  intended_use: string | null;
  organisation_type: string | null;
  onboarded_at: string | null;
  default_workspace_id: string | null;
  account_status: "active" | "suspended";
  deletion_requested_at: string | null;
  ai_processing_consent: boolean;
}

interface AuthCtx {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isPlatformAdmin: boolean;
  loading: boolean;
  refreshProfile: () => void;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (!s) qc.clear();
    });
    return () => sub.subscription.unsubscribe();
  }, [qc]);

  const uid = session?.user.id;
  const profile = useQuery({
    queryKey: ["profile", uid],
    enabled: !!uid,
    queryFn: async () => {
      const [{ data, error }, admin] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", uid!).single(),
        supabase.from("platform_admins").select("user_id").eq("user_id", uid!).maybeSingle(),
      ]);
      if (error) throw error;
      return { profile: data as Profile, isAdmin: !!admin.data };
    },
  });

  return (
    <Ctx.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile: profile.data?.profile ?? null,
        isPlatformAdmin: profile.data?.isAdmin ?? false,
        loading: !ready || (!!uid && profile.isLoading),
        refreshProfile: () => qc.invalidateQueries({ queryKey: ["profile", uid] }),
        signOut: async () => {
          await supabase.auth.signOut();
          qc.clear();
        },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth outside AuthProvider");
  return c;
}
