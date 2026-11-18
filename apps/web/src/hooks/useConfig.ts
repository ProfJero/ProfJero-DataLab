import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface PlatformConfig {
  ai: { configured: boolean; provider: string | null };
  uploads: { configured: boolean };
  email: { configured: boolean };
  payments: { configured: boolean; provider: string };
}

/** Which server-side integrations are configured (so the UI never pretends a feature works). */
export function usePlatformConfig() {
  return useQuery({ queryKey: ["platform-config"], queryFn: () => api<PlatformConfig>("/config"), staleTime: 5 * 60_000 });
}
