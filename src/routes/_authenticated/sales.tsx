import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Undo2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { dateTime, money, num, PAYMENT_LABELS } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/sales")({
  head: () => ({
    meta: [
      { title: "الفواتير — كاشير كلاود" },
      { name: "description", content: "سجل فواتير البيع، تفاصيل الأصناف وإجراء المرتجعات." },
      { property: "og:title", content: "الفواتير — كاشير كلاود" },
      { property: "og:description", content: "استعراض الفواتير وتنفيذ المرتجعات." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SalesPage,
});

const STATUS_LABELS: Record<string, string> = {
  COMPLETED: "مكتملة",
  REFUNDED: "مرتجعة",
  PARTIALLY_REFUNDED: "مرتجع جزئي",
  VOID: "ملغاة",
};

function SalesPage() {
  const { org, can } = useAuth();
  const qc = useQueryClient();
  const currency = org?.currency ?? "SAR";
  const [openSale, setOpenSale] = useState<string | null>(null);
  const [returnQty, setReturnQty] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");

  const sales = useQuery({
    queryKey: ["sales"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id, invoice_no, total, discount, tax, paid, payment_method, status, created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const items = useQuery({
    queryKey: ["sale-items", openSale],
    enabled: Boolean(openSale),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sale_items")
        .select("id, product_name, quantity, unit_price, discount, tax, line_total")
        .eq("sale_id", openSale!);
      if (error) throw error;
      return data ?? [];
    },
  });

  const doReturn = useMutation({
    mutationFn: async () => {
      const payload = Object.entries(returnQty)
        .filter(([, v]) => Number(v) > 0)
        .map(([sale_item_id, v]) => ({ sale_item_id, quantity: Number(v) }));
      if (!payload.length) throw new Error("empty");
      const { data, error } = await supabase.rpc("create_return", {
        _sale_id: openSale!,
        _items: payload,
        _reason: reason || undefined,
      });
      if (error) throw error;
      return data as { total: number };
    },
    onSuccess: (data) => {
      toast.success(`تم تسجيل مرتجع بقيمة ${money(data.total, currency)}`);
      setReturnQty({});
      setReason("");
      setOpenSale(null);
      void qc.invalidateQueries({ queryKey: ["sales"] });
      void qc.invalidateQueries({ queryKey: ["pos-stock"] });
    },
    onError: (e: Error) =>
      toast.error(
        e.message.includes("exceeds")
          ? "الكمية المرتجعة أكبر من المبيعة"
          : e.message === "empty"
            ? "أدخل كمية للإرجاع"
            : "تعذر تنفيذ المرتجع",
      ),
  });

  return (
    <div>
      <PageHeader title="الفواتير" description="سجل المبيعات والمرتجعات." />
      <div className="p-6">
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الفاتورة</TableHead>
                <TableHead>الوقت</TableHead>
                <TableHead>الدفع</TableHead>
                <TableHead>الخصم</TableHead>
                <TableHead>الضريبة</TableHead>
                <TableHead>الإجمالي</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(sales.data ?? []).map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.invoice_no}</TableCell>
                  <TableCell>{dateTime(s.created_at)}</TableCell>
                  <TableCell>{PAYMENT_LABELS[s.payment_method] ?? s.payment_method}</TableCell>
                  <TableCell>{money(s.discount, currency)}</TableCell>
                  <TableCell>{money(s.tax, currency)}</TableCell>
                  <TableCell className="font-bold">{money(s.total, currency)}</TableCell>
                  <TableCell>
                    <Badge variant={s.status === "COMPLETED" ? "default" : "secondary"}>
                      {STATUS_LABELS[s.status] ?? s.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-end">
                    <Button size="sm" variant="ghost" onClick={() => setOpenSale(s.id)}>
                      التفاصيل
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!sales.data?.length && (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                    لا توجد فواتير بعد.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={Boolean(openSale)} onOpenChange={(o) => !o && setOpenSale(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>تفاصيل الفاتورة</DialogTitle>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الصنف</TableHead>
                <TableHead>الكمية</TableHead>
                <TableHead>السعر</TableHead>
                <TableHead>الإجمالي</TableHead>
                {can("sales.refund") && <TableHead>إرجاع</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(items.data ?? []).map((it) => (
                <TableRow key={it.id}>
                  <TableCell>{it.product_name}</TableCell>
                  <TableCell>{num(it.quantity)}</TableCell>
                  <TableCell>{money(it.unit_price, currency)}</TableCell>
                  <TableCell>{money(it.line_total, currency)}</TableCell>
                  {can("sales.refund") && (
                    <TableCell>
                      <Input
                        className="h-8 w-20"
                        type="number"
                        min="0"
                        step="0.001"
                        value={returnQty[it.id] ?? ""}
                        onChange={(e) =>
                          setReturnQty({ ...returnQty, [it.id]: e.target.value })
                        }
                      />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {can("sales.refund") && (
            <div className="space-y-2">
              <Label htmlFor="reason">سبب الإرجاع</Label>
              <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenSale(null)}>
              إغلاق
            </Button>
            {can("sales.refund") && (
              <Button disabled={doReturn.isPending} onClick={() => doReturn.mutate()}>
                <Undo2 className="size-4" /> تنفيذ المرتجع
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
