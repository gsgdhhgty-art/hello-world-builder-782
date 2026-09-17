import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { dateTime, num } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/inventory")({
  head: () => ({
    meta: [
      { title: "المخزون — كاشير كلاود" },
      { name: "description", content: "أرصدة المخزون لكل مستودع، الجرد اليدوي وحركات المخزون." },
      { property: "og:title", content: "المخزون — كاشير كلاود" },
      { property: "og:description", content: "متابعة أرصدة المخزون وحركاته." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: InventoryPage,
});

function InventoryPage() {
  const { can, profile } = useAuth();
  const qc = useQueryClient();
  const canEdit = can("inventory.edit");
  const [search, setSearch] = useState("");
  const [warehouseId, setWarehouseId] = useState<string>("");
  const [adjust, setAdjust] = useState<null | { productId: string; name: string; current: number }>(
    null,
  );
  const [newQty, setNewQty] = useState("0");
  const [note, setNote] = useState("");

  const warehouses = useQuery({
    queryKey: ["warehouses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("warehouses").select("id, name").order("name");
      if (error) throw error;
      if (data?.length && !warehouseId) setWarehouseId(data[0].id);
      return data ?? [];
    },
  });

  const products = useQuery({
    queryKey: ["products-lite"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, unit, reorder_level, track_stock")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const inventory = useQuery({
    queryKey: ["inventory", warehouseId],
    enabled: Boolean(warehouseId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory")
        .select("product_id, quantity")
        .eq("warehouse_id", warehouseId);
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const r of data ?? []) map[r.product_id] = Number(r.quantity);
      return map;
    },
  });

  const movements = useQuery({
    queryKey: ["movements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_movements")
        .select("id, product_id, qty_change, movement_type, note, created_at")
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data ?? [];
    },
  });

  const saveAdjust = useMutation({
    mutationFn: async () => {
      if (!adjust) return;
      const target = Number(newQty) || 0;
      const diff = target - adjust.current;
      const { error } = await supabase
        .from("inventory")
        .upsert(
          {
            org_id: profile!.org_id!,
            product_id: adjust.productId,
            warehouse_id: warehouseId,
            quantity: target,
          },
          { onConflict: "product_id,warehouse_id" },
        );
      if (error) throw error;
      const { error: mErr } = await supabase.from("stock_movements").insert({
        org_id: profile!.org_id!,
        product_id: adjust.productId,
        warehouse_id: warehouseId,
        qty_change: diff,
        movement_type: "ADJUSTMENT",
        note: note || null,
        user_id: profile!.id,
      });
      if (mErr) throw mErr;
    },
    onSuccess: () => {
      toast.success("تم تعديل الرصيد");
      setAdjust(null);
      setNote("");
      void qc.invalidateQueries({ queryKey: ["inventory"] });
      void qc.invalidateQueries({ queryKey: ["movements"] });
      void qc.invalidateQueries({ queryKey: ["pos-stock"] });
    },
    onError: () => toast.error("تعذر تعديل الرصيد"),
  });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const inv = inventory.data ?? {};
    return (products.data ?? [])
      .filter((p) => !q || p.name.toLowerCase().includes(q))
      .map((p) => ({ ...p, qty: inv[p.id] ?? 0 }));
  }, [products.data, inventory.data, search]);

  const nameOf = (id: string) => products.data?.find((p) => p.id === id)?.name ?? "—";

  if (!can("inventory.view")) {
    return <div className="p-10 text-center text-muted-foreground">لا تملك صلاحية المخزون.</div>;
  }

  return (
    <div>
      <PageHeader title="المخزون" description="أرصدة كل مستودع وحركات الدخول والخروج." />
      <div className="space-y-6 p-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pe-9"
              placeholder="ابحث عن منتج"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={warehouseId} onValueChange={setWarehouseId}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="المستودع" />
            </SelectTrigger>
            <SelectContent>
              {(warehouses.data ?? []).map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>المنتج</TableHead>
                <TableHead>الرصيد</TableHead>
                <TableHead>حد الطلب</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell
                    className={p.qty <= Number(p.reorder_level) ? "font-bold text-destructive" : ""}
                  >
                    {num(p.qty)} {p.unit}
                  </TableCell>
                  <TableCell>{num(p.reorder_level)}</TableCell>
                  <TableCell className="text-end">
                    {canEdit && p.track_stock && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setAdjust({ productId: p.id, name: p.name, current: p.qty });
                          setNewQty(String(p.qty));
                        }}
                      >
                        <SlidersHorizontal className="size-4" /> جرد
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!rows.length && (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                    لا توجد منتجات.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div>
          <h2 className="mb-3 text-lg font-bold">آخر حركات المخزون</h2>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>المنتج</TableHead>
                  <TableHead>التغيير</TableHead>
                  <TableHead>النوع</TableHead>
                  <TableHead>الوقت</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(movements.data ?? []).map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>{nameOf(m.product_id)}</TableCell>
                    <TableCell className={Number(m.qty_change) < 0 ? "text-destructive" : "text-primary"}>
                      {num(m.qty_change)}
                    </TableCell>
                    <TableCell>
                      {{ SALE: "بيع", PURCHASE: "شراء", RETURN: "مرتجع", ADJUSTMENT: "جرد" }[
                        m.movement_type
                      ] ?? m.movement_type}
                    </TableCell>
                    <TableCell>{dateTime(m.created_at)}</TableCell>
                  </TableRow>
                ))}
                {!movements.data?.length && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                      لا توجد حركات بعد.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      <Dialog open={Boolean(adjust)} onOpenChange={(o) => !o && setAdjust(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>جرد: {adjust?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="qty">الرصيد الفعلي</Label>
              <Input
                id="qty"
                type="number"
                step="0.001"
                value={newQty}
                onChange={(e) => setNewQty(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="n">سبب التعديل</Label>
              <Input id="n" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjust(null)}>
              إلغاء
            </Button>
            <Button disabled={saveAdjust.isPending} onClick={() => saveAdjust.mutate()}>
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
