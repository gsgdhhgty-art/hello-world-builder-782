import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getIndustryModule } from "@/industries/registry";

export interface IndustryRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string;
  theme: { primary?: string; accent?: string };
  features: string[];
  sortOrder: number;
}

/**
 * Public industry catalog (signup / onboarding screen).
 * Read through the publishable key with a narrow TO anon SELECT policy.
 */
export const listIndustries = createServerFn({ method: "GET" }).handler(async () => {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const supabasePublic = createClient<Database>(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
          h.delete("Authorization");
        }
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
  const { data, error } = await supabasePublic
    .from("industries")
    .select("id, slug, name, description, icon, theme, features, sort_order")
    .eq("is_active", true)
    .eq("is_public", true)
    .order("sort_order");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r): IndustryRow => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    description: r.description,
    icon: r.icon,
    theme: (r.theme ?? {}) as IndustryRow["theme"],
    features: r.features ?? [],
    sortOrder: r.sort_order,
  }));
});

export interface MyIndustry {
  slug: string | null;
  name: string;
  theme: { primary: string; accent: string };
  features: string[];
  posMode: string;
  weight: boolean;
}

/**
 * The industry of the caller's organization, resolved from the DB row and
 * merged with the code module (module wins for presentation metadata).
 */
export const getMyIndustry = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyIndustry> => {
    const { data: me } = await context.supabase
      .from("profiles")
      .select("org_id")
      .eq("id", context.userId)
      .maybeSingle();
    if (!me?.org_id) {
      return { slug: null, name: "بدون نشاط", theme: { primary: "#0E7490", accent: "#F59E0B" }, features: [], posMode: "retail", weight: false };
    }
    const { data: org } = await context.supabase
      .from("organizations")
      .select("industry_id, industries(slug, name, theme, features)")
      .eq("id", me.org_id)
      .maybeSingle();
    const ind = (org?.industries ?? null) as { slug: string; name: string; theme: unknown; features: string[] } | null;
    if (!ind) {
      const generic = getIndustryModule(null);
      return { slug: null, name: generic.name, theme: generic.theme, features: generic.features, posMode: generic.pos.mode, weight: generic.pos.weight };
    }
    const module = getIndustryModule(ind.slug);
    return {
      slug: ind.slug,
      name: ind.name,
      theme: module.theme,
      features: module.features,
      posMode: module.pos.mode,
      weight: module.pos.weight,
    };
  });
