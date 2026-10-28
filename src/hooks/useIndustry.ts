import type { CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyIndustry } from "@/lib/industries.functions";
import { useAuth } from "@/hooks/useAuth";

/** The caller's organization industry (theme, POS mode, features). */
export function useIndustry() {
  const { profile } = useAuth();
  const fetchIndustry = useServerFn(getMyIndustry);
  return useQuery({
    queryKey: ["my-industry", profile?.org_id],
    enabled: Boolean(profile?.org_id),
    staleTime: 300_000,
    queryFn: () => fetchIndustry(),
  });
}

/** CSS custom properties consumed by the industry tokens in styles.css. */
export function industryStyle(theme?: { primary?: string; accent?: string }): CSSProperties {
  if (!theme?.primary) return {};
  return {
    ["--industry" as string]: theme.primary,
    ["--industry-accent" as string]: theme.accent ?? theme.primary,
  } as CSSProperties;
}
