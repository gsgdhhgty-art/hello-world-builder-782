import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Boxes, CircleDollarSign, Package, Search, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dateTime, money, num } from "@/lib/format";
import { resolveProductImages } from "@/lib/product-images";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/inventory")({
  head: () => ({ meta: [
    { title: "إدارة المخزون — SmartPOS" },
    { name: "description", content: "الأرصدة والقيمة وحركات المخزون والجرد لكل مستودع." },
    { property: "og:title", content: "إدارة المخزون — SmartPOS" },
    { property: "og:description", content: "متابعة المخزون وحركاته لحظيًا." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: InventoryPage,
});

const MOVEMENT_LABELS: Record<string, string> = { SALE: "بيع", PURCHASE: "وارد مشتريات", RETURN: "مرتجع", ADJUSTMENT: "تسوية جرد" };

function InventoryPage() {
  const { can, profile, org } = useAuth();
  const qc = useQueryClient();
  const canEdit = can("inventory.edit");
  const currency = org?.currency ?? "SAR";
  const [search, setSearch] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [stockFilter, setStockFilter] = useState("all");
  const [adjust, setAdjust] = useState<null | { productId: string; name: string; current: number }>(null);
  const [newQty, setNewQty] = useState("0");
  const [note, setNote] = useState("");

  const warehouses = useQuery({
    queryKey: ["warehouses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("warehouses").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    const first = warehouses.data?.[0];
    if (!warehouseId && first) setWarehouseId(first.id);
  }, [warehouseId, warehouses.data]);

  const products = useQuery({
    queryKey: ["products-lite"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("id, name, sku, unit, cost, reorder_level, track_stock, image_url").eq("is_active", true).order("name");
      if (error) throw error;
      return resolveProductImages(data ?? []);
    },
  });

  const inventory = useQuery({
    queryKey: ["inventory", warehouseId],
    enabled: Boolean(warehouseId),
    queryFn: async () => {
      const { data, error } = await supabase.from("inventory").select("product_id, quantity").eq("warehouse_id", warehouseId);
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((row) => [row.product_id, Number(row.quantity)])) as Record<string, number>;
    },
  });

  const movements = useQuery({
    queryKey: ["movements", warehouseId],
    enabled: Boolean(warehouseId),
    queryFn: async () => {
      const { data, error } = await supabase.from("stock_movements").select("id, product_id, qty_change, movement_type, note, created_at, user_id").eq("warehouse_id", warehouseId).order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const saveAdjust = useMutation({
    mutationFn: async () => {
      const orgId = profile?.org_id;
      if (!adjust || !orgId || !warehouseId) throw new Error("بيانات الجرد غير مكتملة");
      if (!note.trim()) throw new Error("سبب التسوية مطلوب");
      const target = Math.max(0, Number(newQty) || 0);
      const diff = target - adjust.current;
      const { error } = await supabase.from("inventory").upsert({ org_id: orgId, product_id: adjust.productId, warehouse_id: warehouseId, quantity: target }, { onConflict: "product_id,warehouse_id" });
      if (error) throw error;
      const { error: movementError } = await supabase.from("stock_movements").insert({ org_id: orgId, product_id: adjust.productId, warehouse_id: warehouseId, qty_change: diff, movement_type: "ADJUSTMENT", note: note.trim(), user_id: profile.id });
      if (movementError) throw movementError;
    },
    onSuccess: () => {
      toast.success("تم اعتماد رصيد الجرد");
      setAdjust(null); setNote("");
      void qc.invalidateQueries({ queryKey: ["inventory"] });
      void qc.invalidateQueries({ queryKey: ["movements"] });
      void qc.invalidateQueries({ queryKey: ["pos-stock"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const balances = inventory.data ?? {};
    return (products.data ?? []).map((product) => ({ ...product, qty: balances[product.id] ?? 0 })).filter((product) => {
      const matches = !query || product.name.toLowerCase().includes(query) || (product.sku ?? "").toLowerCase().includes(query);
      const low = product.qty > 0 && product.qty <= Number(product.reorder_level);
      const out = product.qty <= 0;
      return matches && (stockFilter === "all" || (stockFilter === "low" && low) || (stockFilter === "out" && out));
    });
  }, [products.data, inventory.data, search, stockFilter]);

  const allRows = useMemo(() => {
    const balances = inventory.data ?? {};
    return (products.data ?? []).map((product) => ({ ...product, qty: balances[product.id] ?? 0 }));
  }, [products.data, inventory.data]);
  const stockValue = allRows.reduce((sum, product) => sum + product.qty * Number(product.cost), 0);
  const lowCount = allRows.filter((product) => product.qty > 0 && product.qty <= Number(product.reorder_level)).length;
  const outCount = allRows.filter((product) => product.qty <= 0).length;
  const nameOf = (id: string) => products.data?.find((product) => product.id === id)?.name ?? "—";

  if (!can("inventory.view")) return <div className="p-10 text-center text-muted-foreground">لا تملك صلاحية المخزون.</div>;

  return (
    <div className="pb-8">
      <PageHeader title="إدارة المخزون" description="الأرصدة الفعلية وحركة كل مستودع" />
      <div className="space-y-4 px-4 sm:px-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric icon={Package} label="إجمالي المنتجات" value={num(allRows.length)} tone="primary" />
          <Metric icon={CircleDollarSign} label="قيمة المخزون" value={money(stockValue, currency)} tone="purple" />
          <Metric icon={AlertTriangle} label="مخزون منخفض" value={num(lowCount)} tone="warning" />
          <Metric icon={Boxes} label="منتجات نافدة" value={num(outCount)} tone="danger" />
        </div>

        <div className="workspace-card overflow-hidden">
          <div className="grid gap-3 border-b p-3 sm:grid-cols-[minmax(220px,1fr)_200px_170px]">
            <div className="relative"><Search className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="h-10 pe-9" placeholder="ابحث عن منتج أو SKU" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
            <Select value={warehouseId} onValueChange={setWarehouseId}><SelectTrigger><SelectValue placeholder="المستودع" /></SelectTrigger><SelectContent>{(warehouses.data ?? []).map((warehouse) => <SelectItem key={warehouse.id} value={warehouse.id}>{warehouse.name}</SelectItem>)}</SelectContent></Select>
            <Select value={stockFilter} onValueChange={setStockFilter}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">كل المخزون</SelectItem><SelectItem value="low">منخفض</SelectItem><SelectItem value="out">نافد</SelectItem></SelectContent></Select>
          </div>
          <Table><TableHeader><TableRow><TableHead>المنتج</TableHead><TableHead>الرصيد الحالي</TableHead><TableHead>حد الطلب</TableHead><TableHead>قيمة المخزون</TableHead><TableHead>الحالة</TableHead><TableHead /></TableRow></TableHeader><TableBody>
            {rows.map((product) => {
              const low = product.qty > 0 && product.qty <= Number(product.reorder_level);
              const out = product.qty <= 0;
              return <TableRow key={product.id}><TableCell><div className="flex min-w-44 items-center gap-3"><div className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-lg border bg-muted/40">{product.image_url ? <img src={product.image_url} alt={product.name} className="size-full object-contain p-1" /> : <Package className="size-5 text-muted-foreground" />}</div><div className="min-w-0"><div className="truncate font-bold">{product.name}</div><div className="text-xs text-muted-foreground">{product.sku ?? product.unit}</div></div></div></TableCell><TableCell className={cn("font-black tabular-nums", out ? "text-destructive" : low ? "text-warning" : "text-success")}>{num(product.qty)} {product.unit}</TableCell><TableCell className="tabular-nums">{num(product.reorder_level)}</TableCell><TableCell className="font-semibold tabular-nums">{money(product.qty * Number(product.cost), currency)}</TableCell><TableCell><Badge variant="outline" className={out ? "border-destructive/20 bg-destructive/10 text-destructive" : low ? "status-warning border-0" : "status-success border-0"}>{out ? "نافد" : low ? "منخفض" : "متوفر"}</Badge></TableCell><TableCell className="text-end">{canEdit && product.track_stock ? <Button size="sm" variant="outline" onClick={() => { setAdjust({ productId: product.id, name: product.name, current: product.qty }); setNewQty(String(product.qty)); }}><SlidersHorizontal /> جرد</Button> : null}</TableCell></TableRow>;
            })}
            {!rows.length && <TableRow><TableCell colSpan={6} className="py-12 text-center text-muted-foreground">لا توجد منتجات مطابقة.</TableCell></TableRow>}
          </TableBody></Table>
        </div>

        <div className="workspace-card overflow-hidden"><div className="border-b p-4"><h2 className="font-black">سجل حركة المخزون</h2><p className="mt-1 text-xs text-muted-foreground">الوارد والمنصرف والمرتجعات وتسويات الجرد</p></div><Table><TableHeader><TableRow><TableHead>المنتج</TableHead><TableHead>نوع الحركة</TableHead><TableHead>التغيير</TableHead><TableHead>السبب</TableHead><TableHead>التاريخ والوقت</TableHead></TableRow></TableHeader><TableBody>{(movements.data ?? []).map((movement) => <TableRow key={movement.id}><TableCell className="font-bold">{nameOf(movement.product_id)}</TableCell><TableCell>{MOVEMENT_LABELS[movement.movement_type] ?? movement.movement_type}</TableCell><TableCell className={cn("font-black tabular-nums", Number(movement.qty_change) < 0 ? "text-destructive" : "text-success")}>{Number(movement.qty_change) > 0 ? "+" : ""}{num(movement.qty_change)}</TableCell><TableCell className="max-w-64 truncate text-muted-foreground">{movement.note ?? "—"}</TableCell><TableCell className="tabular-nums">{dateTime(movement.created_at)}</TableCell></TableRow>)}{!movements.data?.length && <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">لا توجد حركات بعد.</TableCell></TableRow>}</TableBody></Table></div>
      </div>

      <Dialog open={Boolean(adjust)} onOpenChange={(open) => !open && setAdjust(null)}><DialogContent><DialogHeader><DialogTitle>جرد: {adjust?.name}</DialogTitle></DialogHeader><div className="space-y-4"><div className="rounded-lg bg-muted/40 p-3 text-sm">الرصيد المسجل: <strong>{num(adjust?.current ?? 0)}</strong></div><div className="space-y-2"><Label htmlFor="qty">الرصيد الفعلي</Label><Input id="qty" type="number" min="0" step="0.001" value={newQty} onChange={(event) => setNewQty(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="reason">سبب التسوية</Label><Input id="reason" value={note} onChange={(event) => setNote(event.target.value)} placeholder="مثال: نتيجة الجرد الفعلي" /></div></div><DialogFooter><Button variant="outline" onClick={() => setAdjust(null)}>إلغاء</Button><Button disabled={saveAdjust.isPending || !note.trim()} onClick={() => saveAdjust.mutate()}>اعتماد الجرد</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}

function Metric({ icon: Icon, label, value, tone }: { icon: typeof Package; label: string; value: string; tone: "primary" | "purple" | "warning" | "danger" }) {
  const tones = { primary: "bg-primary/10 text-primary", purple: "bg-chart-4/10 text-chart-4", warning: "bg-warning/15 text-warning", danger: "bg-destructive/10 text-destructive" };
  return <div className="workspace-card grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 p-4"><div className="min-w-0"><div className="truncate text-xs font-semibold text-muted-foreground">{label}</div><div className="mt-1 truncate text-xl font-black tabular-nums">{value}</div></div><span className={cn("grid size-11 shrink-0 place-items-center rounded-xl", tones[tone])}><Icon className="size-5" /></span></div>;
}