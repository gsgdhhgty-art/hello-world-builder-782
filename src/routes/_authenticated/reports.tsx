import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Banknote, Boxes, Download, ReceiptText, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { money, num, PAYMENT_LABELS, dateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "التقارير الشاملة — كاشير كلاود" },
      {
        name: "description",
        content: "تقارير المبيعات والمخزون والمصروفات والنقدية حسب الفترة والفرع.",
      },
      { property: "og:title", content: "التقارير الشاملة — كاشير كلاود" },
      { property: "og:description", content: "تحليل شامل لأداء المتجر والمخزون والصندوق." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ReportsPage,
});
const day = (date: Date) => date.toISOString().slice(0, 10);

function ReportsPage() {
  const { org, can } = useAuth();
  const currency = org?.currency ?? "SAR";
  const [from, setFrom] = useState(day(new Date(Date.now() - 29 * 86400000)));
  const [to, setTo] = useState(day(new Date()));
  const [branchId, setBranchId] = useState("all");
  const fromIso = new Date(`${from}T00:00:00`).toISOString();
  const toIso = new Date(`${to}T23:59:59`).toISOString();

  const branches = useQuery({
    queryKey: ["branches-report"],
    queryFn: async () => {
      const { data, error } = await supabase.from("branches").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const sales = useQuery({
    queryKey: ["rep-sales", fromIso, toIso, branchId],
    queryFn: async () => {
      let q = supabase
        .from("sales")
        .select(
          "id, total, cost_total, discount, tax, payment_method, created_at, status, branch_id",
        )
        .gte("created_at", fromIso)
        .lte("created_at", toIso);
      if (branchId !== "all") q = q.eq("branch_id", branchId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
  const items = useQuery({
    queryKey: ["rep-items", sales.data?.map((sale) => sale.id).join(",")],
    enabled: Boolean(sales.data),
    queryFn: async () => {
      const ids = (sales.data ?? []).map((sale) => sale.id);
      if (!ids.length) return [];
      const { data, error } = await supabase
        .from("sale_items")
        .select("product_name, quantity, line_total, unit_cost")
        .in("sale_id", ids);
      if (error) throw error;
      return data ?? [];
    },
  });
  const expenses = useQuery({
    queryKey: ["rep-expenses", fromIso, toIso, branchId],
    queryFn: async () => {
      let q = supabase
        .from("expenses")
        .select("amount, category, created_at, branch_id")
        .gte("created_at", fromIso)
        .lte("created_at", toIso);
      if (branchId !== "all") q = q.eq("branch_id", branchId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
  const shifts = useQuery({
    queryKey: ["rep-shifts", fromIso, toIso, branchId],
    queryFn: async () => {
      let q = supabase
        .from("shifts")
        .select(
          "id, branch_id, opening_cash, closing_cash, expected_cash, status, opened_at, closed_at",
        )
        .gte("opened_at", fromIso)
        .lte("opened_at", toIso)
        .order("opened_at", { ascending: false });
      if (branchId !== "all") q = q.eq("branch_id", branchId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
  const inventory = useQuery({
    queryKey: ["rep-inventory", branchId],
    queryFn: async () => {
      const warehouseIds =
        branchId === "all"
          ? null
          : ((await supabase.from("warehouses").select("id").eq("branch_id", branchId)).data?.map(
              (item) => item.id,
            ) ?? []);
      let q = supabase.from("inventory").select("product_id, warehouse_id, quantity");
      if (warehouseIds) {
        if (!warehouseIds.length) return [];
        q = q.in("warehouse_id", warehouseIds);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
  const products = useQuery({
    queryKey: ["rep-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, unit, cost, price, reorder_level")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const revenue = (sales.data ?? []).reduce((sum, sale) => sum + Number(sale.total), 0);
  const cost = (sales.data ?? []).reduce((sum, sale) => sum + Number(sale.cost_total), 0);
  const expenseTotal = (expenses.data ?? []).reduce(
    (sum, expense) => sum + Number(expense.amount),
    0,
  );
  const cashSales = (sales.data ?? [])
    .filter((sale) => sale.payment_method === "CASH")
    .reduce((sum, sale) => sum + Number(sale.total), 0);
  const stockRows = useMemo(
    () =>
      (products.data ?? [])
        .map((product) => {
          const qty = (inventory.data ?? [])
            .filter((row) => row.product_id === product.id)
            .reduce((sum, row) => sum + Number(row.quantity), 0);
          return { ...product, qty, value: qty * Number(product.cost) };
        })
        .sort((a, b) => a.qty - b.qty),
    [products.data, inventory.data],
  );
  const topProducts = useMemo(() => {
    const map: Record<string, { qty: number; total: number; profit: number }> = {};
    for (const item of items.data ?? []) {
      const row = map[item.product_name] ?? { qty: 0, total: 0, profit: 0 };
      row.qty += Number(item.quantity);
      row.total += Number(item.line_total);
      row.profit += Number(item.line_total) - Number(item.unit_cost) * Number(item.quantity);
      map[item.product_name] = row;
    }
    return Object.entries(map)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 20);
  }, [items.data]);
  const byMethod = useMemo(() => {
    const map: Record<string, number> = {};
    for (const sale of sales.data ?? [])
      map[sale.payment_method] = (map[sale.payment_method] ?? 0) + Number(sale.total);
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [sales.data]);
  const byExpense = useMemo(() => {
    const map: Record<string, number> = {};
    for (const expense of expenses.data ?? [])
      map[expense.category] = (map[expense.category] ?? 0) + Number(expense.amount);
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [expenses.data]);

  if (!can("reports.view"))
    return <div className="p-10 text-center text-muted-foreground">لا تملك صلاحية التقارير.</div>;
  return (
    <div>
      <PageHeader
        title="التقارير الشاملة"
        description="المبيعات والمخزون والمصروفات والنقدية في مكان واحد."
      >
        <Button variant="outline" onClick={() => window.print()}>
          <Download className="size-4" /> تصدير PDF
        </Button>
      </PageHeader>
      <div className="space-y-5 p-4 sm:p-6" id="report-print-area">
        <div className="surface-card flex flex-wrap items-center gap-3 p-4 print:hidden">
          <Input
            className="w-40"
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
          <Input
            className="w-40"
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
          <Select value={branchId} onValueChange={setBranchId}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الفروع</SelectItem>
              {(branches.data ?? []).map((branch) => (
                <SelectItem key={branch.id} value={branch.id}>
                  {branch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            icon={ReceiptText}
            label="إجمالي المبيعات"
            value={money(revenue, currency)}
            sub={`${num(sales.data?.length ?? 0)} فاتورة`}
          />
          <Stat
            icon={TrendingUp}
            label="صافي الأداء"
            value={money(revenue - cost - expenseTotal, currency)}
            sub={`مصروفات ${money(expenseTotal, currency)}`}
          />
          <Stat
            icon={Banknote}
            label="المبيعات النقدية"
            value={money(cashSales, currency)}
            sub={`${num(shifts.data?.length ?? 0)} وردية`}
          />
          <Stat
            icon={Boxes}
            label="قيمة المخزون"
            value={money(
              stockRows.reduce((sum, row) => sum + row.value, 0),
              currency,
            )}
            sub={`${num(stockRows.filter((row) => row.qty <= Number(row.reorder_level)).length)} منخفض المخزون`}
          />
        </div>
        <Tabs defaultValue="sales">
          <TabsList className="print:hidden">
            <TabsTrigger value="sales">المبيعات</TabsTrigger>
            <TabsTrigger value="inventory">المخزون</TabsTrigger>
            <TabsTrigger value="expenses">المصروفات</TabsTrigger>
            <TabsTrigger value="cash">النقدية</TabsTrigger>
          </TabsList>
          <TabsContent value="sales" className="grid gap-5 lg:grid-cols-2">
            <ReportTable
              title="طرق الدفع"
              heads={["الطريقة", "الإجمالي"]}
              rows={byMethod.map(([method, total]) => [
                PAYMENT_LABELS[method] ?? method,
                money(total, currency),
              ])}
            />
            <ReportTable
              title="أفضل المنتجات"
              heads={["الصنف", "الكمية", "المبيعات", ...(can("profit.view") ? ["الربح"] : [])]}
              rows={topProducts.map(([name, value]) => [
                name,
                num(value.qty),
                money(value.total, currency),
                ...(can("profit.view") ? [money(value.profit, currency)] : []),
              ])}
            />
          </TabsContent>
          <TabsContent value="inventory">
            <ReportTable
              title="تقرير المخزون"
              heads={["المنتج", "الكمية", "تكلفة المخزون", "سعر البيع", "الحالة"]}
              rows={stockRows.map((row) => [
                row.name,
                `${num(row.qty)} ${row.unit}`,
                money(row.value, currency),
                money(row.price, currency),
                row.qty <= Number(row.reorder_level) ? "يحتاج طلب" : "متوفر",
              ])}
            />
          </TabsContent>
          <TabsContent value="expenses">
            <ReportTable
              title="المصروفات حسب التصنيف"
              heads={["التصنيف", "الإجمالي"]}
              rows={byExpense.map(([category, total]) => [category, money(total, currency)])}
            />
          </TabsContent>
          <TabsContent value="cash">
            <ReportTable
              title="جرد النقدية والورديات"
              heads={["الافتتاح", "المتوقع", "الإغلاق", "الفرق", "وقت الفتح", "الحالة"]}
              rows={(shifts.data ?? []).map((shift) => [
                money(shift.opening_cash, currency),
                money(shift.expected_cash, currency),
                money(shift.closing_cash, currency),
                money(Number(shift.closing_cash ?? 0) - Number(shift.expected_cash ?? 0), currency),
                dateTime(shift.opened_at),
                shift.status === "OPEN" ? "مفتوحة" : "مغلقة",
              ])}
            />
          </TabsContent>
        </Tabs>
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
  icon: typeof ReceiptText;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 pt-6">
        <span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-5" />
        </span>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-xl font-black tabular-nums">{value}</div>
          <div className="text-xs text-muted-foreground">{sub}</div>
        </div>
      </CardContent>
    </Card>
  );
}
function ReportTable({ title, heads, rows }: { title: string; heads: string[]; rows: string[][] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {heads.map((head) => (
                <TableHead key={head}>{head}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={index}>
                {row.map((cell, cellIndex) => (
                  <TableCell key={cellIndex}>{cell}</TableCell>
                ))}
              </TableRow>
            ))}
            {!rows.length && (
              <TableRow>
                <TableCell
                  colSpan={heads.length}
                  className="py-10 text-center text-muted-foreground"
                >
                  لا توجد بيانات في هذه الفترة.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
