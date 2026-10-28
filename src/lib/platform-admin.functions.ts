import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Platform (Super Admin) server functions.
 *
 * Authorization contract: every handler first verifies the caller through
 * public.has_platform_admin() with the caller's OWN RLS client. Only after
 * that verification passes is the privileged admin client loaded. The admin
 * client is never used to decide whether the caller is an admin.
 */
async function assertPlatformAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_platform_admin").maybeSingle();
  if (error) throw new Error("failed to verify platform admin");
  if (data !== true) throw new Error("forbidden: platform admin only");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function writePlatformAudit(
  admin: any,
  actorId: string,
  action: string,
  entity: string,
  entityId: string | null,
  details: Record<string, unknown>,
) {
  await admin.from("platform_audit_logs").insert({
    actor_id: actorId,
    action,
    entity,
    entity_id: entityId,
    details,
  });
}

// ---------------------------------------------------------------- overview

export const getPlatformOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await assertPlatformAdmin(context);
    const [orgs, subs, industries, plans] = await Promise.all([
      admin.from("organizations").select("id, created_at, is_suspended"),
      admin.from("subscriptions").select("status, expires_at, org_id").order("created_at", { ascending: false }),
      admin.from("industries").select("id, is_active"),
      admin.from("subscription_plans").select("id, is_active"),
    ]);
    const allSubs = subs.data ?? [];
    // latest subscription per org
    const latestByOrg = new Map<string, { status: string; expires_at: string }>();
    for (const s of allSubs) {
      if (!latestByOrg.has(s.org_id)) latestByOrg.set(s.org_id, { status: s.status, expires_at: s.expires_at });
    }
    const now = Date.now();
    let active = 0, trial = 0, expired = 0;
    for (const s of latestByOrg.values()) {
      const expiredNow = new Date(s.expires_at).getTime() <= now;
      if (s.status === "SUSPENDED" || s.status === "CANCELLED" || s.status === "PENDING_PAYMENT") continue;
      if (expiredNow) expired++;
      else if (s.status === "TRIAL") trial++;
      else active++;
    }
    const weekAgo = now - 7 * 86_400_000;
    return {
      organizations: orgs.data?.length ?? 0,
      suspendedOrgs: (orgs.data ?? []).filter((o) => o.is_suspended).length,
      newOrgsThisWeek: (orgs.data ?? []).filter((o) => new Date(o.created_at).getTime() >= weekAgo).length,
      activeSubscriptions: active,
      trialSubscriptions: trial,
      expiredSubscriptions: expired,
      industries: industries.data?.length ?? 0,
      plans: plans.data?.length ?? 0,
    };
  });

// ---------------------------------------------------------------- orgs

export const listAdminOrganizations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await assertPlatformAdmin(context);
    const { data: orgs } = await admin
      .from("organizations")
      .select("id, name, currency, is_suspended, created_at, industries(slug, name)")
      .order("created_at", { ascending: false });
    const { data: profiles } = await admin.from("profiles").select("org_id");
    const { data: subs } = await admin
      .from("subscriptions")
      .select("org_id, status, expires_at, subscription_plans(name)")
      .order("created_at", { ascending: false });
    const memberCount = new Map<string, number>();
    for (const p of profiles ?? []) {
      if (p.org_id) memberCount.set(p.org_id, (memberCount.get(p.org_id) ?? 0) + 1);
    }
    const latestSub = new Map<string, { status: string; expires_at: string; plan: string | null }>();
    for (const s of subs ?? []) {
      if (!latestSub.has(s.org_id)) {
        const plan = (s.subscription_plans ?? null) as { name: string } | null;
        latestSub.set(s.org_id, { status: s.status, expires_at: s.expires_at, plan: plan?.name ?? null });
      }
    }
    return (orgs ?? []).map((o) => {
      const ind = (o.industries ?? null) as { slug: string; name: string } | null;
      const sub = latestSub.get(o.id) ?? null;
      const expired = sub ? new Date(sub.expires_at).getTime() <= Date.now() : true;
      return {
        id: o.id,
        name: o.name,
        currency: o.currency,
        industry: ind?.name ?? "—",
        members: memberCount.get(o.id) ?? 0,
        suspended: o.is_suspended,
        plan: sub?.plan ?? null,
        status: sub ? (expired && (sub.status === "ACTIVE" || sub.status === "TRIAL") ? "EXPIRED" : sub.status) : null,
        expiresAt: sub?.expires_at ?? null,
        createdAt: o.created_at,
      };
    });
  });

const suspendSchema = z.object({
  orgId: z.string().uuid(),
  suspended: z.boolean(),
  reason: z.string().max(500).optional(),
});

export const setOrganizationSuspended = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => suspendSchema.parse(data))
  .handler(async ({ data, context }) => {
    const admin = await assertPlatformAdmin(context);
    const { error } = await admin
      .from("organizations")
      .update({ is_suspended: data.suspended })
      .eq("id", data.orgId);
    if (error) throw new Error(error.message);
    await writePlatformAudit(
      admin,
      context.userId,
      data.suspended ? "ORG_SUSPENDED" : "ORG_UNSUSPENDED",
      "organizations",
      data.orgId,
      { reason: data.reason ?? null },
    );
    return { ok: true };
  });

// ---------------------------------------------------------------- subscriptions

export const listAdminSubscriptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await assertPlatformAdmin(context);
    const { data } = await admin
      .from("subscriptions")
      .select("id, status, price, currency, started_at, expires_at, grant_reason, note, organizations(name), subscription_plans(slug, name)")
      .order("created_at", { ascending: false })
      .limit(200);
    return (data ?? []).map((s) => {
      const org = (s.organizations ?? null) as { name: string } | null;
      const plan = (s.subscription_plans ?? null) as { slug: string; name: string } | null;
      const expired = new Date(s.expires_at).getTime() <= Date.now();
      const status =
        expired && (s.status === "ACTIVE" || s.status === "TRIAL") ? "EXPIRED" : s.status;
      return {
        id: s.id,
        orgName: org?.name ?? "—",
        planSlug: plan?.slug ?? "—",
        planName: plan?.name ?? "—",
        status,
        price: Number(s.price),
        currency: s.currency,
        startedAt: s.started_at,
        expiresAt: s.expires_at,
        grantReason: s.grant_reason,
        note: s.note,
      };
    });
  });

const grantSchema = z.object({
  orgId: z.string().uuid(),
  planSlug: z.string().min(1),
  days: z.number().int().min(1).max(3650).optional(),
  status: z.enum(["TRIAL", "ACTIVE", "PENDING_PAYMENT"]).default("ACTIVE"),
  price: z.number().min(0).optional(),
  currency: z.string().length(3).optional(),
  reason: z.string().max(500).optional(),
  note: z.string().max(500).optional(),
});

/** Grant/extend a subscription by inserting a new row (renewals are append-only history). */
export const grantSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => grantSchema.parse(data))
  .handler(async ({ data, context }) => {
    const admin = await assertPlatformAdmin(context);
    const { data: plan, error: planError } = await admin
      .from("subscription_plans")
      .select("id, price, currency, duration_days")
      .eq("slug", data.planSlug)
      .eq("is_active", true)
      .maybeSingle();
    if (planError || !plan) throw new Error("plan not found or inactive");
    const days = data.days ?? plan.duration_days;
    const expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();
    const { data: inserted, error } = await admin
      .from("subscriptions")
      .insert({
        org_id: data.orgId,
        plan_id: plan.id,
        status: data.status,
        price: data.price ?? Number(plan.price),
        currency: data.currency ?? plan.currency,
        expires_at: expiresAt,
        granted_by: context.userId,
        grant_reason: data.reason ?? "منحة من إدارة المنصة",
        note: data.note ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await writePlatformAudit(admin, context.userId, "SUBSCRIPTION_GRANTED", "subscriptions", inserted.id, {
      orgId: data.orgId,
      planSlug: data.planSlug,
      days,
      status: data.status,
    });
    return { ok: true, expiresAt };
  });

const updateSubSchema = z.object({
  subscriptionId: z.string().uuid(),
  status: z.enum(["TRIAL", "ACTIVE", "EXPIRED", "SUSPENDED", "CANCELLED", "PENDING_PAYMENT"]),
  expiresAt: z.string().datetime().optional(),
  note: z.string().max(500).optional(),
});

export const updateSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => updateSubSchema.parse(data))
  .handler(async ({ data, context }) => {
    const admin = await assertPlatformAdmin(context);
    const patch: Record<string, unknown> = { status: data.status };
    if (data.expiresAt) patch.expires_at = data.expiresAt;
    if (data.note !== undefined) patch.note = data.note;
    const { error } = await admin.from("subscriptions").update(patch).eq("id", data.subscriptionId);
    if (error) throw new Error(error.message);
    await writePlatformAudit(admin, context.userId, "SUBSCRIPTION_UPDATED", "subscriptions", data.subscriptionId, patch);
    return { ok: true };
  });

// ---------------------------------------------------------------- plans

export const listAdminPlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await assertPlatformAdmin(context);
    const { data } = await admin
      .from("subscription_plans")
      .select("id, slug, name, description, price, currency, duration_days, max_branches, max_users, features, is_trial, is_active, is_public, sort_order")
      .order("sort_order");
    return data ?? [];
  });

const planSchema = z.object({
  id: z.string().uuid().optional(),
  slug: z.string().min(2).max(60).regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  price: z.number().min(0),
  currency: z.string().length(3),
  durationDays: z.number().int().min(1).max(3650),
  maxBranches: z.number().int().min(1).nullable().optional(),
  maxUsers: z.number().int().min(1).nullable().optional(),
  features: z.array(z.string().min(1)).default([]),
  isTrial: z.boolean().default(false),
  isActive: z.boolean().default(true),
  isPublic: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

export const upsertPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => planSchema.parse(data))
  .handler(async ({ data, context }) => {
    const admin = await assertPlatformAdmin(context);
    const row = {
      slug: data.slug,
      name: data.name,
      description: data.description ?? null,
      price: data.price,
      currency: data.currency,
      duration_days: data.durationDays,
      max_branches: data.maxBranches ?? null,
      max_users: data.maxUsers ?? null,
      features: data.features,
      is_trial: data.isTrial,
      is_active: data.isActive,
      is_public: data.isPublic,
      sort_order: data.sortOrder,
    };
    const { error } = data.id
      ? await admin.from("subscription_plans").update(row).eq("id", data.id)
      : await admin.from("subscription_plans").insert(row);
    if (error) throw new Error(error.message);
    await writePlatformAudit(admin, context.userId, data.id ? "PLAN_UPDATED" : "PLAN_CREATED", "subscription_plans", data.id ?? null, { slug: data.slug });
    return { ok: true };
  });

const toggleSchema = z.object({ id: z.string().uuid(), isActive: z.boolean() });

export const togglePlanActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => toggleSchema.parse(data))
  .handler(async ({ data, context }) => {
    const admin = await assertPlatformAdmin(context);
    const { error } = await admin.from("subscription_plans").update({ is_active: data.isActive }).eq("id", data.id);
    if (error) throw new Error(error.message);
    await writePlatformAudit(admin, context.userId, data.isActive ? "PLAN_ACTIVATED" : "PLAN_DEACTIVATED", "subscription_plans", data.id, {});
    return { ok: true };
  });

// ---------------------------------------------------------------- industries (platform side)

export const listAdminIndustries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await assertPlatformAdmin(context);
    const { data } = await admin
      .from("industries")
      .select("id, slug, name, description, icon, theme, features, requires_approval, is_active, is_public, sort_order")
      .order("sort_order");
    const { data: orgs } = await admin.from("organizations").select("industry_id");
    const counts = new Map<string, number>();
    for (const o of orgs ?? []) {
      if (o.industry_id) counts.set(o.industry_id, (counts.get(o.industry_id) ?? 0) + 1);
    }
    return (data ?? []).map((i) => ({ ...i, orgCount: counts.get(i.id) ?? 0 }));
  });

const industrySchema = z.object({
  id: z.string().uuid().optional(),
  slug: z.string().min(2).max(60).regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  icon: z.string().max(60).default("store"),
  features: z.array(z.string().min(1)).default([]),
  isActive: z.boolean().default(true),
  isPublic: z.boolean().default(true),
  requiresApproval: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
});

export const upsertIndustry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => industrySchema.parse(data))
  .handler(async ({ data, context }) => {
    const admin = await assertPlatformAdmin(context);
    const row = {
      slug: data.slug,
      name: data.name,
      description: data.description ?? null,
      icon: data.icon,
      features: data.features,
      is_active: data.isActive,
      is_public: data.isPublic,
      requires_approval: data.requiresApproval,
      sort_order: data.sortOrder,
    };
    const { error } = data.id
      ? await admin.from("industries").update(row).eq("id", data.id)
      : await admin.from("industries").insert(row);
    if (error) throw new Error(error.message);
    await writePlatformAudit(admin, context.userId, data.id ? "INDUSTRY_UPDATED" : "INDUSTRY_CREATED", "industries", data.id ?? null, { slug: data.slug });
    return { ok: true };
  });

export const toggleIndustryActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => toggleSchema.parse(data))
  .handler(async ({ data, context }) => {
    const admin = await assertPlatformAdmin(context);
    const { error } = await admin.from("industries").update({ is_active: data.isActive }).eq("id", data.id);
    if (error) throw new Error(error.message);
    await writePlatformAudit(admin, context.userId, data.isActive ? "INDUSTRY_ACTIVATED" : "INDUSTRY_DEACTIVATED", "industries", data.id, {});
    return { ok: true };
  });

// ---------------------------------------------------------------- audit

export const listPlatformAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await assertPlatformAdmin(context);
    const { data } = await admin
      .from("platform_audit_logs")
      .select("id, actor_id, action, entity, entity_id, details, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    return data ?? [];
  });
