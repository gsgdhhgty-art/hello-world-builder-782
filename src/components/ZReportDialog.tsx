import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { dateTime, money, num, PAYMENT_LABELS } from "@/lib/format";

export interface ZShift {
  id: string;
  opening_cash: number | string;
  closing_cash: number | string | null;
  expected_cash: number | string | null;
  opened_at: string;
  closed_at: string | null;
  status: string;
}

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** End-of-day (Z) report for one shift: sales, payments, returns, cash variance and stock snapshot. */
export function ZReportDialog({
  shift,
  cashier,
  currency,
  storeName,
  onClose,
}: {
  shift: ZShift | null;
  cashier: string;
  currency: string;
  storeName: string;
  onClose: () => void;
}) {
  const report = useQuery({
    queryKey: ["z-report", shift?.id],
    enabled: Boolean(shift),
    queryFn: async () => {
      const s = shift!;
      const to = s.closed_at ?? new Date().toISOString();
      const [sales, expenses, inv] = await Promise.all([
        supabase
          .from("sales")
          .select("id, total, tax, discount, cost_total, change_due, status, sale_payments(method, amount)")
          .eq("shift_id", s.id),
        supabase.from("expenses").select("amount").eq("shift_id", s.id),
        supabase.from("inventory").select("quantity, products(cost, reorder_level, track_stock)"),
      ]);
      if (sales.error) throw sales.error;
      const saleIds = (sales.data ?? []).map((x) => x.id);
      const returns = saleIds.length
        ? await supabase
            .from("sale_returns")
            .select("total, created_at")
            .in("sale_id", saleIds)
            .gte("created_at", s.opened_at)
            .lte("created_at", to)
        : { data: [] as { total: number }[] };

      const valid = (sales.data ?? []).filter((x) => x.status !== "VOID");
      const byMethod: Record<string, number> = {};
      let change = 0;
      for (const sale of valid) {
        change += Number(sale.change_due);
        for (const p of sale.sale_payments ?? []) byMethod[p.method] = (byMethod[p.method] ?? 0) + Number(p.amount);
      }
      const sum = (k: "total" | "tax" | "discount" | "cost_total") => valid.reduce((a, x) => a + Number(x[k]), 0);
      const returnsTotal = (returns.data ?? []).reduce((a, r) => a + Number(r.total), 0);
      const expensesTotal = (expenses.data ?? []).reduce((a, r) => a + Number(r.amount), 0);
      const cashSales = (byMethod.CASH ?? 0) - change;
      const expected =
        s.expected_cash != null
          ? Number(s.expected_cash)
          : Number(s.opening_cash) + cashSales - returnsTotal - expensesTotal;
      const counted = s.closing_cash == null ? null : Number(s.closing_cash);
      let stockQty = 0,
        stockValue = 0,
        low = 0,
        out = 0;
      for (const r of inv.data ?? []) {
        const p = r.products as { cost: number; reorder_level: number; track_stock: boolean } | null;
        if (p && !p.track_stock) continue;
        const q = Number(r.quantity);
        stockQty += q;
        stockValue += q * Number(p?.cost ?? 0);
        if (q <= 0) out++;
        else if (q <= Number(p?.reorder_level ?? 0)) low++;
      }
      return {
        count: valid.length,
        total: sum("total"),
        tax: sum("tax"),
        discount: sum("discount"),
        profit: sum("total") - sum("tax") - sum("cost_total"),
        byMethod,
        cashSales,
        returnsTotal,
        expensesTotal,
        expected,
        counted,
        diff: counted == null ? null : counted - expected,
        stockQty,
        stockValue,
        low,
        out,
      };
    },
  });

  const d = report.data;
  const rows: [string, string][] = d
    ? [
        ["عدد الفواتير", num(d.count)],
        ["إجمالي المبيعات", money(d.total, currency)],
        ["الخصومات", money(d.discount, currency)],
        ["الضريبة", money(d.tax, currency)],
        ["صافي الربح التقديري", money(d.profit, currency)],
        ...Object.entries(d.byMethod).map(
          ([m, v]) => [`مدفوعات ${PAYMENT_LABELS[m] ?? m}`, money(v, currency)] as [string, string],
        ),
        ["المرتجعات", money(d.returnsTotal, currency)],
        ["المصروفات من الصندوق", money(d.expensesTotal, currency)],
        ["النقدية الافتتاحية", money(shift?.opening_cash, currency)],
        ["صافي المبيعات النقدية", money(d.cashSales, currency)],
        ["النقد المتوقع في الدرج", money(d.expected, currency)],
        ["النقد المعدود", d.counted == null ? "لم تُغلق بعد" : money(d.counted, currency)],
        ["فرق الصندوق", d.diff == null ? "—" : money(d.diff, currency)],
        ["كمية المخزون الحالية", num(d.stockQty, 2)],
        ["قيمة المخزون بالتكلفة", money(d.stockValue, currency)],
        ["أصناف منخفضة / نافدة", `${num(d.low)} / ${num(d.out)}`],
      ]
    : [];

  const print = () => {
    const w = window.open("", "_blank", "width=380,height=700");
    if (!w) return;
    w.document.write(`<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>Z-Report</title>
<style>body{font-family:Tahoma,sans-serif;width:72mm;margin:0 auto;font-size:12px}h2,p{text-align:center;margin:4px 0}
table{width:100%;border-collapse:collapse}td{padding:3px 0;border-bottom:1px dashed #999}td:last-child{text-align:left}</style></head>
<body><h2>${esc(storeName)}</h2><p>تقرير نهاية اليوم (Z)</p><p>${esc(cashier)}</p>
<p>${esc(dateTime(shift?.opened_at))} ← ${esc(dateTime(shift?.closed_at))}</p>
<table>${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join("")}</table>
<script>window.onload=()=>{window.print();}</script></body></html>`);
    w.document.close();
  };

  return (
    <Dialog open={Boolean(shift)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>تقرير نهاية اليوم (Z) — {cashier}</DialogTitle>
        </DialogHeader>
        {report.isLoading && <p className="text-muted-foreground">جارٍ التحميل…</p>}
        {report.error && <p className="text-destructive">تعذر تحميل التقرير (يتطلب اتصالًا بالإنترنت).</p>}
        {d && (
          <div className="max-h-[60vh] overflow-y-auto">
            {rows.map(([k, v]) => (
              <div key={k} className="flex justify-between border-b border-dashed py-1.5 text-sm">
                <span className="text-muted-foreground">{k}</span>
                <span
                  className={
                    k === "فرق الصندوق" && d.diff != null && d.diff < 0 ? "font-semibold text-destructive" : "font-medium"
                  }
                >
                  {v}
                </span>
              </div>
            ))}
          </div>
        )}
        <Button onClick={print} disabled={!d}>
          طباعة التقرير
        </Button>
      </DialogContent>
    </Dialog>
  );
}
