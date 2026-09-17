import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PERMISSION_LIST, ROLE_LABELS } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "الإعدادات — كاشير كلاود" },
      {
        name: "description",
        content: "بيانات المتجر، الفروع، المستودعات، أجهزة الكاشير والأدوار المخصصة.",
      },
      { property: "og:title", content: "الإعدادات — كاشير كلاود" },
      { property: "og:description", content: "ضبط المتجر والفروع والأدوار." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});

const BASE_ROLES = ["MANAGER", "CASHIER", "INVENTORY_MANAGER", "ACCOUNTANT"] as const;

function SettingsPage() {
  const { org, permissions, refresh, profile } = useAuth();
  const isAdmin = Boolean(permissions["*"]);
  const qc = useQueryClient();

  const [orgForm, setOrgForm] = useState({
    name: org?.name ?? "",
    currency: org?.currency ?? "SAR",
    tax_rate: String(org?.tax_rate ?? 15),
  });
  const [branchName, setBranchName] = useState("");
  const [warehouseName, setWarehouseName] = useState("");
  const [warehouseBranch, setWarehouseBranch] = useState("none");
  const [registerName, setRegisterName] = useState("");
  const [registerBranch, setRegisterBranch] = useState("none");
  const [roleName, setRoleName] = useState("");
  const [roleBase, setRoleBase] = useState<(typeof BASE_ROLES)[number]>("CASHIER");
  const [rolePerms, setRolePerms] = useState<Record<string, boolean>>({});

  const branches = useQuery({
    queryKey: ["branches"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("branches")
        .select("id, name, is_active")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const warehouses = useQuery({
    queryKey: ["warehouses-full"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("id, name, branch_id")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const registers = useQuery({
    queryKey: ["registers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("registers")
        .select("id, name, code, branch_id")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const roles = useQuery({
    queryKey: ["custom-roles-full"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("custom_roles")
        .select("id, name, base_role, permissions")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const saveOrg = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("organizations")
        .update({
          name: orgForm.name.trim(),
          currency: orgForm.currency.trim() || "SAR",
          tax_rate: Number(orgForm.tax_rate) || 0,
        })
        .eq("id", org!.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("تم حفظ بيانات المتجر");
      await refresh();
    },
    onError: () => toast.error("تعذر الحفظ"),
  });

  const addBranch = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("branches")
        .insert({ org_id: profile!.org_id!, name: branchName.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      setBranchName("");
      toast.success("تمت إضافة الفرع");
      void qc.invalidateQueries({ queryKey: ["branches"] });
    },
    onError: () => toast.error("تعذر إضافة الفرع"),
  });

  const addWarehouse = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("warehouses").insert({
        org_id: profile!.org_id!,
        name: warehouseName.trim(),
        branch_id: warehouseBranch === "none" ? null : warehouseBranch,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setWarehouseName("");
      toast.success("تمت إضافة المستودع");
      void qc.invalidateQueries({ queryKey: ["warehouses-full"] });
      void qc.invalidateQueries({ queryKey: ["warehouses"] });
    },
    onError: () => toast.error("تعذر إضافة المستودع"),
  });

  const addRegister = useMutation({
    mutationFn: async () => {
      if (registerBranch === "none") throw new Error("branch");
      const { error } = await supabase.from("registers").insert({
        org_id: profile!.org_id!,
        name: registerName.trim(),
        branch_id: registerBranch,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setRegisterName("");
      toast.success("تمت إضافة جهاز الكاشير");
      void qc.invalidateQueries({ queryKey: ["registers"] });
    },
    onError: (e: Error) =>
      toast.error(e.message === "branch" ? "اختر الفرع أولًا" : "تعذر إضافة الجهاز"),
  });

  const addRole = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("custom_roles").insert({
        org_id: profile!.org_id!,
        name: roleName.trim(),
        base_role: roleBase,
        permissions: rolePerms,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setRoleName("");
      setRolePerms({});
      toast.success("تم إنشاء الدور");
      void qc.invalidateQueries({ queryKey: ["custom-roles-full"] });
      void qc.invalidateQueries({ queryKey: ["custom-roles"] });
    },
    onError: () => toast.error("تعذر إنشاء الدور"),
  });

  if (!isAdmin) {
    return (
      <div className="p-10 text-center text-muted-foreground">الإعدادات للمالك والمسؤولين فقط.</div>
    );
  }

  const branchName_ = (id: string | null) =>
    branches.data?.find((b) => b.id === id)?.name ?? "كل الفروع";

  return (
    <div>
      <PageHeader title="الإعدادات" description="بيانات المتجر والفروع والأدوار." />
      <div className="grid gap-6 p-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>بيانات المتجر</CardTitle>
            <CardDescription>الاسم والعملة ونسبة الضريبة المطبقة على الفواتير.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="o-name">اسم المتجر</Label>
              <Input
                id="o-name"
                value={orgForm.name}
                onChange={(e) => setOrgForm({ ...orgForm, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="o-cur">العملة</Label>
                <Input
                  id="o-cur"
                  value={orgForm.currency}
                  onChange={(e) => setOrgForm({ ...orgForm, currency: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="o-tax">الضريبة %</Label>
                <Input
                  id="o-tax"
                  type="number"
                  step="0.01"
                  value={orgForm.tax_rate}
                  onChange={(e) => setOrgForm({ ...orgForm, tax_rate: e.target.value })}
                />
              </div>
            </div>
            <Button disabled={saveOrg.isPending} onClick={() => saveOrg.mutate()}>
              حفظ
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>الفروع</CardTitle>
            <CardDescription>كل فرع له مستودعاته وأجهزة الكاشير الخاصة به.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-1 text-sm">
              {(branches.data ?? []).map((b) => (
                <li
                  key={b.id}
                  className="flex items-center justify-between rounded-lg border px-3 py-2"
                >
                  <span>{b.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {b.is_active ? "مفعّل" : "موقوف"}
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <Input
                placeholder="اسم الفرع"
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
              />
              <Button
                variant="outline"
                disabled={!branchName.trim() || addBranch.isPending}
                onClick={() => addBranch.mutate()}
              >
                <Plus className="size-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>المستودعات</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-1 text-sm">
              {(warehouses.data ?? []).map((w) => (
                <li
                  key={w.id}
                  className="flex items-center justify-between rounded-lg border px-3 py-2"
                >
                  <span>{w.name}</span>
                  <span className="text-xs text-muted-foreground">{branchName_(w.branch_id)}</span>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Input
                className="min-w-[140px] flex-1"
                placeholder="اسم المستودع"
                value={warehouseName}
                onChange={(e) => setWarehouseName(e.target.value)}
              />
              <Select value={warehouseBranch} onValueChange={setWarehouseBranch}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">كل الفروع</SelectItem>
                  {(branches.data ?? []).map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                disabled={!warehouseName.trim() || addWarehouse.isPending}
                onClick={() => addWarehouse.mutate()}
              >
                <Plus className="size-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>أجهزة الكاشير</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-1 text-sm">
              {(registers.data ?? []).map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between rounded-lg border px-3 py-2"
                >
                  <span>{r.name}</span>
                  <span className="text-xs text-muted-foreground">{branchName_(r.branch_id)}</span>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Input
                className="min-w-[140px] flex-1"
                placeholder="اسم الجهاز"
                value={registerName}
                onChange={(e) => setRegisterName(e.target.value)}
              />
              <Select value={registerBranch} onValueChange={setRegisterBranch}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="الفرع" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">اختر الفرع</SelectItem>
                  {(branches.data ?? []).map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                disabled={!registerName.trim() || addRegister.isPending}
                onClick={() => addRegister.mutate()}
              >
                <Plus className="size-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>الأدوار المخصصة</CardTitle>
            <CardDescription>
              أنشئ دورًا وحدد صلاحياته بدقة، ثم اربطه بالموظف من صفحة الموظفين.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-1 text-sm">
              {(roles.data ?? []).map((r) => (
                <li key={r.id} className="rounded-lg border px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{r.name}</span>
                    <span className="text-xs text-muted-foreground">
                      مبني على {ROLE_LABELS[r.base_role] ?? r.base_role}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {PERMISSION_LIST.filter(
                      (p) => (r.permissions as Record<string, boolean>)[p.key],
                    )
                      .map((p) => p.label)
                      .join("، ") || "بدون صلاحيات"}
                  </p>
                </li>
              ))}
            </ul>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="r-name">اسم الدور</Label>
                <Input id="r-name" value={roleName} onChange={(e) => setRoleName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>الدور الأساسي</Label>
                <Select
                  value={roleBase}
                  onValueChange={(v) => setRoleBase(v as (typeof BASE_ROLES)[number])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BASE_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {PERMISSION_LIST.map((p) => (
                <div
                  key={p.key}
                  className="flex items-center justify-between rounded-lg border px-3 py-2"
                >
                  <Label htmlFor={`perm-${p.key}`} className="text-sm">
                    {p.label}
                  </Label>
                  <Switch
                    id={`perm-${p.key}`}
                    checked={Boolean(rolePerms[p.key])}
                    onCheckedChange={(v) => setRolePerms({ ...rolePerms, [p.key]: v })}
                  />
                </div>
              ))}
            </div>

            <Button
              disabled={!roleName.trim() || addRole.isPending}
              onClick={() => addRole.mutate()}
            >
              إنشاء الدور
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
