import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { can, type Entitlements, type FeatureKey, type Permission, type WorkspaceRole } from "@datalab/shared";
import { rpc, supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  ai_enabled: boolean;
  is_demo: boolean;
  owner_id: string;
  data_retention_days: number | null;
  role: WorkspaceRole;
}

interface WsCtx {
  workspaces: Workspace[];
  current: Workspace | null;
  role: WorkspaceRole | null;
  entitlements: Entitlements | null;
  loading: boolean;
  switchTo: (id: string) => void;
  can: (p: Permission) => boolean;
  has: (f: FeatureKey) => boolean;
  refresh: () => void;
}

const Ctx = createContext<WsCtx | null>(null);
const STORAGE_KEY = "datalab.workspace";

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });

  const list = useQuery({
    queryKey: ["workspaces", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("workspace_members").select("role, workspaces(id, name, slug, logo_url, ai_enabled, is_demo, owner_id, data_retention_days)").eq("user_id", user!.id);
      if (error) throw error;
      return (data ?? []).filter((r) => r.workspaces).map((r) => ({ ...(r.workspaces as unknown as Omit<Workspace, "role">), role: r.role as WorkspaceRole }));
    },
  });

  const workspaces = list.data ?? [];
  const current = useMemo(() => workspaces.find((w) => w.id === selected) ?? workspaces.find((w) => w.id === profile?.default_workspace_id) ?? workspaces[0] ?? null, [workspaces, selected, profile]);

  useEffect(() => {
    if (current) {
      try {
        localStorage.setItem(STORAGE_KEY, current.id);
      } catch {
        /* storage unavailable */
      }
    }
  }, [current]);

  const ent = useQuery({
    queryKey: ["entitlements", current?.id],
    enabled: !!current,
    queryFn: () => rpc<Entitlements>("workspace_entitlements", { p_workspace_id: current!.id }),
  });

  const value: WsCtx = {
    workspaces,
    current,
    role: current?.role ?? null,
    entitlements: ent.data ?? null,
    loading: list.isLoading,
    switchTo: (id) => {
      setSelected(id);
      qc.invalidateQueries();
    },
    can: (p) => can(current?.role, p),
    has: (f) => !!ent.data?.features?.[f],
    refresh: () => {
      qc.invalidateQueries({ queryKey: ["workspaces"] });
      qc.invalidateQueries({ queryKey: ["entitlements"] });
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspace() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useWorkspace outside WorkspaceProvider");
  return c;
}

/** Workspace id that is guaranteed after the shell has loaded. */
export function useWorkspaceId(): string {
  const { current } = useWorkspace();
  if (!current) throw new Error("No workspace selected");
  return current.id;
}
