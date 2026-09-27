import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PERMISSION_LIST, ROLE_LABELS } from "@/lib/format";
import { removeProductImage, uploadProductImage } from "@/lib/product-images";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "الإعدادات — SmartPOS" },
      {
        name: "description",
        content: "بيانات المتجر، الفروع، المستودعات، أجهزة الكاشير والأدوار المخصصة.",
      },
      { property: "og:title", content: "الإعدادات — SmartPOS" },
      { property: "og:description", content: "ضبط المتجر والفروع والأدوار." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});

const BASE_ROLES = ["MANAGER", "CASHIER", "INVENTORY_MANAGER", "ACCOUNTANT"] as const;
const CURRENCIES = [
  { code: "EGP", label: "الجنيه المصري (EGP)" },
  { code: "SAR", label: "الريال السعودي (SAR)" },
  { code: "AED", label: "الدرهم الإماراتي (AED)" },
  { code: "MAD", label: "الدرهم المغربي (MAD)" },
  { code: "KWD", label: "الدينار الكويتي (KWD)" },
] as const;

function SettingsPage() {
  const { org, permissions, refresh, profile } = useAuth();
  const isAdmin = Boolean(permissions["*"]);
  const qc = useQueryClient();
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(org?.logo_src ?? null);
  const [removeLogo, setRemoveLogo] = useState(false);

  const [orgForm, setOrgForm] = useState({
    name: org?.name ?? "",
    currency: org?.currency ?? "EGP",
    tax_enabled: org?.tax_enabled ?? false,
    tax_rate: String(org?.tax_rate ?? 0),
    address: org?.address ?? "",
    phone: org?.phone ?? "",
    tax_number: org?.tax_number ?? "",
    commercial_register: org?.commercial_register ?? "",
    receipt_header: org?.receipt_header ?? "",
    receipt_footer: org?.receipt_footer ?? "شكرًا لزيارتكم ونسعد بخدمتكم دائمًا",
    profit_calculation_method: org?.profit_calculation_method ?? "AVERAGE_COST",
    scale_barcode_enabled: org?.scale_barcode_enabled ?? false,
    scale_barcode_prefix: org?.scale_barcode_prefix ?? "20",
    scale_barcode_mode: org?.scale_barcode_mode ?? ("WEIGHT" as "WEIGHT" | "PRICE"),
    expiry_alert_days: String(org?.expiry_alert_days ?? 30),
    block_expired_sales: org?.block_expired_sales ?? true,
  });
  const [branchName, setBranchName] = useState("");
  const [warehouseName, setWarehouseName] = useState("");
  const [warehouseBranch, setWarehouseBranch] = useState("none");
  const [registerName, setRegisterName] = useState("");
  const [registerBranch, setRegisterBranch] = useState("none");
  const [roleName, setRoleName] = useState("");
  const [roleBase, setRoleBase] = useState<(typeof BASE_ROLES)[number]>("CASHIER");
  const [rolePerms, setRolePerms] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!org) return;
    setOrgForm({
      name: org.name,
      currency: org.currency,
      tax_enabled: org.tax_enabled,
      tax_rate: String(org.tax_rate),
      address: org.address ?? "",
      phone: org.phone ?? "",
      tax_number: org.tax_number ?? "",
      commercial_register: org.commercial_register ?? "",
      receipt_header: org.receipt_header ?? "",
      receipt_footer: org.receipt_footer ?? "شكرًا لزيارتكم ونسعد بخدمتكم دائمًا",
      profit_calculation_method: org.profit_calculation_method,
      scale_barcode_enabled: org.scale_barcode_enabled,
      scale_barcode_prefix: org.scale_barcode_prefix,
      scale_barcode_mode: org.scale_barcode_mode,
      expiry_alert_days: String(org.expiry_alert_days),
      block_expired_sales: org.block_expired_sales,
    });
    setLogoPreview(org.logo_src);
    setLogoFile(null);
    setRemoveLogo(false);
  }, [org]);

  useEffect(
    () => () => {
      if (logoPreview?.startsWith("blob:")) URL.revokeObjectURL(logoPreview);
    },
    [logoPreview],
  );

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
      if (!org) throw new Error("organization");
      const currency = orgForm.currency.trim().toUpperCase();
      const taxRate = Number(orgForm.tax_rate);
      const expiryAlertDays = Number(orgForm.expiry_alert_days);
      if (!/^[A-Z]{3}$/.test(currency)) throw new Error("currency");
      if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) throw new Error("tax");
      if (!/^\d{1,2}$/.test(orgForm.scale_barcode_prefix)) throw new Error("scale-prefix");
      if (!Number.isInteger(expiryAlertDays) || expiryAlertDays < 1 || expiryAlertDays > 365) {
        throw new Error("expiry-days");
      }
      let nextLogo = org.logo_url;
      let uploadedLogo: string | null = null;
      if (logoFile) {
        uploadedLogo = await uploadProductImage(org.id, "receipt-brand", logoFile);
        nextLogo = uploadedLogo;
      } else if (removeLogo) {
        nextLogo = null;
      }
      const { error } = await supabase
        .from("organizations")
        .update({
          name: orgForm.name.trim(),
          currency,
          tax_enabled: orgForm.tax_enabled,
          tax_rate: taxRate,
          address: orgForm.address.trim() || null,
          phone: orgForm.phone.trim() || null,
          tax_number: orgForm.tax_number.trim() || null,
          commercial_register: orgForm.commercial_register.trim() || null,
          logo_url: nextLogo,
          receipt_header: orgForm.receipt_header.trim() || null,
          receipt_footer: orgForm.receipt_footer.trim() || null,
          profit_calculation_method: orgForm.profit_calculation_method,
          scale_barcode_enabled: orgForm.scale_barcode_enabled,
          scale_barcode_prefix: orgForm.scale_barcode_prefix,
          scale_barcode_mode: orgForm.scale_barcode_mode,
          expiry_alert_days: expiryAlertDays,
          block_expired_sales: orgForm.block_expired_sales,
        })
        .eq("id", org.id);
      if (error) {
        if (uploadedLogo) await removeProductImage(uploadedLogo);
        throw error;
      }
      if ((logoFile || removeLogo) && org.logo_url && org.logo_url !== nextLogo) {
        await removeProductImage(org.logo_url);
      }
    },
    onSuccess: async () => {
      toast.success("تم حفظ بيانات المتجر");
      await refresh();
      await qc.invalidateQueries();
    },
    onError: (error: Error) =>
      toast.error(
        error.message === "currency"
          ? "أدخل رمز عملة من 3 أحرف مثل SAR"
          : error.message === "tax"
            ? "يجب أن تكون الضريبة بين 0 و100"
            : error.message === "scale-prefix"
              ? "بادئة باركود الميزان يجب أن تكون رقمًا أو رقمين"
              : error.message === "expiry-days"
                ? "مدة تنبيه الصلاحية يجب أن تكون بين يوم و365 يومًا"
            : "تعذر الحفظ",
      ),
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
      <PageHeader title="الإعدادات" description="إعدادات الكاشير والفواتير والفروع والأدوار." />
      <div className="page-canvas grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>إعدادات الكاشير والفواتير</CardTitle>
            <CardDescription>
              هوية المتجر والعملة وضريبة المبيعات وطريقة حساب الربح في كل الفروع.
            </CardDescription>
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
            <div className="space-y-2">
              <Label>شعار الفاتورة</Label>
              <input
                ref={logoInputRef}
                className="sr-only"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  if (logoPreview?.startsWith("blob:")) URL.revokeObjectURL(logoPreview);
                  setLogoFile(file);
                  setLogoPreview(URL.createObjectURL(file));
                  setRemoveLogo(false);
                }}
              />
              <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-3 rounded-lg border p-3">
                <div className="grid size-[72px] place-items-center overflow-hidden rounded-md bg-muted">
                  {logoPreview ? (
                    <img src={logoPreview} alt="شعار المتجر" className="size-full object-contain" />
                  ) : (
                    <ImagePlus className="size-6 text-muted-foreground" />
                  )}
                </div>
                <div className="flex min-w-0 flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => logoInputRef.current?.click()}
                  >
                    <ImagePlus className="size-4" /> اختيار شعار
                  </Button>
                  {logoPreview && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        if (logoPreview.startsWith("blob:")) URL.revokeObjectURL(logoPreview);
                        setLogoFile(null);
                        setLogoPreview(null);
                        setRemoveLogo(true);
                        if (logoInputRef.current) logoInputRef.current.value = "";
                      }}
                    >
                      <Trash2 className="size-4" /> حذف
                    </Button>
                  )}
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="o-address">العنوان</Label>
              <Input
                id="o-address"
                value={orgForm.address}
                onChange={(e) => setOrgForm({ ...orgForm, address: e.target.value })}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="o-phone">الهاتف</Label>
                <Input
                  id="o-phone"
                  dir="ltr"
                  value={orgForm.phone}
                  onChange={(e) => setOrgForm({ ...orgForm, phone: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="o-tax-number">الرقم الضريبي</Label>
                <Input
                  id="o-tax-number"
                  dir="ltr"
                  value={orgForm.tax_number}
                  onChange={(e) => setOrgForm({ ...orgForm, tax_number: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="o-commercial-register">السجل التجاري</Label>
                <Input
                  id="o-commercial-register"
                  dir="ltr"
                  value={orgForm.commercial_register}
                  onChange={(e) => setOrgForm({ ...orgForm, commercial_register: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="o-receipt-header">عبارة أعلى الفاتورة</Label>
                <Textarea
                  id="o-receipt-header"
                  rows={3}
                  value={orgForm.receipt_header}
                  onChange={(e) => setOrgForm({ ...orgForm, receipt_header: e.target.value })}
                  placeholder="مثال: فاتورة مبيعات مبسطة"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="o-receipt-footer">عبارة أسفل الفاتورة</Label>
                <Textarea
                  id="o-receipt-footer"
                  rows={3}
                  value={orgForm.receipt_footer}
                  onChange={(e) => setOrgForm({ ...orgForm, receipt_footer: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="o-cur">العملة</Label>
                <Select
                  value={orgForm.currency}
                  onValueChange={(currency) => setOrgForm({ ...orgForm, currency })}
                >
                  <SelectTrigger id="o-cur">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((currency) => (
                      <SelectItem key={currency.code} value={currency.code}>
                        {currency.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
            <div className="flex min-h-16 items-center justify-between gap-4 rounded-lg border bg-muted/25 p-3">
              <div>
                <Label htmlFor="o-tax-enabled" className="font-bold">
                  تطبيق الضريبة أثناء البيع
                </Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  عند الإيقاف تبقى النسبة محفوظة، لكن لا تُضاف الضريبة إلى الفواتير الجديدة.
                </p>
              </div>
              <Switch
                id="o-tax-enabled"
                checked={orgForm.tax_enabled}
                onCheckedChange={(tax_enabled) => setOrgForm({ ...orgForm, tax_enabled })}
              />
            </div>
            <div className="space-y-2">
              <Label>نظام حساب الربح</Label>
              <Select
                value={orgForm.profit_calculation_method}
                onValueChange={(value) =>
                  setOrgForm({ ...orgForm, profit_calculation_method: value as "AVERAGE_COST" })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AVERAGE_COST">متوسط التكلفة</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                يُحسب الربح من تكلفة الصنف المحفوظة وقت إغلاق الفاتورة، فلا تتغير أرباح المبيعات
                القديمة.
              </p>
            </div>
            <div className="space-y-4 rounded-lg border p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label htmlFor="o-scale-enabled" className="font-bold">
                    قراءة باركود الميزان
                  </Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    يقرأ ملصق EAN-13 ويضيف الوزن أو يحسب الكمية من السعر تلقائيًا.
                  </p>
                </div>
                <Switch
                  id="o-scale-enabled"
                  checked={orgForm.scale_barcode_enabled}
                  onCheckedChange={(scale_barcode_enabled) =>
                    setOrgForm({ ...orgForm, scale_barcode_enabled })
                  }
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="o-scale-prefix">بادئة الميزان</Label>
                  <Input
                    id="o-scale-prefix"
                    dir="ltr"
                    inputMode="numeric"
                    maxLength={2}
                    value={orgForm.scale_barcode_prefix}
                    disabled={!orgForm.scale_barcode_enabled}
                    onChange={(event) =>
                      setOrgForm({
                        ...orgForm,
                        scale_barcode_prefix: event.target.value.replace(/\D/g, "").slice(0, 2),
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>محتوى الملصق</Label>
                  <Select
                    value={orgForm.scale_barcode_mode}
                    disabled={!orgForm.scale_barcode_enabled}
                    onValueChange={(scale_barcode_mode) =>
                      setOrgForm({
                        ...orgForm,
                        scale_barcode_mode: scale_barcode_mode as "WEIGHT" | "PRICE",
                      })
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="WEIGHT">الوزن بالكيلو</SelectItem>
                      <SelectItem value="PRICE">السعر الإجمالي</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <div className="space-y-4 rounded-lg border p-4">
              <div className="space-y-2">
                <Label htmlFor="o-expiry-days">التنبيه قبل انتهاء الصلاحية</Label>
                <Input
                  id="o-expiry-days"
                  type="number"
                  min="1"
                  max="365"
                  value={orgForm.expiry_alert_days}
                  onChange={(event) =>
                    setOrgForm({ ...orgForm, expiry_alert_days: event.target.value })
                  }
                />
              </div>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label htmlFor="o-block-expired" className="font-bold">منع بيع المنتج المنتهي</Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    يمنع إضافته إلى السلة من البحث أو الماسح.
                  </p>
                </div>
                <Switch
                  id="o-block-expired"
                  checked={orgForm.block_expired_sales}
                  onCheckedChange={(block_expired_sales) =>
                    setOrgForm({ ...orgForm, block_expired_sales })
                  }
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
