import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  Boxes,
  PackagePlus,
  Receipt,
  ShoppingCart,
  TrendingUp,
  UserPlus,
  Users,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { dateTime, money, num, PAYMENT_LABELS } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "الرئيسية — SmartPOS" },
      { name: "description", content: "ملخص المبيعات والمخزون والعملاء والعمليات اليومية." },
      { property: "og:title", content: "الرئيسية — SmartPOS" },
      { property: "og:description", content: "نظرة تشغيلية مباشرة على أداء المتجر." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function startOfDaysAgo(days: number) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

const CHART_COLORS = [
  "var(--color-primary)",
  "var(--color-success)",
  "var(--color-warning)",
  "var(--color-chart-4)",
  "var(--color-info)",
];

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

  const weekly = useQuery({
    queryKey: ["dash-weekly"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("total, created_at")
        .gte("created_at", startOfDaysAgo(6))
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const customers = useQuery({
    queryKey: ["dash-customers"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("customers")
        .select("id", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });

  const recent = useQuery({
    queryKey: ["dash-recent"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id, invoice_no, total, payment_method, created_at, status")
        .order("created_at", { ascending: false })
        .limit(6);
      if (error) throw error;
      return data ?? [];
    },
  });

  const lowStock = useQuery({
    queryKey: ["dash-low-stock"],
    enabled: can("inventory.view"),
    queryFn: async () => {
      const [{ data: inventory }, { data: products }] = await Promise.all([
        supabase.from("inventory").select("product_id, quantity"),
        supabase.from("products").select("id, name, reorder_level, unit").eq("is_active", true),
      ]);
      const totals: Record<string, number> = {};
      for (const row of inventory ?? [])
        totals[row.product_id] = (totals[row.product_id] ?? 0) + Number(row.quantity);
      return (products ?? [])
        .map((product) => ({ ...product, qty: totals[product.id] ?? 0 }))
        .filter((product) => product.qty <= Number(product.reorder_level))
        .slice(0, 6);
    },
  });

  const topProducts = useQuery({
    queryKey: ["dash-top-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sale_items")
        .select("product_name, quantity, line_total")
        .gte("created_at", startOfDaysAgo(30));
      if (error) throw error;
      const totals = new Map<string, { name: string; qty: number; total: number }>();
      for (const item of data ?? []) {
        const current = totals.get(item.product_name) ?? {
          name: item.product_name,
          qty: 0,
          total: 0,
        };
        current.qty += Number(item.quantity);
        current.total += Number(item.line_total);
        totals.set(item.product_name, current);
      }
      return [...totals.values()].sort((a, b) => b.qty - a.qty).slice(0, 5);
    },
  });

  const rows = today.data ?? [];
  const salesTotal = rows.reduce((sum, row) => sum + Number(row.total), 0);
  const profitTotal = rows.reduce(
    (sum, row) => sum + Number(row.total) - Number(row.cost_total),
    0,
  );
  const paymentData = Object.entries(
    rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.payment_method] = (acc[row.payment_method] ?? 0) + Number(row.total);
      return acc;
    }, {}),
  ).map(([name, value]) => ({ name: PAYMENT_LABELS[name] ?? name, value }));
  const salesByDay = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    const key = date.toISOString().slice(0, 10);
    return {
      day: new Intl.DateTimeFormat("ar-EG", { weekday: "short" }).format(date),
      total: (weekly.data ?? [])
        .filter((sale) => sale.created_at.slice(0, 10) === key)
        .reduce((sum, sale) => sum + Number(sale.total), 0),
    };
  });

  return (
    <div className="pb-8">
      <PageHeader
        title={`مرحبًا، ${profile?.full_name ?? ""}`}
        description="إليك ملخص أداء متجرك اليوم."
      >
        <Button asChild className="bg-success text-success-foreground hover:bg-success/90">
          <Link to="/pos">
            <ShoppingCart /> بدء عملية بيع
          </Link>
        </Button>
      </PageHeader>

      <div className="page-canvas space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            icon={Banknote}
            label="إجمالي مبيعات اليوم"
            value={money(salesTotal, currency)}
            sub={`${num(rows.length)} فاتورة مكتملة`}
            tone="success"
          />
          {can("profit.view") && (
            <Stat
              icon={TrendingUp}
              label="إجمالي الأرباح"
              value={money(profitTotal, currency)}
              sub="بعد تكلفة البضاعة"
              tone="primary"
            />
          )}
          <Stat
            icon={Receipt}
            label="عدد الفواتير"
            value={num(rows.length)}
            sub="منذ بداية اليوم"
            tone="warning"
          />
          <Stat
            icon={Users}
            label="إجمالي العملاء"
            value={num(customers.data ?? 0)}
            sub="عميل مسجل"
            tone="purple"
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.75fr)]">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-base font-black">المبيعات خلال آخر 7 أيام</CardTitle>
              <span className="rounded-lg bg-secondary px-3 py-1 text-xs font-bold text-secondary-foreground">
                أسبوعي
              </span>
            </CardHeader>
            <CardContent className="h-72 pt-3" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={salesByDay}>
                  <defs>
                    <linearGradient id="salesArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    stroke="var(--color-border)"
                    strokeDasharray="3 3"
                    vertical={false}
                  />
                  <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis tickLine={false} axisLine={false} fontSize={11} />
                  <Tooltip formatter={(value) => money(Number(value), currency)} />
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke="var(--color-primary)"
                    strokeWidth={3}
                    fill="url(#salesArea)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-0">
              <CardTitle className="text-base font-black">المبيعات حسب طريقة الدفع</CardTitle>
            </CardHeader>
            <CardContent className="grid h-72 place-items-center">
              {paymentData.length ? (
                <div className="grid w-full grid-cols-[150px_1fr] items-center">
                  <div className="h-44">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={paymentData}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={45}
                          outerRadius={67}
                          paddingAngle={3}
                        >
                          {paymentData.map((entry, index) => (
                            <Cell
                              key={entry.name}
                              fill={CHART_COLORS[index % CHART_COLORS.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => money(Number(value), currency)} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-3">
                    {paymentData.map((entry, index) => (
                      <div key={entry.name} className="flex items-center gap-2 text-xs">
                        <span
                          className="size-2.5 rounded-full"
                          style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                        />
                        <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                        <strong>{money(entry.value, currency)}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <Empty text="لا توجد مدفوعات اليوم" />
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base font-black">آخر العمليات</CardTitle>
              <Button asChild variant="ghost" size="sm">
                <Link to="/sales">
                  عرض الكل <ArrowLeft />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-1">
              {(recent.data ?? []).map((sale) => (
                <div
                  key={sale.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border/60 py-3 last:border-0"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold">{sale.invoice_no}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {dateTime(sale.created_at)} ·{" "}
                      {PAYMENT_LABELS[sale.payment_method] ?? sale.payment_method}
                    </div>
                  </div>
                  <div className="text-end">
                    <div className="font-black">{money(sale.total, currency)}</div>
                    <span className="status-success rounded-full px-2 py-0.5 text-[10px] font-bold">
                      مكتملة
                    </span>
                  </div>
                </div>
              ))}
              {!recent.data?.length && <Empty text="لا توجد عمليات بعد" />}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base font-black">إجراءات سريعة</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <QuickAction to="/pos" icon={ShoppingCart} label="عملية بيع" tone="success" />
              <QuickAction to="/products" icon={PackagePlus} label="إضافة منتج" tone="primary" />
              <QuickAction to="/customers" icon={UserPlus} label="إضافة عميل" tone="purple" />
              <QuickAction to="/inventory" icon={Boxes} label="إدارة المخزون" tone="warning" />
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-black">المنتجات الأكثر مبيعًا</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(topProducts.data ?? []).map((product, index) => (
                <div
                  key={product.name}
                  className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3"
                >
                  <span className="grid size-7 place-items-center rounded-lg bg-secondary text-xs font-black text-primary">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold">{product.name}</div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{
                          width: `${Math.max(12, Math.min(100, (product.qty / Math.max(topProducts.data?.[0]?.qty ?? 1, 1)) * 100))}%`,
                        }}
                      />
                    </div>
                  </div>
                  <div className="text-end text-xs">
                    <strong>{num(product.qty)}</strong>
                    <div className="text-muted-foreground">{money(product.total, currency)}</div>
                  </div>
                </div>
              ))}
              {!topProducts.data?.length && <Empty text="ستظهر المنتجات بعد أول عملية بيع" />}
            </CardContent>
          </Card>
          {can("inventory.view") && (
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base font-black">تنبيهات المخزون</CardTitle>
                <span className="status-warning rounded-full px-2.5 py-1 text-xs font-bold">
                  {num(lowStock.data?.length ?? 0)} تنبيه
                </span>
              </CardHeader>
              <CardContent className="space-y-2">
                {(lowStock.data ?? []).map((product) => (
                  <div
                    key={product.id}
                    className="flex items-center gap-3 rounded-lg bg-muted/40 p-3"
                  >
                    <span className="grid size-9 place-items-center rounded-lg bg-destructive/10 text-destructive">
                      <AlertTriangle className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold">{product.name}</div>
                      <div className="text-xs text-muted-foreground">
                        حد الطلب: {num(product.reorder_level)}
                      </div>
                    </div>
                    <strong className="text-sm text-destructive">
                      {num(product.qty)} {product.unit}
                    </strong>
                  </div>
                ))}
                {!lowStock.data?.length && <Empty text="المخزون في حالة جيدة" />}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

type Tone = "primary" | "success" | "warning" | "purple";
const TONES: Record<Tone, string> = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success/12 text-success",
  warning: "bg-warning/15 text-warning",
  purple: "bg-chart-4/12 text-chart-4",
};

function Stat({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: typeof Receipt;
  label: string;
  value: string;
  sub: string;
  tone: Tone;
}) {
  return (
    <div className="workspace-card p-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold text-muted-foreground">{label}</div>
          <div className="mt-2 truncate text-2xl font-black tabular-nums">{value}</div>
          <div className="mt-1 text-[11px] text-muted-foreground">{sub}</div>
        </div>
        <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${TONES[tone]}`}>
          <Icon className="size-5" />
        </span>
      </div>
    </div>
  );
}

function QuickAction({
  to,
  icon: Icon,
  label,
  tone,
}: {
  to: string;
  icon: typeof Receipt;
  label: string;
  tone: Tone;
}) {
  return (
    <Button asChild variant="outline" className="h-20 flex-col gap-2">
      <Link to={to}>
        <span className={`grid size-8 place-items-center rounded-lg ${TONES[tone]}`}>
          <Icon />
        </span>
        {label}
      </Link>
    </Button>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="grid min-h-28 place-items-center text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}
