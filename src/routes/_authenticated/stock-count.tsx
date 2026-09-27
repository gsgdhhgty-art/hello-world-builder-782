import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck, Minus, Plus, ScanBarcode, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { money, num } from "@/lib/format";
import { beep } from "@/lib/feedback";

export const Route = createFileRoute("/_authenticated/stock-count")({
  head: () => ({
    meta: [
      { title: "الجرد الدوري — SmartPOS" },
      { name: "description", content: "عدّ المخزون الفعلي بالباركود ومقارنته بالرصيد المسجل واعتماد الفروقات." },
      { property: "og:title", content: "الجرد الدوري — SmartPOS" },
      { property: "og:description", content: "جرد فعلي بالباركود مع اعتماد الفروقات." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StockCountPage,
});

const draftKey = (w: string) => `smartpos_count_${w}`;

function StockCountPage() {
  const { can, profile, org } = useAuth();
  const qc = useQueryClient();
  const currency = org?.currency ?? "EGP";
  const canEdit = can("inventory.edit");
  const [warehouseId, setWarehouseId] = useState("");
  const [code, setCode] = useState("");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const scanRef = useRef<HTMLInputElement | null>(null);

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

  // مسودة الجرد تُحفظ على الجهاز حتى لا تضيع عند إعادة التحميل
  useEffect(() => {
    if (!warehouseId) return;
    try {
      setCounts(JSON.parse(localStorage.getItem(draftKey(warehouseId)) ?? "{}") as Record<string, number>);
    } catch {
      setCounts({});
    }
  }, [warehouseId]);
  useEffect(() => {
    if (warehouseId) localStorage.setItem(draftKey(warehouseId), JSON.stringify(counts));
  }, [counts, warehouseId]);

  const products = useQuery({
    queryKey: ["count-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku, barcode, unit, cost, track_stock")
        .eq("is_active", true)
        .eq("track_stock", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const inventory = useQuery({
    queryKey: ["inventory", warehouseId],
    enabled: Boolean(warehouseId),
    queryFn: async () => {
      const { data, error } = await supabase.from("inventory").select("product_id, quantity").eq("warehouse_id", warehouseId);
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((r) => [r.product_id, Number(r.quantity)])) as Record<string, number>;
    },
  });

  const rows = useMemo(() => {
    const byId = new Map((products.data ?? []).map((p) => [p.id, p]));
    return Object.entries(counts)
      .map(([id, counted]) => {
        const p = byId.get(id);
        if (!p) return null;
        const system = inventory.data?.[id] ?? 0;
        return { p, counted, system, diff: counted - system };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
  }, [counts, products.data, inventory.data]);

  const diffValue = rows.reduce((s, r) => s + r.diff * Number(r.p.cost), 0);

  const scan = (e: React.FormEvent) => {
    e.preventDefault();
    const q = code.trim();
    if (!q) return;
    const p = (products.data ?? []).find((x) => x.barcode === q || x.sku === q)
      ?? (products.data ?? []).find((x) => x.name.includes(q));
    if (!p) {
      beep("error");
      toast.error("لم يُعثر على المنتج");
    } else {
      beep("ok");
      setCounts((c) => ({ ...c, [p.id]: (c[p.id] ?? 0) + 1 }));
    }
    setCode("");
    scanRef.current?.focus();
  };

  const setQty = (id: string, v: number) => setCounts((c) => ({ ...c, [id]: Math.max(0, v) }));

  const apply = useMutation({
    mutationFn: async () => {
      const orgId = profile?.org_id;
      if (!orgId || !warehouseId) throw new Error("اختر المستودع");
      const changed = rows.filter((r) => r.diff !== 0);
      for (const r of changed) {
        const { error } = await supabase
          .from("inventory")
          .upsert({ org_id: orgId, product_id: r.p.id, warehouse_id: warehouseId, quantity: r.counted }, { onConflict: "product_id,warehouse_id" });
        if (error) throw error;
        const { error: mErr } = await supabase.from("stock_movements").insert({
          org_id: orgId,
          product_id: r.p.id,
          warehouse_id: warehouseId,
          qty_change: r.diff,
          movement_type: "ADJUSTMENT",
          note: "جرد دوري",
          user_id: profile.id,
        });
        if (mErr) throw mErr;
      }
      return changed.length;
    },
    onSuccess: (n) => {
      toast.success(`تم اعتماد الجرد وتسوية ${num(n)} صنف`);
      setCounts({});
      void qc.invalidateQueries({ queryKey: ["inventory"] });
      void qc.invalidateQueries({ queryKey: ["movements"] });
      void qc.invalidateQueries({ queryKey: ["pos-stock"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر اعتماد الجرد"),
  });

  return (
    <div className="pb-10">
      <PageHeader title="الجرد الدوري" description="امسح الأصناف بالباركود أثناء العدّ، ثم راجع الفروقات واعتمدها.">
        <Select value={warehouseId} onValueChange={setWarehouseId}>
          <SelectTrigger className="w-48"><SelectValue placeholder="المستودع" /></SelectTrigger>
          <SelectContent>
            {(warehouses.data ?? []).map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </PageHeader>

      <div className="grid gap-4 px-4 sm:px-6">
        <form onSubmit={scan} className="flex gap-2">
          <div className="relative flex-1">
            <ScanBarcode className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input ref={scanRef} autoFocus className="ps-9" placeholder="امسح الباركود أو اكتب الاسم ثم Enter" value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
          <Button type="submit">إضافة</Button>
        </form>

        <div className="grid grid-cols-3 gap-3">
          <Stat label="أصناف معدودة" value={num(rows.length)} />
          <Stat label="أصناف بها فرق" value={num(rows.filter((r) => r.diff !== 0).length)} />
          <Stat label="قيمة الفرق (بالتكلفة)" value={money(diffValue, currency)} tone={diffValue < 0 ? "text-destructive" : "text-primary"} />
        </div>

        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الصنف</TableHead>
                <TableHead>المسجل</TableHead>
                <TableHead>المعدود</TableHead>
                <TableHead>الفرق</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">ابدأ بمسح أول صنف</TableCell></TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.p.id}>
                  <TableCell className="font-medium">{r.p.name}<div className="text-xs text-muted-foreground" dir="ltr">{r.p.barcode ?? r.p.sku}</div></TableCell>
                  <TableCell>{num(r.system)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="outline" className="size-7" onClick={() => setQty(r.p.id, r.counted - 1)}><Minus className="size-3" /></Button>
                      <Input className="h-7 w-20 text-center" type="number" value={r.counted} onChange={(e) => setQty(r.p.id, Number(e.target.value) || 0)} />
                      <Button size="icon" variant="outline" className="size-7" onClick={() => setQty(r.p.id, r.counted + 1)}><Plus className="size-3" /></Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.diff === 0 ? "secondary" : r.diff < 0 ? "destructive" : "default"}>
                      {r.diff > 0 ? "+" : ""}{num(r.diff)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button size="icon" variant="ghost" aria-label="حذف" onClick={() => setCounts((c) => { const n = { ...c }; delete n[r.p.id]; return n; })}>
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={rows.length === 0} onClick={() => setCounts({})}>مسح المسودة</Button>
          <Button disabled={!canEdit || rows.length === 0 || apply.isPending} onClick={() => apply.mutate()}>
            <ClipboardCheck className="size-4" /> اعتماد الجرد
          </Button>
        </div>
        {!canEdit && <p className="text-sm text-muted-foreground">يمكنك العدّ، لكن الاعتماد يحتاج صلاحية تعديل المخزون.</p>}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-bold ${tone ?? ""}`}>{value}</p>
    </div>
  );
}
