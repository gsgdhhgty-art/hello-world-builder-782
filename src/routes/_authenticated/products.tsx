import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { money, num } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/products")({
  head: () => ({
    meta: [
      { title: "المنتجات — كاشير كلاود" },
      { name: "description", content: "إدارة المنتجات والأسعار والباركود والتصنيفات وحد الطلب." },
      { property: "og:title", content: "المنتجات — كاشير كلاود" },
      { property: "og:description", content: "أضف منتجاتك وحدّد أسعارها وتكلفتها." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProductsPage,
});

interface Product {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  unit: string;
  cost: number;
  price: number;
  tax_rate: number | null;
  track_stock: boolean;
  reorder_level: number;
  is_active: boolean;
  category_id: string | null;
}

const EMPTY = {
  name: "",
  sku: "",
  barcode: "",
  unit: "piece",
  cost: "0",
  price: "0",
  tax_rate: "",
  track_stock: true,
  reorder_level: "0",
  is_active: true,
  category_id: "none",
};

function ProductsPage() {
  const { org, can, profile } = useAuth();
  const qc = useQueryClient();
  const currency = org?.currency ?? "SAR";
  const editable = can("products.edit");

  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [newCategory, setNewCategory] = useState("");

  const products = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, name, sku, barcode, unit, cost, price, tax_rate, track_stock, reorder_level, is_active, category_id",
        )
        .order("name");
      if (error) throw error;
      return (data ?? []) as Product[];
    },
  });

  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        org_id: profile!.org_id!,
        name: form.name.trim(),
        sku: form.sku.trim() || null,
        barcode: form.barcode.trim() || null,
        unit: form.unit.trim() || "piece",
        cost: Number(form.cost) || 0,
        price: Number(form.price) || 0,
        tax_rate: form.tax_rate === "" ? null : Number(form.tax_rate),
        track_stock: form.track_stock,
        reorder_level: Number(form.reorder_level) || 0,
        is_active: form.is_active,
        category_id: form.category_id === "none" ? null : form.category_id,
      };
      if (editingId) {
        const { error } = await supabase.from("products").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("products").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingId ? "تم تحديث المنتج" : "تمت إضافة المنتج");
      setDialogOpen(false);
      setEditingId(null);
      setForm({ ...EMPTY });
      void qc.invalidateQueries({ queryKey: ["products"] });
      void qc.invalidateQueries({ queryKey: ["pos-products"] });
    },
    onError: (e: Error) =>
      toast.error(e.message.includes("duplicate") ? "الباركود مستخدم بالفعل" : "تعذر الحفظ"),
  });

  const addCategory = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("categories")
        .insert({ org_id: profile!.org_id!, name: newCategory.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewCategory("");
      toast.success("تم إضافة التصنيف");
      void qc.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: () => toast.error("تعذر إضافة التصنيف"),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (products.data ?? []).filter(
      (p) =>
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.barcode ?? "").toLowerCase().includes(q) ||
        (p.sku ?? "").toLowerCase().includes(q),
    );
  }, [products.data, search]);

  function openNew() {
    setEditingId(null);
    setForm({ ...EMPTY });
    setDialogOpen(true);
  }

  function openEdit(p: Product) {
    setEditingId(p.id);
    setForm({
      name: p.name,
      sku: p.sku ?? "",
      barcode: p.barcode ?? "",
      unit: p.unit,
      cost: String(p.cost),
      price: String(p.price),
      tax_rate: p.tax_rate == null ? "" : String(p.tax_rate),
      track_stock: p.track_stock,
      reorder_level: String(p.reorder_level),
      is_active: p.is_active,
      category_id: p.category_id ?? "none",
    });
    setDialogOpen(true);
  }

  return (
    <div>
      <PageHeader title="المنتجات" description="الأسعار والتكاليف والباركود وحد الطلب.">
        {editable && (
          <Button onClick={openNew}>
            <Plus className="size-4" /> منتج جديد
          </Button>
        )}
      </PageHeader>

      <div className="space-y-4 p-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="ابحث بالاسم أو الباركود"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pe-9"
            />
          </div>
          {editable && (
            <div className="flex items-center gap-2">
              <Input
                placeholder="تصنيف جديد"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="w-40"
              />
              <Button
                variant="outline"
                disabled={!newCategory.trim() || addCategory.isPending}
                onClick={() => addCategory.mutate()}
              >
                إضافة تصنيف
              </Button>
            </div>
          )}
        </div>

        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>المنتج</TableHead>
                <TableHead>الباركود</TableHead>
                <TableHead>التكلفة</TableHead>
                <TableHead>سعر البيع</TableHead>
                <TableHead>حد الطلب</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell dir="ltr" className="text-muted-foreground">
                    {p.barcode ?? "—"}
                  </TableCell>
                  <TableCell>{money(p.cost, currency)}</TableCell>
                  <TableCell className="font-bold">{money(p.price, currency)}</TableCell>
                  <TableCell>{num(p.reorder_level)}</TableCell>
                  <TableCell>
                    <Badge variant={p.is_active ? "default" : "secondary"}>
                      {p.is_active ? "مفعّل" : "موقوف"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-end">
                    {editable && (
                      <Button size="sm" variant="ghost" onClick={() => openEdit(p)}>
                        <Pencil className="size-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!filtered.length && (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    لا توجد منتجات — ابدأ بإضافة منتجك الأول.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "تعديل منتج" : "منتج جديد"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="p-name">اسم المنتج</Label>
              <Input
                id="p-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-barcode">الباركود</Label>
              <Input
                id="p-barcode"
                dir="ltr"
                value={form.barcode}
                onChange={(e) => setForm({ ...form, barcode: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-sku">رمز داخلي (SKU)</Label>
              <Input
                id="p-sku"
                dir="ltr"
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-cost">التكلفة</Label>
              <Input
                id="p-cost"
                type="number"
                step="0.01"
                value={form.cost}
                onChange={(e) => setForm({ ...form, cost: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-price">سعر البيع</Label>
              <Input
                id="p-price"
                type="number"
                step="0.01"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-unit">الوحدة</Label>
              <Input
                id="p-unit"
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-tax">ضريبة خاصة % (اختياري)</Label>
              <Input
                id="p-tax"
                type="number"
                step="0.01"
                value={form.tax_rate}
                onChange={(e) => setForm({ ...form, tax_rate: e.target.value })}
                placeholder={String(org?.tax_rate ?? 0)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-reorder">حد إعادة الطلب</Label>
              <Input
                id="p-reorder"
                type="number"
                step="0.01"
                value={form.reorder_level}
                onChange={(e) => setForm({ ...form, reorder_level: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>التصنيف</Label>
              <Select
                value={form.category_id}
                onValueChange={(v) => setForm({ ...form, category_id: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون تصنيف</SelectItem>
                  {(categories.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label htmlFor="p-track">تتبع المخزون</Label>
              <Switch
                id="p-track"
                checked={form.track_stock}
                onCheckedChange={(v) => setForm({ ...form, track_stock: v })}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label htmlFor="p-active">مفعّل للبيع</Label>
              <Switch
                id="p-active"
                checked={form.is_active}
                onCheckedChange={(v) => setForm({ ...form, is_active: v })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              إلغاء
            </Button>
            <Button disabled={!form.name.trim() || save.isPending} onClick={() => save.mutate()}>
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
