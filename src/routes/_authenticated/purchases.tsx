import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
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
import { dateTime, money, num } from "@/lib/format";
import { localFirst } from "@/lib/offline/local-first";
import {
  enqueue,
  isNetworkFailure,
  isOnline,
  recordLocalPurchase,
  REQUEST_TIMEOUT_MS,
} from "@/lib/offline/sync";

export const Route = createFileRoute("/_authenticated/purchases")({
  head: () => ({
    meta: [
      { title: "المشتريات — كاشير كلاود" },
      { name: "description", content: "استلام فواتير المشتريات وزيادة المخزون وتحديث التكاليف." },
      { property: "og:title", content: "المشتريات — كاشير كلاود" },
      { property: "og:description", content: "تسجيل مشتريات الموردين واستلام المخزون." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PurchasesPage,
});

interface Line {
  product_id: string;
  quantity: string;
  unit_cost: string;
}

function PurchasesPage() {
  const { org, can } = useAuth();
  const qc = useQueryClient();
  const currency = org?.currency ?? "SAR";
  const [open, setOpen] = useState(false);
  const [supplierId, setSupplierId] = useState("none");
  const [warehouseId, setWarehouseId] = useState("");
  const [reference, setReference] = useState("");
  const [lines, setLines] = useState<Line[]>([{ product_id: "", quantity: "1", unit_cost: "0" }]);

  const purchases = useQuery({
    queryKey: ["purchases"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchases")
        .select("id, reference, total, status, created_at, supplier_id")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  const suppliers = useQuery({
    queryKey: ["suppliers-lite"],
    queryFn: () =>
      localFirst("suppliers", async () => {
        const { data, error } = await supabase.from("suppliers").select("id, name").order("name");
        if (error) throw error;
        return data ?? [];
      }),
  });

  const warehouses = useQuery({
    queryKey: ["warehouses"],
    queryFn: async () => {
      const data = await localFirst("warehouses", async () => {
        const { data, error } = await supabase.from("warehouses").select("id, name").order("name");
        if (error) throw error;
        return data ?? [];
      });
      if (data.length && !warehouseId) setWarehouseId(data[0]!.id);
      return data;
    },
  });





  const products = useQuery({
    queryKey: ["products-lite"],
    queryFn: () =>
      localFirst("products", async () => {
        const { data, error } = await supabase
          .from("products")
          .select("id, name, unit, reorder_level, track_stock")
          .eq("is_active", true)
          .order("name");
        if (error) throw error;
        return data ?? [];
      }),
  });

  const receive = useMutation({
    mutationFn: async () => {
      const items = lines
        .filter((l) => l.product_id && Number(l.quantity) > 0)
        .map((l) => ({
          product_id: l.product_id,
          quantity: Number(l.quantity),
          unit_cost: Number(l.unit_cost) || 0,
        }));
      if (!items.length) throw new Error("empty");
      const clientTxnId = crypto.randomUUID();
      const payload = {
        supplier_id: supplierId === "none" ? null : supplierId,
        warehouse_id: warehouseId,
        reference: reference || null,
        items,
        client_txn_id: clientTxnId,
        local_created_at: new Date().toISOString(),
      };

      // بدون إنترنت: نزيد المخزون محليًا ونضع الفاتورة في قائمة المزامنة
      async function saveOffline() {
        await recordLocalPurchase(warehouseId, items);
        await enqueue("purchase", "CREATE", payload, {
          entity_id: clientTxnId,
          idempotency_key: clientTxnId,
        });
        return true;
      }

      if (!isOnline()) return saveOffline();
      try {
        const { error } = await supabase
          .rpc("receive_purchase", { _payload: payload })
          .abortSignal(AbortSignal.timeout(REQUEST_TIMEOUT_MS));
        if (error) throw error;
        return false;
      } catch (e) {
        const message = e instanceof Error ? e.message : "";
        if (isNetworkFailure(message)) return saveOffline();
        throw e;
      }
    },
    onSuccess: (offline) => {
      toast.success(
        offline
          ? "تم تسجيل المشتريات محليًا — سترسل تلقائيًا عند عودة الإنترنت"
          : "تم استلام المشتريات وتحديث المخزون",
      );
      setOpen(false);
      setLines([{ product_id: "", quantity: "1", unit_cost: "0" }]);
      setReference("");
      void qc.invalidateQueries({ queryKey: ["purchases"] });
      void qc.invalidateQueries({ queryKey: ["inventory"] });
      void qc.invalidateQueries({ queryKey: ["pos-stock"] });
    },
    onError: (e: Error) =>
      toast.error(e.message === "empty" ? "أضف صنفًا واحدًا على الأقل" : "تعذر حفظ المشتريات"),
  });

  const total = lines.reduce(
    (s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_cost) || 0),
    0,
  );
  const supplierName = (id: string | null) => suppliers.data?.find((s) => s.id === id)?.name ?? "—";

  if (!can("purchases.manage")) {
    return <div className="p-10 text-center text-muted-foreground">لا تملك صلاحية المشتريات.</div>;
  }

  return (
    <div>
      <PageHeader title="المشتريات" description="استلام البضاعة من الموردين.">
        <Button onClick={() => setOpen(true)}>
          <Plus className="size-4" /> فاتورة شراء
        </Button>
      </PageHeader>

      <div className="p-6">
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>المرجع</TableHead>
                <TableHead>المورد</TableHead>
                <TableHead>الإجمالي</TableHead>
                <TableHead>التاريخ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(purchases.data ?? []).map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.reference ?? "—"}</TableCell>
                  <TableCell>{supplierName(p.supplier_id)}</TableCell>
                  <TableCell>{money(p.total, currency)}</TableCell>
                  <TableCell>{dateTime(p.created_at)}</TableCell>
                </TableRow>
              ))}
              {!purchases.data?.length && (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                    لا توجد مشتريات بعد.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>فاتورة شراء جديدة</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>المورد</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون مورد</SelectItem>
                  {(suppliers.data ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>المستودع</Label>
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر" />
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
            <div className="space-y-2">
              <Label htmlFor="ref">رقم فاتورة المورد</Label>
              <Input id="ref" value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-12 items-end gap-2">
                <div className="col-span-6 space-y-1">
                  <Label className="text-xs">المنتج</Label>
                  <Select
                    value={l.product_id}
                    onValueChange={(v) =>
                      setLines(lines.map((x, xi) => (xi === i ? { ...x, product_id: v } : x)))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="اختر منتجًا" />
                    </SelectTrigger>
                    <SelectContent>
                      {(products.data ?? []).map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">الكمية</Label>
                  <Input
                    type="number"
                    step="0.001"
                    value={l.quantity}
                    onChange={(e) =>
                      setLines(
                        lines.map((x, xi) => (xi === i ? { ...x, quantity: e.target.value } : x)),
                      )
                    }
                  />
                </div>
                <div className="col-span-3 space-y-1">
                  <Label className="text-xs">تكلفة الوحدة</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={l.unit_cost}
                    onChange={(e) =>
                      setLines(
                        lines.map((x, xi) => (xi === i ? { ...x, unit_cost: e.target.value } : x)),
                      )
                    }
                  />
                </div>
                <div className="col-span-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setLines(lines.filter((_, xi) => xi !== i))}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setLines([...lines, { product_id: "", quantity: "1", unit_cost: "0" }])
              }
            >
              <Plus className="size-4" /> صنف آخر
            </Button>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-secondary p-3 font-bold">
            <span>إجمالي الفاتورة</span>
            <span className="tabular-nums">{money(total, currency)}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            عدد الأصناف: {num(lines.filter((l) => l.product_id).length)}
          </p>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
            <Button disabled={receive.isPending || !warehouseId} onClick={() => receive.mutate()}>
              استلام وتحديث المخزون
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
