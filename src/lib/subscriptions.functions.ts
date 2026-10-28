import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  computeEffectiveStatus,
  daysLeft,
  isOperational,
  STATUS_LABELS,
  type SubscriptionStatus,
} from "@/lib/entitlements";

export interface MySubscription {
  /** null when the organization has no subscription row at all */
  hasSubscription: boolean;
  planSlug: string | null;
  planName: string | null;
  status: SubscriptionStatus | null;
  statusLabel: string | null;
  expiresAt: string | null;
  daysLeft: number | null;
  operational: boolean;
  suspended: boolean;
  isPlatformAdmin: boolean;
}

/**
 * Subscription + suspension state for the caller's organization.
 * Latest subscription row wins (renewals insert new rows).
 */
export const getMySubscription = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MySubscription> => {
    const { data: me } = await context.supabase
      .from("profiles")
      .select("org_id")
      .eq("id", context.userId)
      .maybeSingle();

    const { data: isAdmin } = await context.supabase
      .rpc("has_platform_admin")
      .maybeSingle();

    const base: MySubscription = {
      hasSubscription: false,
      planSlug: null,
      planName: null,
      status: null,
      statusLabel: null,
      expiresAt: null,
      daysLeft: null,
      operational: true,
      suspended: false,
      isPlatformAdmin: isAdmin === true,
    };

    if (!me?.org_id) return base;

    const { data: org } = await context.supabase
      .from("organizations")
      .select("is_suspended")
      .eq("id", me.org_id)
      .maybeSingle();

    const { data: sub } = await context.supabase
      .from("subscriptions")
      .select("status, expires_at, subscription_plans(slug, name)")
      .eq("org_id", me.org_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!sub) {
      return { ...base, suspended: org?.is_suspended === true, operational: org?.is_suspended !== true };
    }

    const status = computeEffectiveStatus({
      status: sub.status as SubscriptionStatus,
      expiresAt: sub.expires_at,
    });
    const plan = (sub.subscription_plans ?? null) as { slug: string; name: string } | null;
    const suspended = org?.is_suspended === true;

    return {
      hasSubscription: true,
      planSlug: plan?.slug ?? null,
      planName: plan?.name ?? null,
      status,
      statusLabel: STATUS_LABELS[status],
      expiresAt: sub.expires_at,
      daysLeft: daysLeft(sub.expires_at),
      operational: !suspended && isOperational({ status: sub.status as SubscriptionStatus, expiresAt: sub.expires_at }),
      suspended,
      isPlatformAdmin: isAdmin === true,
    };
  });
