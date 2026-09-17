import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const createStaffSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  fullName: z.string().min(1),
  role: z.enum(["ADMIN", "MANAGER", "CASHIER", "INVENTORY_MANAGER", "ACCOUNTANT"]),
  branchId: z.string().uuid().nullable().optional(),
  employeeCode: z.string().optional(),
  customRoleId: z.string().uuid().nullable().optional(),
});

/**
 * Creates a staff account inside the caller's organization.
 * The caller must be OWNER/ADMIN — verified with the caller's own RLS client
 * BEFORE the admin client is loaded.
 */
export const createStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => createStaffSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { data: me, error: meError } = await context.supabase
      .from("profiles")
      .select("org_id, role, is_active")
      .eq("id", context.userId)
      .maybeSingle();

    if (meError) throw new Error("failed to verify caller");
    if (!me?.org_id || !me.is_active || (me.role !== "OWNER" && me.role !== "ADMIN")) {
      throw new Error("forbidden");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName },
    });
    if (createError || !created.user) {
      throw new Error(createError?.message ?? "failed to create user");
    }

    const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
      id: created.user.id,
      org_id: me.org_id,
      full_name: data.fullName,
      role: data.role,
      branch_id: data.branchId ?? null,
      employee_code: data.employeeCode ?? null,
      custom_role_id: data.customRoleId ?? null,
      is_active: true,
    });
    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      throw new Error("failed to create profile");
    }

    await supabaseAdmin.from("audit_logs").insert({
      org_id: me.org_id,
      user_id: context.userId,
      action: "STAFF_CREATED",
      entity: "profiles",
      entity_id: created.user.id,
      details: { role: data.role },
    });

    return { userId: created.user.id };
  });

const resetStaffPasswordSchema = z.object({
  userId: z.string().uuid(),
  password: z.string().min(6),
});

export const resetStaffPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => resetStaffPasswordSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { data: me } = await context.supabase
      .from("profiles")
      .select("org_id, role, is_active")
      .eq("id", context.userId)
      .maybeSingle();
    if (!me?.org_id || !me.is_active || (me.role !== "OWNER" && me.role !== "ADMIN")) {
      throw new Error("forbidden");
    }

    const { data: target } = await context.supabase
      .from("profiles")
      .select("id, org_id")
      .eq("id", data.userId)
      .maybeSingle();
    if (!target || target.org_id !== me.org_id) throw new Error("not found");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.password,
    });
    if (error) throw new Error("failed to update password");

    await supabaseAdmin.from("audit_logs").insert({
      org_id: me.org_id,
      user_id: context.userId,
      action: "STAFF_PASSWORD_RESET",
      entity: "profiles",
      entity_id: data.userId,
    });

    return { ok: true };
  });
