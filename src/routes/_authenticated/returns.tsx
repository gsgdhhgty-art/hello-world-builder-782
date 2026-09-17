import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { dateTime, money, num } from "@/lib/format";
import { round2 } from "@/lib/pos-math";

export const Route = createFileRoute("/_authenticated/returns")({
  head: () => ({
    meta: [
      { title: "المرتجعات — كاشير كلاود" },
      {
        name: "description",
        content: "إصدار مرتجع على فاتورة: إرجاع الأصناف للمخزون وتسجيل المبلغ المرتجع.",
      },
      { property: "og:title", content: "المرتجعات — كاشير كلاود" },
      { property: "og:description", content: "إرجاع أصناف من فاتورة مع تحديث المخزون." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ReturnsPage,
});

interface SaleItemRow {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

function ReturnsPage() {
  const { org, can } = useAuth();
  const qc = useQueryClient();
  const currency = org?.currency ?? "SAR";
  const [invoice, setInvoice] = useState("");
  const [saleId, setSaleId] = useState<string | null>(null);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");

  const salesQuery = useQuery({
    queryKey: ["returnable-sales"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id, invoice_no, total, status, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const itemsQuery = useQuery({
    queryKey: ["sale-items", saleId],
    enabled: !!saleId,
    queryFn: async (): Promise<SaleItemRow[]> => {
      const { data, error } = await supabase
        .from("sale_items")
        .select("id, product_name, quantity, unit_price, line_total")
        .eq("sale_id", saleId!);
      if (error) throw error;
      return (data ?? []) as SaleItemRow[];
    },
  });

  const returnedQuery = useQuery({
    queryKey: ["already-returned", saleId],
    enabled: !!saleId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sale_return_items")
        .select("sale_item_id, quantity");
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const r of data ?? []) {
        map[r.sale_item_id] = (map[r.sale_item_id] ?? 0) + Number(r.quantity);
      }
      return map;
    },
  });

  const filteredSales = useMemo(() => {
    const q = invoice.trim().toLowerCase();
    return (salesQuery.data ?? []).filter((s) =>
      q ? (s.invoice_no ?? "").toLowerCase().includes(q) : true,
    );
  }, [salesQuery.data, invoice]);

  const refundEstimate = useMemo(() => {
    let total = 0;
    for (const item of itemsQuery.data ?? []) {
      const q = Number(qty[item.id]) || 0;
      if (q > 0) total += round2((Number(item.line_total) * q) / Number(item.quantity));
    }
    return round2(total);
  }, [itemsQuery.data, qty]);

  const submit = useMutation({
    mutationFn: async () => {
      const items = Object.entries(qty)
        .map(([sale_item_id, v]) => ({ sale_item_id, quantity: Number(v) || 0 }))
        .filter((i) => i.quantity > 0);
      if (!items.length) throw new Error("empty");
      const args: { _sale_id: string; _items: unknown; _reason?: string } = {
        _sale_id: saleId!,
        _items: items,
      };
      if (reason.trim()) args._reason = reason.trim();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await supabase.rpc("create_return", args as any);
      if (error) throw error;
      return data as { total: number };
    },
    onSuccess: (res) => {
      toast.success(`تم إصدار المرتجع بمبلغ ${money(res.total, currency)}`);
      setQty({});
      setReason("");
      void qc.invalidateQueries({ queryKey: ["already-returned"] });
      void qc.invalidateQueries({ queryKey: ["returnable-sales"] });
      void qc.invalidateQueries({ queryKey: ["sales"] });
    },
    onError: (e: Error) => {
      const map: Record<string, string> = {
        "no permission to refund": "لا تملك صلاحية المرتجعات",
        "return quantity exceeds sold quantity": "الكمية المرتجعة أكبر من المباعة",
        empty: "اختر كمية للإرجاع",
      };
      const key = Object.keys(map).find((k) => e.message.includes(k));
      toast.error(key ? map[key] : "تعذر إصدار المرتجع");
    },
  });

  if (!can("sales.refund")) {
    return <div className="p-10 text-center text-muted-foreground">لا تملك صلاحية المرتجعات.</div>;
  }

  return (
    <div className="grid gap-4 p-4 md:p-6 lg:grid-cols-[380px_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <CardTitle>اختر الفاتورة</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="ابحث برقم الفاتورة"
              value={invoice}
              onChange={(e) => setInvoice(e.target.value)}
              className="pe-9"
            />
          </div>
          <div className="max-h-[60vh] space-y-1 overflow-y-auto">
            {filteredSales.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setSaleId(s.id);
                  setQty({});
                }}
                className={
                  "w-full rounded-lg border p-2 text-start text-sm transition hover:border-primary " +
                  (saleId === s.id ? "border-primary bg-primary/5" : "")
                }
              >
                <div className="flex justify-between font-semibold">
                  <span>{s.invoice_no}</span>
                  <span>{money(s.total, currency)}</span>
                </div>
                <div className="text-xs text-muted-foreground">{dateTime(s.created_at)}</div>
              </button>
            ))}
            {!filteredSales.length && (
              <p className="py-6 text-center text-sm text-muted-foreground">لا توجد فواتير.</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>أصناف المرتجع</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!saleId && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              اختر فاتورة من القائمة لبدء المرتجع.
            </p>
          )}
          {(itemsQuery.data ?? []).map((item) => {
            const already = (returnedQuery.data ?? {})[item.id] ?? 0;
            const max = Number(item.quantity) - already;
            return (
              <div
                key={item.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border p-3"
              >
                <div className="min-w-0">
                  <div className="truncate font-semibold">{item.product_name}</div>
                  <div className="text-xs text-muted-foreground">
                    مباع {num(item.quantity)} · مرتجع سابقًا {num(already)} · المتاح {num(max)} ·{" "}
                    {money(item.unit_price, currency)}
                  </div>
                </div>
                <Input
                  type="number"
                  min={0}
                  max={max}
                  step="0.001"
                  disabled={max <= 0}
                  className="w-24 shrink-0"
                  value={qty[item.id] ?? ""}
                  onChange={(e) => setQty((p) => ({ ...p, [item.id]: e.target.value }))}
                />
              </div>
            );
          })}

          {saleId && (
            <>
              <div className="space-y-1">
                <Label htmlFor="reason">سبب الإرجاع</Label>
                <Textarea
                  id="reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="صنف تالف، طلب العميل..."
                />
              </div>
              <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3 font-bold">
                <span>المبلغ المرتجع (تقديري)</span>
                <span className="text-primary">{money(refundEstimate, currency)}</span>
              </div>
              <Button
                className="w-full"
                disabled={submit.isPending || refundEstimate <= 0}
                onClick={() => submit.mutate()}
              >
                <RotateCcw className="size-4" /> إصدار المرتجع
              </Button>
              <p className="text-xs text-muted-foreground">
                يُحسب المبلغ النهائي في الخادم، ويعود المخزون إلى مستودع الفرع، ويُسجل في سجل
                التدقيق.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
