import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Building2, CreditCard, Layers, LayoutDashboard, ScrollText, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  getPlatformOverview,
  listAdminOrganizations,
  setOrganizationSuspended,
  listAdminSubscriptions,
  grantSubscription,
  updateSubscription,
  listAdminPlans,
  togglePlanActive,
  listAdminIndustries,
  toggleIndustryActive,
  listPlatformAudit,
} from "@/lib/platform-admin.functions";

export const Route = createFileRoute("/_authenticated/super-admin")({
  head: () => ({
    meta: [
      { title: "لوحة المنصة — SmartPOS" },
      { name: "description", content: "لوحة إدارة منصة SmartPOS: المؤسسات، الأنشطة، الخطط، الاشتراكات وسجل المنصة." },
      { property: "og:title", content: "لوحة المنصة — SmartPOS" },
      { property: "og:description", content: "إدارة مركزية للمؤسسات والاشتراكات والأنشطة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SuperAdmin,
});

const STATUS_TONE: Record<string, string> = {
  ACTIVE: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  TRIAL: "bg-sky-500/15 text-sky-600 border-sky-500/30",
  EXPIRED: "bg-destructive/15 text-destructive border-destructive/30",
  SUSPENDED: "bg-destructive/15 text-destructive border-destructive/30",
  CANCELLED: "bg-muted text-muted-foreground",
  PENDING_PAYMENT: "bg-amber-500/15 text-amber-600 border-amber-500/30",
};

const STATUS_AR: Record<string, string> = {
  ACTIVE: "نشط",
  TRIAL: "تجربة",
  EXPIRED: "منتهي",
  SUSPENDED: "موقوف",
  CANCELLED: "ملغي",
  PENDING_PAYMENT: "بانتظار الدفع",
};

function SuperAdmin() {
  const qc = useQueryClient();
  const [forbidden, setForbidden] = useState(false);

  const overviewFn = useServerFn(getPlatformOverview);
  const orgsFn = useServerFn(listAdminOrganizations);
  const subsFn = useServerFn(listAdminSubscriptions);
  const plansFn = useServerFn(listAdminPlans);
  const industriesFn = useServerFn(listAdminIndustries);
  const auditFn = useServerFn(listPlatformAudit);
  const suspendFn = useServerFn(setOrganizationSuspended);
  const grantFn = useServerFn(grantSubscription);
  const updateSubFn = useServerFn(updateSubscription);
  const togglePlanFn = useServerFn(togglePlanActive);
  const toggleIndustryFn = useServerFn(toggleIndustryActive);

  const wrap = <T,>(fn: () => Promise<T>, key: string[]) =>
    useQuery({
      queryKey: key,
      queryFn: async () => {
        try {
          return await fn();
        } catch (e) {
          if (e instanceof Error && e.message.includes("forbidden")) setForbidden(true);
          throw e;
        }
      },
      retry: false,
    });

  const overview = wrap(() => overviewFn(), ["platform-overview"]);
  const orgs = wrap(() => orgsFn(), ["platform-orgs"]);
  const subs = wrap(() => subsFn(), ["platform-subs"]);
  const plans = wrap(() => plansFn(), ["platform-plans"]);
  const industries = wrap(() => industriesFn(), ["platform-industries"]);
  const audit = wrap(() => auditFn(), ["platform-audit"]);

  // grant form state
  const [grantOrgId, setGrantOrgId] = useState("");
  const [grantPlan, setGrantPlan] = useState("monthly");
  const [grantDays, setGrantDays] = useState("30");
  const [grantReason, setGrantReason] = useState("");
  const [busy, setBusy] = useState(false);

  if (forbidden) {
    return (
      <div className="grid min-h-[70vh] place-items-center p-6 text-center">
        <div className="surface-card max-w-sm p-8">
          <ShieldCheck className="mx-auto size-10 text-destructive" />
          <h1 className="mt-3 text-xl font-bold">غير مصرح</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            هذه اللوحة مخصصة لإدارة المنصة فقط. تم التحقق من صلاحيتك على الخادم ورفض الوصول.
          </p>
        </div>
      </div>
    );
  }

  async function invalidateAll() {
    await qc.invalidateQueries({ queryKey: ["platform-"] });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-xl gradient-primary text-primary-foreground shadow-sm">
          <ShieldCheck className="size-5" />
        </span>
        <div>
          <h1 className="text-2xl font-black">لوحة المنصة</h1>
          <p className="text-sm text-muted-foreground">
            إدارة مركزية للمؤسسات والأنشطة والخطط والاشتراكات — الصلاحية محققة على الخادم في كل عملية.
          </p>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="flex h-auto flex-wrap">
          <TabsTrigger value="overview"><LayoutDashboard className="me-1.5 size-4" />نظرة عامة</TabsTrigger>
          <TabsTrigger value="orgs"><Building2 className="me-1.5 size-4" />المؤسسات</TabsTrigger>
          <TabsTrigger value="subs"><CreditCard className="me-1.5 size-4" />الاشتراكات</TabsTrigger>
          <TabsTrigger value="plans"><Layers className="me-1.5 size-4" />الخطط</TabsTrigger>
          <TabsTrigger value="industries"><Layers className="me-1.5 size-4" />الأنشطة</TabsTrigger>
          <TabsTrigger value="audit"><ScrollText className="me-1.5 size-4" />سجل المنصة</TabsTrigger>
        </TabsList>

        {/* ---------------- overview ---------------- */}
        <TabsContent value="overview" className="mt-4">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              { label: "المؤسسات", value: overview.data?.organizations, hint: `موقوفة: ${overview.data?.suspendedOrgs ?? 0}` },
              { label: "اشتراكات نشطة", value: overview.data?.activeSubscriptions, hint: `تجارب: ${overview.data?.trialSubscriptions ?? 0}` },
              { label: "اشتراكات منتهية", value: overview.data?.expiredSubscriptions, hint: `تسجيلات هذا الأسبوع: ${overview.data?.newOrgsThisWeek ?? 0}` },
              { label: "الأنشطة والخطط", value: overview.data ? `${overview.data.industries} / ${overview.data.plans}` : undefined, hint: "نشاط / خطة" },
            ].map((c) => (
              <Card key={c.label}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">{c.label}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-black">{c.value ?? "…"}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">{c.hint}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ---------------- organizations ---------------- */}
        <TabsContent value="orgs" className="mt-4">
          <Card>
            <CardHeader><CardTitle>المؤسسات ({orgs.data?.length ?? 0})</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b text-start text-muted-foreground">
                    <th className="p-2 text-start">الاسم</th>
                    <th className="p-2 text-start">النشاط</th>
                    <th className="p-2 text-start">الأعضاء</th>
                    <th className="p-2 text-start">الخطة</th>
                    <th className="p-2 text-start">الحالة</th>
                    <th className="p-2 text-start">الانتهاء</th>
                    <th className="p-2 text-start">إيقاف</th>
                  </tr>
                </thead>
                <tbody>
                  {(orgs.data ?? []).map((o) => (
                    <tr key={o.id} className="border-b last:border-0">
                      <td className="p-2 font-semibold">{o.name}</td>
                      <td className="p-2">{o.industry}</td>
                      <td className="p-2">{o.members}</td>
                      <td className="p-2">{o.plan ?? "—"}</td>
                      <td className="p-2">
                        {o.status ? (
                          <Badge variant="outline" className={STATUS_TONE[o.status]}>
                            {STATUS_AR[o.status] ?? o.status}
                          </Badge>
                        ) : "—"}
                      </td>
                      <td className="p-2 text-xs">{o.expiresAt ? new Date(o.expiresAt).toLocaleDateString("ar-EG") : "—"}</td>
                      <td className="p-2">
                        <Switch
                          checked={o.suspended}
                          onCheckedChange={async (checked) => {
                            try {
                              await suspendFn({ data: { orgId: o.id, suspended: checked, reason: "إجراء من لوحة المنصة" } });
                              toast.success(checked ? "تم إيقاف المؤسسة" : "تم إعادة تفعيل المؤسسة");
                              await invalidateAll();
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : "فشل الإجراء");
                            }
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- subscriptions ---------------- */}
        <TabsContent value="subs" className="mt-4 space-y-4">
          <Card>
            <CardHeader><CardTitle>منح / تمديد اشتراك</CardTitle></CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-4">
                <Select value={grantOrgId} onValueChange={setGrantOrgId}>
                  <SelectTrigger><SelectValue placeholder="اختر المؤسسة" /></SelectTrigger>
                  <SelectContent>
                    {(orgs.data ?? []).map((o) => (
                      <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={grantPlan} onValueChange={setGrantPlan}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(plans.data ?? []).filter((p) => p.is_active).map((p) => (
                      <SelectItem key={p.slug} value={p.slug}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min={1}
                  value={grantDays}
                  onChange={(e) => setGrantDays(e.target.value)}
                  placeholder="المدة بالأيام"
                />
                <Input
                  value={grantReason}
                  onChange={(e) => setGrantReason(e.target.value)}
                  placeholder="سبب المنح (اختياري)"
                />
              </div>
              <Button
                className="mt-3"
                disabled={busy || !grantOrgId}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await grantFn({
                      data: {
                        orgId: grantOrgId,
                        planSlug: grantPlan,
                        days: Number(grantDays) || undefined,
                        status: "ACTIVE",
                        reason: grantReason || undefined,
                      },
                    });
                    toast.success("تم منح الاشتراك");
                    await invalidateAll();
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "فشل المنح");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                منح الاشتراك
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>سجل الاشتراكات ({subs.data?.length ?? 0})</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b text-start text-muted-foreground">
                    <th className="p-2 text-start">المؤسسة</th>
                    <th className="p-2 text-start">الخطة</th>
                    <th className="p-2 text-start">السعر</th>
                    <th className="p-2 text-start">الحالة</th>
                    <th className="p-2 text-start">ينتهي</th>
                    <th className="p-2 text-start">إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {(subs.data ?? []).map((s) => (
                    <tr key={s.id} className="border-b last:border-0">
                      <td className="p-2 font-semibold">{s.orgName}</td>
                      <td className="p-2">{s.planName}</td>
                      <td className="p-2">{s.price} {s.currency}</td>
                      <td className="p-2">
                        <Badge variant="outline" className={STATUS_TONE[s.status]}>
                          {STATUS_AR[s.status] ?? s.status}
                        </Badge>
                      </td>
                      <td className="p-2 text-xs">{new Date(s.expiresAt).toLocaleDateString("ar-EG")}</td>
                      <td className="p-2">
                        <div className="flex gap-1.5">
                          {s.status !== "SUSPENDED" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={async () => {
                                try {
                                  await updateSubFn({ data: { subscriptionId: s.id, status: "SUSPENDED", note: "إيقاف من لوحة المنصة" } });
                                  toast.success("تم إيقاف الاشتراك");
                                  await invalidateAll();
                                } catch (e) {
                                  toast.error(e instanceof Error ? e.message : "فشل الإجراء");
                                }
                              }}
                            >
                              إيقاف
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={async () => {
                                try {
                                  await updateSubFn({ data: { subscriptionId: s.id, status: "ACTIVE", note: "إعادة تفعيل من لوحة المنصة" } });
                                  toast.success("تمت إعادة التفعيل");
                                  await invalidateAll();
                                } catch (e) {
                                  toast.error(e instanceof Error ? e.message : "فشل الإجراء");
                                }
                              }}
                            >
                              إعادة تفعيل
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- plans ---------------- */}
        <TabsContent value="plans" className="mt-4">
          <Card>
            <CardHeader><CardTitle>الخطط ({plans.data?.length ?? 0})</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b text-start text-muted-foreground">
                    <th className="p-2 text-start">الاسم</th>
                    <th className="p-2 text-start">المعرّف</th>
                    <th className="p-2 text-start">السعر</th>
                    <th className="p-2 text-start">المدة (يوم)</th>
                    <th className="p-2 text-start">الفروع / المستخدمون</th>
                    <th className="p-2 text-start">تجربة</th>
                    <th className="p-2 text-start">مفعّلة</th>
                  </tr>
                </thead>
                <tbody>
                  {(plans.data ?? []).map((p) => (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="p-2 font-semibold">{p.name}</td>
                      <td className="p-2 font-mono text-xs">{p.slug}</td>
                      <td className="p-2">{p.price} {p.currency}</td>
                      <td className="p-2">{p.duration_days}</td>
                      <td className="p-2">{p.max_branches ?? "∞"} / {p.max_users ?? "∞"}</td>
                      <td className="p-2">{p.is_trial ? "نعم" : "لا"}</td>
                      <td className="p-2">
                        <Switch
                          checked={p.is_active}
                          onCheckedChange={async (checked) => {
                            try {
                              await togglePlanFn({ data: { id: p.id, isActive: checked } });
                              toast.success(checked ? "تم تفعيل الخطة" : "تم إيقاف الخطة");
                              await invalidateAll();
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : "فشل الإجراء");
                            }
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- industries ---------------- */}
        <TabsContent value="industries" className="mt-4">
          <Card>
            <CardHeader><CardTitle>الأنشطة ({industries.data?.length ?? 0})</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b text-start text-muted-foreground">
                    <th className="p-2 text-start">الاسم</th>
                    <th className="p-2 text-start">المعرّف</th>
                    <th className="p-2 text-start">المؤسسات</th>
                    <th className="p-2 text-start">المزايا</th>
                    <th className="p-2 text-start">مفعّل</th>
                  </tr>
                </thead>
                <tbody>
                  {(industries.data ?? []).map((i) => (
                    <tr key={i.id} className="border-b last:border-0">
                      <td className="p-2 font-semibold">{i.name}</td>
                      <td className="p-2 font-mono text-xs">{i.slug}</td>
                      <td className="p-2">{i.orgCount}</td>
                      <td className="p-2 text-xs text-muted-foreground">{i.features.join("، ") || "—"}</td>
                      <td className="p-2">
                        <Switch
                          checked={i.is_active}
                          onCheckedChange={async (checked) => {
                            try {
                              await toggleIndustryFn({ data: { id: i.id, isActive: checked } });
                              toast.success(checked ? "تم تفعيل النشاط" : "تم إيقاف النشاط");
                              await invalidateAll();
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : "فشل الإجراء");
                            }
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- audit ---------------- */}
        <TabsContent value="audit" className="mt-4">
          <Card>
            <CardHeader><CardTitle>سجل المنصة ({audit.data?.length ?? 0})</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b text-start text-muted-foreground">
                    <th className="p-2 text-start">الوقت</th>
                    <th className="p-2 text-start">الإجراء</th>
                    <th className="p-2 text-start">الكيان</th>
                    <th className="p-2 text-start">التفاصيل</th>
                  </tr>
                </thead>
                <tbody>
                  {(audit.data ?? []).map((a) => (
                    <tr key={a.id} className="border-b last:border-0">
                      <td className="p-2 text-xs whitespace-nowrap">{new Date(a.created_at).toLocaleString("ar-EG")}</td>
                      <td className="p-2 font-mono text-xs">{a.action}</td>
                      <td className="p-2 text-xs">{a.entity}</td>
                      <td className="p-2 max-w-[320px] truncate text-xs text-muted-foreground" title={JSON.stringify(a.details)}>
                        {JSON.stringify(a.details)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
