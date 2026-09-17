import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/AppShell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { money, num, PAYMENT_LABELS } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "التقارير — كاشير كلاود" },
      { name: "description", content: "تقارير المبيعات والأرباح وأفضل المنتجات وطرق الدفع." },
      { property: "og:title", content: "التقارير — كاشير كلاود" },
      { property: "og:description", content: "تحليل مبيعات المتجر وأرباحه بأي فترة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ReportsPage,
});

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

function ReportsPage() {
  const { org, can } = useAuth();
  const currency = org?.currency ?? "SAR";
  const today = new Date();
  const monthAgo = new Date(Date.now() - 29 * 86400000);
  const [from, setFrom] = useState(isoDay(monthAgo));
  const [to, setTo] = useState(isoDay(today));

  const fromIso = new Date(`${from}T00:00:00`).toISOString();
  const toIso = new Date(`${to}T23:59:59`).toISOString();

  const sales = useQuery({
    queryKey: ["rep-sales", fromIso, toIso],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id, total, cost_total, discount, tax, payment_method, created_at, status")
        .gte("created_at", fromIso)
        .lte("created_at", toIso);
      if (error) throw error;
      return data ?? [];
    },
  });

  const items = useQuery({
    queryKey: ["rep-items", fromIso, toIso],
    queryFn: async () => {
      const ids = (sales.data ?? []).map((s) => s.id);
      if (!ids.length) return [];
      const { data, error } = await supabase
        .from("sale_items")
        .select("product_name, quantity, line_total, unit_cost")
        .in("sale_id", ids);
      if (error) throw error;
      return data ?? [];
    },
    enabled: Boolean(sales.data),
  });

  const expenses = useQuery({
    queryKey: ["rep-expenses", fromIso, toIso],
    enabled: can("expenses.manage"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("amount, category")
        .gte("created_at", fromIso)
        .lte("created_at", toIso);
      if (error) return [];
      return data ?? [];
    },
  });

  const rows = sales.data ?? [];
  const revenue = rows.reduce((s, r) => s + Number(r.total), 0);
  const cost = rows.reduce((s, r) => s + Number(r.cost_total), 0);
  const discount = rows.reduce((s, r) => s + Number(r.discount), 0);
  const tax = rows.reduce((s, r) => s + Number(r.tax), 0);
  const expenseTotal = (expenses.data ?? []).reduce((s, e) => s + Number(e.amount), 0);

  const byMethod = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of rows) map[r.payment_method] = (map[r.payment_method] ?? 0) + Number(r.total);
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const byDay = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of rows) {
      const day = r.created_at.slice(0, 10);
      map[day] = (map[day] ?? 0) + Number(r.total);
    }
    return Object.entries(map).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [rows]);

  const topProducts = useMemo(() => {
    const map: Record<string, { qty: number; total: number; profit: number }> = {};
    for (const it of items.data ?? []) {
      const cur = map[it.product_name] ?? { qty: 0, total: 0, profit: 0 };
      cur.qty += Number(it.quantity);
      cur.total += Number(it.line_total);
      cur.profit += Number(it.line_total) - Number(it.unit_cost) * Number(it.quantity);
      map[it.product_name] = cur;
    }
    return Object.entries(map)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 15);
  }, [items.data]);

  if (!can("reports.view")) {
    return <div className="p-10 text-center text-muted-foreground">لا تملك صلاحية التقارير.</div>;
  }

  return (
    <div>
      <PageHeader title="التقارير" description="اختر الفترة لعرض النتائج." />
      <div className="space-y-6 p-6">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="from">من</Label>
            <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="to">إلى</Label>
            <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            label="الإيرادات"
            value={money(revenue, currency)}
            sub={`${num(rows.length)} فاتورة`}
          />
          <Stat label="الخصومات" value={money(discount, currency)} sub="مجموع الخصم الممنوح" />
          <Stat label="الضريبة المحصلة" value={money(tax, currency)} sub="ضمن الإيرادات" />
          {can("profit.view") && (
            <Stat
              label="الربح الصافي"
              value={money(revenue - cost - expenseTotal, currency)}
              sub={`تكلفة ${money(cost, currency)} + مصروفات ${money(expenseTotal, currency)}`}
            />
          )}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>المبيعات حسب اليوم</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>اليوم</TableHead>
                    <TableHead>المبيعات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byDay.map(([day, total]) => (
                    <TableRow key={day}>
                      <TableCell dir="ltr">{day}</TableCell>
                      <TableCell>{money(total, currency)}</TableCell>
                    </TableRow>
                  ))}
                  {!byDay.length && (
                    <TableRow>
                      <TableCell colSpan={2} className="py-8 text-center text-muted-foreground">
                        لا مبيعات في هذه الفترة.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>طرق الدفع</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الطريقة</TableHead>
                    <TableHead>الإجمالي</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byMethod.map(([m, total]) => (
                    <TableRow key={m}>
                      <TableCell>{PAYMENT_LABELS[m] ?? m}</TableCell>
                      <TableCell>{money(total, currency)}</TableCell>
                    </TableRow>
                  ))}
                  {!byMethod.length && (
                    <TableRow>
                      <TableCell colSpan={2} className="py-8 text-center text-muted-foreground">
                        لا بيانات.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>أفضل المنتجات</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>المنتج</TableHead>
                  <TableHead>الكمية</TableHead>
                  <TableHead>المبيعات</TableHead>
                  {can("profit.view") && <TableHead>الربح</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {topProducts.map(([name, v]) => (
                  <TableRow key={name}>
                    <TableCell className="font-medium">{name}</TableCell>
                    <TableCell>{num(v.qty)}</TableCell>
                    <TableCell>{money(v.total, currency)}</TableCell>
                    {can("profit.view") && <TableCell>{money(v.profit, currency)}</TableCell>}
                  </TableRow>
                ))}
                {!topProducts.length && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                      لا بيانات في هذه الفترة.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-extrabold tabular-nums">{value}</div>
        <div className="text-xs text-muted-foreground">{sub}</div>
      </CardContent>
    </Card>
  );
}
