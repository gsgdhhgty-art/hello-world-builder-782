import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Barcode,
  Boxes,
  ImagePlus,
  Package,
  Pencil,
  Printer,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
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
import { removeProductImage, resolveProductImages, uploadProductImage } from "@/lib/product-images";
import { cn } from "@/lib/utils";
import { printProductLabel } from "@/lib/barcode-label";

export const Route = createFileRoute("/_authenticated/products")({
  head: () => ({
    meta: [
      { title: "إدارة المنتجات — SmartPOS" },
      { name: "description", content: "إدارة صور المنتجات والأسعار والباركود والمخزون." },
      { property: "og:title", content: "إدارة المنتجات — SmartPOS" },
      { property: "og:description", content: "كتالوج المنتجات الكامل لمتجرك." },
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
  wholesale_price: number;
  tax_rate: number | null;
  track_stock: boolean;
  reorder_level: number;
  is_active: boolean;
  category_id: string | null;
  supplier_id: string | null;
  brand_id: string | null;
  description: string | null;
  expires_at: string | null;
  image_url: string | null;
  image_src?: string | null;
  created_at: string;
  updated_at: string;
}

const EMPTY = {
  name: "",
  sku: "",
  barcode: "",
  unit: "piece",
  cost: "0",
  price: "0",
  wholesale_price: "0",
  tax_rate: "",
  track_stock: true,
  reorder_level: "0",
  is_active: true,
  category_id: "none",
  supplier_id: "none",
  brand_id: "none",
  description: "",
  expires_at: "",
};

function ProductsPage() {
  const { org, can, profile } = useAuth();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const currency = org?.currency ?? "EGP";
  const editable = can("products.edit");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [newCategory, setNewCategory] = useState("");
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [storedImage, setStoredImage] = useState<string | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    return () => {
      if (imagePreview?.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  const products = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, name, sku, barcode, unit, cost, price, wholesale_price, tax_rate, track_stock, reorder_level, is_active, category_id, supplier_id, brand_id, description, expires_at, image_url, created_at, updated_at",
        )
        .order("updated_at", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as Product[];
      const resolved = await resolveProductImages(rows);
      return resolved.map((row, index) => ({
        ...row,
        image_url: rows[index]?.image_url ?? null,
        image_src: row.image_url,
      }));
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

  const suppliers = useQuery({
    queryKey: ["suppliers-lite"],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const brands = useQuery({
    queryKey: ["brands"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brands")
        .select("id, name, description")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const orgId = profile?.org_id;
      if (!orgId) throw new Error("تعذر تحديد المؤسسة");
      if (!form.name.trim()) throw new Error("اسم المنتج مطلوب");
      if (Number(form.price) < 0 || Number(form.cost) < 0 || Number(form.wholesale_price) < 0) {
        throw new Error("الأسعار لا يمكن أن تكون سالبة");
      }
      const productId = editingId ?? crypto.randomUUID();
      let nextImage = storedImage;
      let uploadedPath: string | null = null;
      if (imageFile) {
        uploadedPath = await uploadProductImage(orgId, productId, imageFile);
        nextImage = uploadedPath;
      } else if (removeImage) {
        nextImage = null;
      }
      let barcode = form.barcode.trim();
      if (!barcode) {
        const generated = await supabase.rpc("generate_product_barcode");
        if (generated.error || !generated.data) {
          throw new Error(generated.error?.message ?? "تعذر توليد باركود فريد");
        }
        barcode = generated.data;
      }
      const payload = {
        id: productId,
        org_id: orgId,
        name: form.name.trim(),
        sku: form.sku.trim() || null,
        barcode,
        unit: form.unit.trim() || "piece",
        cost: Number(form.cost) || 0,
        price: Number(form.price) || 0,
        wholesale_price: Number(form.wholesale_price) || 0,
        tax_rate: form.tax_rate === "" ? null : Number(form.tax_rate),
        track_stock: form.track_stock,
        reorder_level: Number(form.reorder_level) || 0,
        is_active: form.is_active,
        category_id: form.category_id === "none" ? null : form.category_id,
        supplier_id: form.supplier_id === "none" ? null : form.supplier_id,
        brand_id: form.brand_id === "none" ? null : form.brand_id,
        description: form.description.trim() || null,
        expires_at: form.expires_at || null,
        image_url: nextImage,
      };
      const result = editingId
        ? await supabase.from("products").update(payload).eq("id", editingId)
        : await supabase.from("products").insert(payload);
      if (result.error) {
        if (uploadedPath) await removeProductImage(uploadedPath);
        throw result.error;
      }
      if ((imageFile || removeImage) && storedImage && storedImage !== nextImage) {
        await removeProductImage(storedImage);
      }
    },
    onSuccess: () => {
      toast.success(editingId ? "تم تحديث المنتج والصورة" : "تمت إضافة المنتج");
      closeEditor();
      void qc.invalidateQueries({ queryKey: ["products"] });
      void qc.invalidateQueries({ queryKey: ["pos-products"] });
    },
    onError: (error: Error) =>
      toast.error(error.message.includes("duplicate") ? "الباركود مستخدم بالفعل" : error.message),
  });

  const addCategory = useMutation({
    mutationFn: async () => {
      const orgId = profile?.org_id;
      if (!orgId) throw new Error("تعذر تحديد المؤسسة");
      const name = newCategory.trim();
      if (!name) throw new Error("اسم التصنيف مطلوب");
      const { data, error } = await supabase
        .from("categories")
        .insert({ org_id: orgId, name })
        .select("id, name")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (category) => {
      setNewCategory("");
      setCategoryDialogOpen(false);
      setForm((current) => ({ ...current, category_id: category.id }));
      toast.success("تمت إضافة التصنيف");
      void qc.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: (error: { code?: string; message?: string }) =>
      toast.error(error.code === "23505" ? "هذا التصنيف موجود بالفعل" : "تعذر إضافة التصنيف"),
  });

  const generateBarcode = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("generate_product_barcode");
      if (error || !data) throw new Error(error?.message ?? "تعذر توليد الباركود");
      return data;
    },
    onSuccess: (barcode) => {
      setForm((current) => ({ ...current, barcode }));
      toast.success("تم توليد باركود EAN-13 فريد");
    },
    onError: () => toast.error("تعذر توليد باركود فريد"),
  });

  const removeProduct = useMutation({
    mutationFn: async (product: Product) => {
      if (!window.confirm(`حذف ${product.name}؟ لن يمكن التراجع عن ذلك.`)) return false;
      const { error } = await supabase.from("products").delete().eq("id", product.id);
      if (error) throw error;
      await removeProductImage(product.image_url);
      return true;
    },
    onSuccess: (removed) => {
      if (!removed) return;
      toast.success("تم حذف المنتج وصورته بأمان");
      void qc.invalidateQueries({ queryKey: ["products"] });
      void qc.invalidateQueries({ queryKey: ["pos-products"] });
    },
    onError: () => toast.error("تعذر حذف المنتج لأنه مرتبط بحركات مسجلة"),
  });

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (products.data ?? []).filter((product) => {
      const matchesSearch =
        !query ||
        product.name.toLowerCase().includes(query) ||
        (product.barcode ?? "").toLowerCase().includes(query) ||
        (product.sku ?? "").toLowerCase().includes(query);
      const matchesCategory = categoryFilter === "all" || product.category_id === categoryFilter;
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" ? product.is_active : !product.is_active);
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [products.data, search, categoryFilter, statusFilter]);

  function resetImage() {
    if (imagePreview?.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
    setImageFile(null);
    setImagePreview(null);
    setStoredImage(null);
    setRemoveImage(false);
  }

  function closeEditor() {
    setDialogOpen(false);
    setEditingId(null);
    setForm({ ...EMPTY });
    resetImage();
  }

  function openNew() {
    setEditingId(null);
    setForm({ ...EMPTY });
    resetImage();
    setDialogOpen(true);
  }

  function openEdit(product: Product) {
    setEditingId(product.id);
    setForm({
      name: product.name,
      sku: product.sku ?? "",
      barcode: product.barcode ?? "",
      unit: product.unit,
      cost: String(product.cost),
      price: String(product.price),
      wholesale_price: String(product.wholesale_price),
      tax_rate: product.tax_rate == null ? "" : String(product.tax_rate),
      track_stock: product.track_stock,
      reorder_level: String(product.reorder_level),
      is_active: product.is_active,
      category_id: product.category_id ?? "none",
      supplier_id: product.supplier_id ?? "none",
      brand_id: product.brand_id ?? "none",
      description: product.description ?? "",
      expires_at: product.expires_at ?? "",
    });
    setImageFile(null);
    setStoredImage(product.image_url);
    setImagePreview(product.image_src ?? null);
    setRemoveImage(false);
    setDialogOpen(true);
  }

  function chooseImage(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("اختر ملف صورة صالحًا");
      return;
    }
    if (imagePreview?.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setRemoveImage(false);
  }

  const counts = {
    total: products.data?.length ?? 0,
    active: products.data?.filter((product) => product.is_active).length ?? 0,
    images: products.data?.filter((product) => product.image_url).length ?? 0,
  };

  return (
    <div className="pb-8">
      <PageHeader title="إدارة المنتجات" description="إدارة بيانات وصور وأسعار منتجات متجرك">
        {editable && (
          <Button onClick={openNew}>
            <Plus /> إضافة منتج
          </Button>
        )}
      </PageHeader>

      <div className="page-canvas space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Summary
            icon={Package}
            label="إجمالي المنتجات"
            value={num(counts.total)}
            tone="primary"
          />
          <Summary icon={Boxes} label="منتجات مفعلة" value={num(counts.active)} tone="success" />
          <Summary icon={ImagePlus} label="منتجات بصور" value={num(counts.images)} tone="purple" />
        </div>

        <div className="workspace-card overflow-hidden">
          <div className="grid gap-3 border-b p-3 md:grid-cols-[minmax(240px,1fr)_180px_160px_auto]">
            <div className="relative min-w-0">
              <Search className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-10 pe-10"
                placeholder="ابحث باسم المنتج أو SKU أو الباركود"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger>
                <SelectValue placeholder="كل التصنيفات" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل التصنيفات</SelectItem>
                {(categories.data ?? []).map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الحالات</SelectItem>
                <SelectItem value="active">مفعّل</SelectItem>
                <SelectItem value="inactive">موقوف</SelectItem>
              </SelectContent>
            </Select>
            {editable && (
              <div className="flex gap-2">
                <Input
                  className="w-36"
                  placeholder="تصنيف جديد"
                  value={newCategory}
                  onChange={(event) => setNewCategory(event.target.value)}
                />
                <Button
                  variant="outline"
                  disabled={!newCategory.trim() || addCategory.isPending}
                  onClick={() => addCategory.mutate()}
                >
                  إضافة
                </Button>
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>المنتج</TableHead>
                  <TableHead>الباركود</TableHead>
                  <TableHead>التصنيف</TableHead>
                  <TableHead>التكلفة</TableHead>
                  <TableHead>سعر البيع</TableHead>
                  <TableHead>حد الطلب</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell>
                      <div className="flex min-w-44 items-center gap-3">
                        <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg border bg-muted/40">
                          {product.image_src ? (
                            <img
                              src={product.image_src}
                              alt={product.name}
                              className="size-full object-contain p-1"
                            />
                          ) : (
                            <Package className="size-5 text-muted-foreground" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate font-bold">{product.name}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {product.sku ?? "بدون SKU"}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell dir="ltr" className="tabular-nums text-muted-foreground">
                      {product.barcode ?? "—"}
                    </TableCell>
                    <TableCell>
                      {categories.data?.find((category) => category.id === product.category_id)
                        ?.name ?? "غير مصنف"}
                    </TableCell>
                    <TableCell className="tabular-nums">{money(product.cost, currency)}</TableCell>
                    <TableCell className="font-black tabular-nums text-primary">
                      {money(product.price, currency)}
                    </TableCell>
                    <TableCell className="tabular-nums">{num(product.reorder_level)}</TableCell>
                    <TableCell>
                      <Badge
                        className={product.is_active ? "status-success border-0" : ""}
                        variant={product.is_active ? "outline" : "secondary"}
                      >
                        {product.is_active ? "متوفر" : "موقوف"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-end">
                      {editable && (
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`طباعة ملصق ${product.name}`}
                            disabled={!product.barcode}
                            onClick={() => {
                              try {
                                printProductLabel({
                                  name: product.name,
                                  barcode: product.barcode,
                                  price: product.price,
                                  currency,
                                });
                              } catch (error) {
                                toast.error(
                                  error instanceof Error ? error.message : "تعذرت الطباعة",
                                );
                              }
                            }}
                          >
                            <Printer />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`تعديل ${product.name}`}
                            onClick={() => openEdit(product)}
                          >
                            <Pencil />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`حذف ${product.name}`}
                            disabled={removeProduct.isPending}
                            onClick={() => removeProduct.mutate(product)}
                          >
                            <Trash2 className="text-destructive" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {!filtered.length && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-14 text-center text-muted-foreground">
                      <Package className="mx-auto mb-2 size-8 opacity-40" />
                      لا توجد منتجات مطابقة.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => (open ? setDialogOpen(true) : closeEditor())}
      >
        <DialogContent className="max-h-[92vh] max-w-4xl gap-0 overflow-y-auto p-0">
          <DialogHeader className="border-b bg-muted/25 px-5 py-4">
            <DialogTitle>{editingId ? "تعديل المنتج" : "إضافة منتج جديد"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-5 p-5 md:grid-cols-[230px_minmax(0,1fr)]">
            <div className="space-y-3">
              <Label>صورة المنتج</Label>
              <button
                type="button"
                className={cn(
                  "relative grid aspect-square w-full place-items-center overflow-hidden rounded-xl border-2 border-dashed bg-muted/25 transition",
                  dragging
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50",
                )}
                onClick={() => fileRef.current?.click()}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  chooseImage(event.dataTransfer.files[0]);
                }}
              >
                {imagePreview && !removeImage ? (
                  <img
                    src={imagePreview}
                    alt="معاينة المنتج"
                    className="size-full object-contain p-3"
                  />
                ) : (
                  <div className="p-4 text-center">
                    <UploadCloud className="mx-auto mb-3 size-9 text-primary" />
                    <div className="text-sm font-bold">اسحب الصورة هنا</div>
                    <div className="mt-1 text-xs text-muted-foreground">أو اخترها من جهازك</div>
                    <div className="mt-2 text-[10px] text-muted-foreground">
                      PNG, JPG, WEBP · حتى 12MB
                    </div>
                  </div>
                )}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(event) => chooseImage(event.target.files?.[0])}
              />
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileRef.current?.click()}
                >
                  <ImagePlus />
                  {imagePreview ? "تغيير" : "اختيار"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!imagePreview}
                  onClick={() => {
                    if (imagePreview?.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
                    setImageFile(null);
                    setImagePreview(null);
                    setRemoveImage(true);
                  }}
                >
                  <Trash2 className="text-destructive" />
                  حذف
                </Button>
              </div>
              <p className="text-[11px] leading-5 text-muted-foreground">
                تُضغط الصورة تلقائيًا وتُحفظ في مساحة خاصة بمؤسستك.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="اسم المنتج" id="p-name" required>
                <Input
                  id="p-name"
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                />
              </Field>
              <Field label="التصنيف">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                  <Select
                    value={form.category_id}
                    onValueChange={(value) => setForm({ ...form, category_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">بدون تصنيف</SelectItem>
                      {(categories.data ?? []).map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="إضافة تصنيف"
                    title="إضافة تصنيف"
                    onClick={() => setCategoryDialogOpen(true)}
                  >
                    <Plus />
                  </Button>
                </div>
              </Field>
              <Field label="SKU" id="p-sku">
                <Input
                  id="p-sku"
                  dir="ltr"
                  value={form.sku}
                  onChange={(event) => setForm({ ...form, sku: event.target.value })}
                />
              </Field>
              <Field label="الباركود" id="p-barcode">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                  <div className="relative">
                    <Barcode className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="p-barcode"
                      dir="ltr"
                      className="pe-9"
                      value={form.barcode}
                      onChange={(event) => setForm({ ...form, barcode: event.target.value })}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    disabled={generateBarcode.isPending}
                    aria-label="توليد باركود فريد"
                    title="توليد باركود EAN-13 فريد"
                    onClick={() => generateBarcode.mutate()}
                  >
                    <RefreshCw className={cn(generateBarcode.isPending && "animate-spin")} />
                  </Button>
                </div>
              </Field>
              <Field label="سعر التكلفة" id="p-cost">
                <Input
                  id="p-cost"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.cost}
                  onChange={(event) => setForm({ ...form, cost: event.target.value })}
                />
              </Field>
              <Field label="سعر البيع" id="p-price" required>
                <Input
                  id="p-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.price}
                  onChange={(event) => setForm({ ...form, price: event.target.value })}
                />
              </Field>
              <Field label="سعر الجملة" id="p-wholesale">
                <Input
                  id="p-wholesale"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.wholesale_price}
                  onChange={(event) => setForm({ ...form, wholesale_price: event.target.value })}
                />
              </Field>
              <Field label="الوحدة" id="p-unit">
                <Input
                  id="p-unit"
                  value={form.unit}
                  onChange={(event) => setForm({ ...form, unit: event.target.value })}
                />
              </Field>
              <Field label="حد إعادة الطلب" id="p-reorder">
                <Input
                  id="p-reorder"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.reorder_level}
                  onChange={(event) => setForm({ ...form, reorder_level: event.target.value })}
                />
              </Field>
              <Field label="ضريبة خاصة %" id="p-tax">
                <Input
                  id="p-tax"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={form.tax_rate}
                  onChange={(event) => setForm({ ...form, tax_rate: event.target.value })}
                  placeholder={String(org?.tax_rate ?? 0)}
                />
              </Field>
              <Field label="المورد">
                <Select
                  value={form.supplier_id}
                  onValueChange={(value) => setForm({ ...form, supplier_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">بدون مورد</SelectItem>
                    {(suppliers.data ?? []).map((supplier) => (
                      <SelectItem key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="العلامة التجارية">
                <Select
                  value={form.brand_id}
                  onValueChange={(value) => setForm({ ...form, brand_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">بدون علامة</SelectItem>
                    {(brands.data ?? []).map((brand) => (
                      <SelectItem key={brand.id} value={brand.id}>
                        {brand.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="تاريخ الصلاحية" id="p-expiry">
                <Input
                  id="p-expiry"
                  type="date"
                  value={form.expires_at}
                  onChange={(event) => setForm({ ...form, expires_at: event.target.value })}
                />
              </Field>
              <Field label="وصف المنتج" className="sm:col-span-2">
                <Textarea
                  rows={3}
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                />
              </Field>
              <div className="flex items-center justify-between rounded-lg border bg-muted/20 p-3">
                <Label htmlFor="p-track">تتبع المخزون</Label>
                <Switch
                  id="p-track"
                  checked={form.track_stock}
                  onCheckedChange={(value) => setForm({ ...form, track_stock: value })}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border bg-muted/20 p-3">
                <Label htmlFor="p-active">متاح للبيع</Label>
                <Switch
                  id="p-active"
                  checked={form.is_active}
                  onCheckedChange={(value) => setForm({ ...form, is_active: value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter className="border-t bg-muted/20 p-4">
            <Button variant="outline" onClick={closeEditor}>
              إلغاء
            </Button>
            <Button disabled={!form.name.trim() || save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? "جارٍ الحفظ..." : "حفظ المنتج"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>إضافة تصنيف جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="new-product-category">اسم التصنيف</Label>
            <Input
              id="new-product-category"
              autoFocus
              value={newCategory}
              onChange={(event) => setNewCategory(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && newCategory.trim()) addCategory.mutate();
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCategoryDialogOpen(false)}>
              إلغاء
            </Button>
            <Button
              disabled={!newCategory.trim() || addCategory.isPending}
              onClick={() => addCategory.mutate()}
            >
              <Plus /> إضافة التصنيف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({
  label,
  id,
  required,
  className,
  children,
}: {
  label: string;
  id?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={id}>
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      {children}
    </div>
  );
}

function Summary({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Package;
  label: string;
  value: string;
  tone: "primary" | "success" | "purple";
}) {
  const tones = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/12 text-success",
    purple: "bg-chart-4/10 text-chart-4",
  };
  return (
    <div className="workspace-card grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 p-4">
      <div className="min-w-0">
        <div className="text-xs font-semibold text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-black tabular-nums">{value}</div>
      </div>
      <span className={cn("grid size-11 shrink-0 place-items-center rounded-xl", tones[tone])}>
        <Icon className="size-5" />
      </span>
    </div>
  );
}
