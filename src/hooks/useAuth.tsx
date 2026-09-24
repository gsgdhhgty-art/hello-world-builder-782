import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export interface Profile {
  id: string;
  org_id: string | null;
  full_name: string;
  username: string | null;
  phone: string | null;
  employee_code: string | null;
  role: string;
  custom_role_id: string | null;
  branch_id: string | null;
  avatar_url: string | null;
  is_active: boolean;
}

export interface Organization {
  id: string;
  name: string;
  currency: string;
  tax_rate: number;
  tax_enabled: boolean;
  business_type: string;
  address: string | null;
  phone: string | null;
  tax_number: string | null;
  low_stock_alerts_enabled: boolean;
  low_stock_include_out_of_stock: boolean;
  reorder_suggestion_multiplier: number;
  profit_calculation_method: "AVERAGE_COST";
}

interface AuthValue {
  session: Session | null;
  profile: Profile | null;
  org: Organization | null;
  permissions: Record<string, boolean>;
  loading: boolean;
  can: (perm: string) => boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [org, setOrg] = useState<Organization | null>(null);
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (uid: string | undefined) => {
    if (!uid) {
      setProfile(null);
      setOrg(null);
      setPermissions({});
      return;
    }
    const { data: prof } = await supabase
      .from("profiles")
      .select(
        "id, org_id, full_name, username, phone, employee_code, role, custom_role_id, branch_id, avatar_url, is_active",
      )
      .eq("id", uid)
      .maybeSingle();
    setProfile((prof as Profile | null) ?? null);

    if (prof?.org_id) {
      const [{ data: orgRow }, { data: perms }] = await Promise.all([
        supabase
          .from("organizations")
          .select(
            "id, name, currency, tax_rate, tax_enabled, business_type, address, phone, tax_number, low_stock_alerts_enabled, low_stock_include_out_of_stock, reorder_suggestion_multiplier, profit_calculation_method",
          )
          .eq("id", prof.org_id)
          .maybeSingle(),
        supabase.rpc("my_permissions"),
      ]);
      setOrg((orgRow as Organization | null) ?? null);
      setPermissions((perms as Record<string, boolean> | null) ?? {});
    } else {
      setOrg(null);
      setPermissions({});
    }
  }, []);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session ?? null);
      await load(data.session?.user.id);
      if (active) setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      setSession(s ?? null);
      void load(s?.user.id);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [load]);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    setSession(data.session ?? null);
    await load(data.session?.user.id);
  }, [load]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setOrg(null);
    setPermissions({});
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      session,
      profile,
      org,
      permissions,
      loading,
      can: (perm: string) => Boolean(permissions["*"] || permissions[perm]),
      refresh,
      signOut,
    }),
    [session, profile, org, permissions, loading, refresh, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
