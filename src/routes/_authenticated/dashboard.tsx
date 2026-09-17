import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Receipt, TrendingUp, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { dateTime, money, num, PAYMENT_LABELS } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "لوحة التحكم — كاشير كلاود" },
      { name: "description", content: "مبيعات اليوم، الأرباح، المصروفات وتنبيهات نقص المخزون." },
      { property: "og:title", content: "لوحة التحكم — كاشير كلاود" },
      { property: "og:description", content: "نظرة سريعة على أداء متجرك اليوم." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function Dashboard() {
  const { org, can, profile } = useAuth();
  const currency = org?.currency ?? "SAR";

  const today = useQuery({
    queryKey: ["dash-today"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("total, cost_total, discount, payment_method, status")
        .gte("created_at", startOfToday());
      if (error) throw error;
      return data ?? [];
    },
  });

  const expenses = useQuery({
    queryKey: ["dash-expenses"],
    enabled: can("expenses.manage"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("amount")
        .gte("created_at", startOfToday());
      if (error) return [];
      return data ?? [];
    },
  });

  const recent = useQuery({
    queryKey: ["dash-recent"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id, invoice_no, total, payment_method, created_at, status")
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return data ?? [];
    },
  });

  const lowStock = useQuery({
    queryKey: ["dash-low-stock"],
    enabled: can("inventory.view"),
    queryFn: async () => {
      const [{ data: inv }, { data: prods }] = await Promise.all([
        supabase.from("inventory").select("product_id, quantity"),
        supabase.from("products").select("id, name, reorder_level, unit").eq("is_active", true),
      ]);
      const totals: Record<string, number> = {};
      for (const row of inv ?? []) {
        totals[row.product_id] = (totals[row.product_id] ?? 0) + Number(row.quantity);
      }
      return (prods ?? [])
        .map((p) => ({ ...p, qty: totals[p.id] ?? 0 }))
        .filter((p) => p.qty <= Number(p.reorder_level))
        .slice(0, 8);
    },
  });

  const rows = today.data ?? [];
  const salesTotal = rows.reduce((s, r) => s + Number(r.total), 0);
  const profitTotal = rows.reduce((s, r) => s + Number(r.total) - Number(r.cost_total), 0);
  const expenseTotal = (expenses.data ?? []).reduce((s, r) => s + Number(r.amount), 0);

  return (
    <div>
      <PageHeader title={`مرحبًا ${profile?.full_name ?? ""}`} description="ملخص أداء اليوم.">
        <Button asChild>
          <Link to="/pos">فتح الكاشير</Link>
        </Button>
      </PageHeader>

      <div className="grid gap-4 p-6 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          icon={Receipt}
          label="مبيعات اليوم"
          value={money(salesTotal, currency)}
          sub={`${num(rows.length)} فاتورة`}
        />
        {can("profit.view") && (
          <Stat
            icon={TrendingUp}
            label="ربح اليوم"
            value={money(profitTotal, currency)}
            sub="الإيراد ناقص التكلفة"
          />
        )}
        {can("expenses.manage") && (
          <Stat
            icon={Wallet}
            label="مصروفات اليوم"
            value={money(expenseTotal, currency)}
            sub="نقدًا من الصندوق"
          />
        )}
        {can("inventory.view") && (
          <Stat
            icon={AlertTriangle}
            label="منتجات تحت حد الطلب"
            value={num(lowStock.data?.length ?? 0)}
            sub="تحتاج إعادة شراء"
          />
        )}
      </div>

      <div className="grid gap-6 px-6 pb-10 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>آخر الفواتير</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الفاتورة</TableHead>
                  <TableHead>الوقت</TableHead>
                  <TableHead>الدفع</TableHead>
                  <TableHead>الإجمالي</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(recent.data ?? []).map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.invoice_no}</TableCell>
                    <TableCell>{dateTime(s.created_at)}</TableCell>
                    <TableCell>{PAYMENT_LABELS[s.payment_method] ?? s.payment_method}</TableCell>
                    <TableCell>{money(s.total, currency)}</TableCell>
                  </TableRow>
                ))}
                {!recent.data?.length && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                      لا توجد فواتير بعد.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {can("inventory.view") && (
          <Card>
            <CardHeader>
              <CardTitle>تنبيهات المخزون</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>المنتج</TableHead>
                    <TableHead>المتوفر</TableHead>
                    <TableHead>حد الطلب</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(lowStock.data ?? []).map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-destructive">
                        {num(p.qty)} {p.unit}
                      </TableCell>
                      <TableCell>{num(p.reorder_level)}</TableCell>
                    </TableRow>
                  ))}
                  {!lowStock.data?.length && (
                    <TableRow>
                      <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                        كل المنتجات فوق حد الطلب.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Receipt;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="surface-card relative overflow-hidden p-5">
      <span
        aria-hidden
        className="pointer-events-none absolute -start-6 -top-8 size-24 rounded-full gradient-primary opacity-10"
      />
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <span className="min-w-0 truncate text-sm font-medium text-muted-foreground">{label}</span>
        <span className="grid size-9 shrink-0 place-items-center rounded-xl gradient-primary">
          <Icon className="size-4" />
        </span>
      </div>
      <div className="mt-3 text-2xl font-extrabold tabular-nums sm:text-3xl">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}
