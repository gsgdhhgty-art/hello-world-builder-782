import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Eye, FileSpreadsheet, Printer, Search, Undo2 } from "lucide-react";
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
import { dateTime, money, num, PAYMENT_LABELS } from "@/lib/format";
import { db, hasLocalDb, type LocalSale } from "@/lib/offline/db";
import { printReceipt, type ReceiptData } from "@/components/pos/ReceiptDialog";
import { exportCsv, exportExcel } from "@/lib/export";

export const Route = createFileRoute("/_authenticated/sales")({
  head: () => ({
    meta: [
      { title: "الفواتير — SmartPOS" },
      { name: "description", content: "سجل مبيعات متقدم مع فلاتر وتفاصيل كاملة لكل فاتورة." },
      { property: "og:title", content: "الفواتير — SmartPOS" },
      { property: "og:description", content: "استعراض الفواتير والعملاء والأصناف والدفعات." },
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
const today = () => new Date().toISOString().slice(0, 10);
const monthAgo = () => new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);

type SaleRow = {
  id: string;
  invoice_no: string;
  total: number;
  subtotal: number;
  discount: number;
  tax: number;
  cost_total: number;
  paid: number;
  change_due: number;
  payment_method: string;
  status: string;
  created_at: string;
  customer_id: string | null;
  cashier_id: string | null;
  branch_id: string | null;
  note?: string | null;
  sync_status?: string;
  items?: LocalSale["items"];
};

type SaleDetail = {
  items: Array<{
    id: string;
    product_name: string;
    quantity: number;
    unit_price: number;
    discount: number;
    tax: number;
    line_total: number;
  }>;
  payments: Array<{ method: string; amount: number; reference: string | null }>;
};

function SalesPage() {
  const { org, can } = useAuth();
  const qc = useQueryClient();
  const currency = org?.currency ?? "EGP";
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);
  const [branchId, setBranchId] = useState("all");
  const [status, setStatus] = useState("all");
  const [payment, setPayment] = useState("all");
  const [cashierId, setCashierId] = useState("all");
  const [paper, setPaper] = useState<"58" | "80">("80");
  const [search, setSearch] = useState("");
  const [openSale, setOpenSale] = useState<SaleRow | null>(null);
  const [returnQty, setReturnQty] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");

  const branches = useQuery({
    queryKey: ["branches-lite"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("branches")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const customers = useQuery({
    queryKey: ["customers-sale-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, phone")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const staff = useQuery({
    queryKey: ["staff-sale-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const sales = useQuery({
    queryKey: ["sales", from, to, branchId, status, payment, cashierId],
    queryFn: async (): Promise<SaleRow[]> => {
      let query = supabase
        .from("sales")
        .select(
          "id, invoice_no, total, subtotal, discount, tax, cost_total, paid, change_due, payment_method, status, created_at, customer_id, cashier_id, branch_id, note",
        )
        .gte("created_at", new Date(`${from}T00:00:00`).toISOString())
        .lte("created_at", new Date(`${to}T23:59:59`).toISOString())
        .order("created_at", { ascending: false })
        .limit(500);
      if (branchId !== "all") query = query.eq("branch_id", branchId);
      if (status !== "all")
        query = query.eq(
          "status",
          status as "COMPLETED" | "REFUNDED" | "PARTIALLY_REFUNDED" | "VOID",
        );
      if (payment !== "all") query = query.eq("payment_method", payment);
      if (cashierId !== "all") query = query.eq("cashier_id", cashierId);
      const { data, error } = await query;
      if (error) throw error;
      const cloud = (data ?? []) as SaleRow[];
      if (!hasLocalDb()) return cloud;
      const local = (await db().sales.toArray()).filter((sale) => sale.sync_status !== "SYNCED");
      const pending: SaleRow[] = local.map((sale) => ({
        ...sale,
        cost_total: sale.cost_total ?? 0,
        branch_id: null,
      }));
      const ids = new Set(cloud.map((sale) => sale.id));
      return [...pending.filter((sale) => !ids.has(sale.id)), ...cloud];
    },
  });

  const detail = useQuery({
    queryKey: ["sale-detail", openSale?.id],
    enabled: Boolean(openSale),
    queryFn: async (): Promise<SaleDetail> => {
      if (!openSale) return { items: [], payments: [] };
      if (openSale.items?.length)
        return {
          items: openSale.items.map((item, index) => ({ id: `${openSale.id}-${index}`, ...item })),
          payments: [{ method: openSale.payment_method, amount: openSale.paid, reference: null }],
        };
      const [itemResult, paymentResult] = await Promise.all([
        supabase
          .from("sale_items")
          .select("id, product_name, quantity, unit_price, discount, tax, line_total")
          .eq("sale_id", openSale.id),
        supabase
          .from("sale_payments")
          .select("method, amount, reference")
          .eq("sale_id", openSale.id),
      ]);
      if (itemResult.error) throw itemResult.error;
      if (paymentResult.error) throw paymentResult.error;
      return { items: itemResult.data ?? [], payments: paymentResult.data ?? [] };
    },
  });

  const doReturn = useMutation({
    mutationFn: async () => {
      if (!openSale || openSale.sync_status === "PENDING") throw new Error("offline");
      const payload = Object.entries(returnQty)
        .filter(([, value]) => Number(value) > 0)
        .map(([sale_item_id, value]) => ({ sale_item_id, quantity: Number(value) }));
      if (!payload.length) throw new Error("empty");
      const { data, error } = await supabase.rpc("create_return", {
        _sale_id: openSale.id,
        _items: payload,
        ...(reason ? { _reason: reason } : {}),
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
    onError: (error: Error) =>
      toast.error(
        error.message === "offline"
          ? "زامن الفاتورة أولًا"
          : error.message === "empty"
            ? "أدخل كمية للإرجاع"
            : "تعذر تنفيذ المرتجع",
      ),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (sales.data ?? []).filter((sale) => {
      const customer = customers.data?.find((item) => item.id === sale.customer_id);
      return (
        !q ||
        sale.invoice_no.toLowerCase().includes(q) ||
        customer?.name.toLowerCase().includes(q) ||
        customer?.phone?.includes(q)
      );
    });
  }, [sales.data, search, customers.data]);
  const selectedCustomer = customers.data?.find((item) => item.id === openSale?.customer_id);
  const selectedCashier =
    staff.data?.find((item) => item.id === openSale?.cashier_id)?.full_name ?? "—";
  const selectedBranch =
    branches.data?.find((item) => item.id === openSale?.branch_id)?.name ?? "—";
  const exportHeaders = [
    "الفاتورة",
    "التاريخ",
    "الفرع",
    "الكاشير",
    "طريقة الدفع",
    "الضريبة",
    "الإجمالي",
    "الحالة",
  ];
  const exportRows = filtered.map((sale) => [
    sale.invoice_no,
    dateTime(sale.created_at),
    branches.data?.find((item) => item.id === sale.branch_id)?.name ?? "محلي",
    staff.data?.find((item) => item.id === sale.cashier_id)?.full_name ?? "—",
    PAYMENT_LABELS[sale.payment_method] ?? sale.payment_method,
    Number(sale.tax),
    Number(sale.total),
    STATUS_LABELS[sale.status] ?? sale.status,
  ]);

  function printSelected() {
    if (!openSale || !detail.data) return;
    const receipt: ReceiptData = {
      invoice_no: openSale.invoice_no,
      total: Number(openSale.total),
      subtotal: Number(openSale.subtotal),
      discount: Number(openSale.discount),
      tax: Number(openSale.tax),
      paid: Number(openSale.paid),
      change_due: Number(openSale.change_due),
      payment_method: openSale.payment_method,
      offline: openSale.sync_status === "PENDING",
      cashier: selectedCashier,
      customer: selectedCustomer?.name,
      created_at: openSale.created_at,
      payments: detail.data.payments.map((item) => ({
        method: item.method,
        amount: Number(item.amount),
        reference: item.reference,
      })),
      ...(can("profit.view")
        ? {
            profit:
              Number(openSale.subtotal) -
              Number(openSale.discount) -
              Number(openSale.cost_total ?? 0),
          }
        : {}),
      items: detail.data.items.map((item) => ({
        name: item.product_name,
        quantity: Number(item.quantity),
        unit_price: Number(item.unit_price),
        line_total: Number(item.line_total),
      })),
    };
    const opened = printReceipt(
      receipt,
      {
        name: org?.name ?? "متجري",
        address: org?.address,
        phone: org?.phone,
        tax_number: org?.tax_number,
      },
      currency,
      paper,
    );
    if (!opened) toast.error("اسمح بالنوافذ المنبثقة لطباعة الفاتورة");
  }

  return (
    <div>
      <PageHeader title="المبيعات" description="ابحث وصفِّ وراجع كل فاتورة ودفعاتها.">
        <Button
          variant="outline"
          onClick={() => exportCsv(`invoices-${from}-${to}`, exportHeaders, exportRows)}
        >
          <Download /> CSV
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            exportExcel(`invoices-${from}-${to}`, "الفواتير", exportHeaders, exportRows)
          }
        >
          <FileSpreadsheet /> Excel
        </Button>
      </PageHeader>
      <div className="page-canvas space-y-4">
        <div className="surface-card grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-7">
          <div className="relative md:col-span-2">
            <Search className="absolute start-3 top-3 size-4 text-muted-foreground" />
            <Input
              className="ps-9"
              placeholder="رقم الفاتورة، العميل أو الجوال"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <Input
            type="date"
            aria-label="من تاريخ"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
          <Input
            type="date"
            aria-label="إلى تاريخ"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
          <Select value={branchId} onValueChange={setBranchId}>
            <SelectTrigger>
              <SelectValue placeholder="الفرع" />
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
          <Select value={cashierId} onValueChange={setCashierId}>
            <SelectTrigger>
              <SelectValue placeholder="الكاشير" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الكاشيرين</SelectItem>
              {(staff.data ?? []).map((person) => (
                <SelectItem key={person.id} value={person.id}>
                  {person.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="grid grid-cols-2 gap-2">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الحالات</SelectItem>
                {Object.entries(STATUS_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={payment} onValueChange={setPayment}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الدفع</SelectItem>
                {Object.entries(PAYMENT_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="data-panel">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الفاتورة</TableHead>
                <TableHead>العميل</TableHead>
                <TableHead>الفرع</TableHead>
                <TableHead>الوقت</TableHead>
                <TableHead>الدفع</TableHead>
                <TableHead>الإجمالي</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((sale) => (
                <TableRow key={sale.id}>
                  <TableCell className="font-bold">{sale.invoice_no}</TableCell>
                  <TableCell>
                    {customers.data?.find((item) => item.id === sale.customer_id)?.name ??
                      "عميل نقدي"}
                  </TableCell>
                  <TableCell>
                    {branches.data?.find((item) => item.id === sale.branch_id)?.name ?? "محلي"}
                  </TableCell>
                  <TableCell>{dateTime(sale.created_at)}</TableCell>
                  <TableCell>
                    {PAYMENT_LABELS[sale.payment_method] ?? sale.payment_method}
                  </TableCell>
                  <TableCell className="font-black">{money(sale.total, currency)}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        sale.sync_status === "PENDING"
                          ? "secondary"
                          : sale.status === "COMPLETED"
                            ? "default"
                            : "outline"
                      }
                    >
                      {sale.sync_status === "PENDING"
                        ? "بانتظار المزامنة"
                        : (STATUS_LABELS[sale.status] ?? sale.status)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="عرض التفاصيل"
                      onClick={() => setOpenSale(sale)}
                    >
                      <Eye className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!filtered.length && (
                <TableRow>
                  <TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
                    لا توجد فواتير مطابقة.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
      <Dialog
        open={Boolean(openSale)}
        onOpenChange={(value) => {
          if (!value) {
            setOpenSale(null);
            setReturnQty({});
          }
        }}
      >
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>فاتورة {openSale?.invoice_no}</DialogTitle>
          </DialogHeader>
          {openSale && (
            <div className="space-y-5">
              <div className="grid gap-3 rounded-xl bg-secondary/60 p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <Info
                  label="العميل"
                  value={selectedCustomer?.name ?? "عميل نقدي"}
                  sub={selectedCustomer?.phone ?? undefined}
                />
                <Info label="الفرع" value={selectedBranch} />
                <Info label="الكاشير" value={selectedCashier} />
                <Info label="التاريخ والوقت" value={dateTime(openSale.created_at)} />
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>الصنف</TableHead>
                      <TableHead>الكمية</TableHead>
                      <TableHead>السعر</TableHead>
                      <TableHead>الخصم</TableHead>
                      <TableHead>الإجمالي</TableHead>
                      {can("sales.refund") && <TableHead>إرجاع</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(detail.data?.items ?? []).map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.product_name}</TableCell>
                        <TableCell>{num(item.quantity)}</TableCell>
                        <TableCell>{money(item.unit_price, currency)}</TableCell>
                        <TableCell>{money(item.discount, currency)}</TableCell>
                        <TableCell>{money(item.line_total, currency)}</TableCell>
                        {can("sales.refund") && (
                          <TableCell>
                            <Input
                              className="h-8 w-20"
                              type="number"
                              min="0"
                              max={item.quantity}
                              value={returnQty[item.id] ?? ""}
                              onChange={(event) =>
                                setReturnQty({ ...returnQty, [item.id]: event.target.value })
                              }
                            />
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border p-4">
                  <h3 className="mb-3 font-bold">الدفعات</h3>
                  {(detail.data?.payments ?? []).map((item, index) => (
                    <div key={`${item.method}-${index}`} className="flex justify-between py-1">
                      <span>{PAYMENT_LABELS[item.method] ?? item.method}</span>
                      <span className="font-bold">{money(item.amount, currency)}</span>
                    </div>
                  ))}
                </div>
                <div className="rounded-xl border p-4">
                  <Info label="الإجمالي الفرعي" value={money(openSale.subtotal, currency)} />
                  <Info label="الخصم" value={money(openSale.discount, currency)} />
                  <Info label="الضريبة" value={money(openSale.tax, currency)} />
                  {can("profit.view") && (
                    <Info
                      label="الربح"
                      value={money(Number(openSale.subtotal) - Number(openSale.discount) - Number(openSale.cost_total ?? 0), currency)}
                    />
                  )}
                  <div className="mt-2 flex justify-between border-t pt-2 text-lg font-black">
                    <span>الإجمالي</span>
                    <span>{money(openSale.total, currency)}</span>
                  </div>
                </div>
              </div>
              {can("sales.refund") && openSale.sync_status !== "PENDING" && (
                <div className="space-y-2">
                  <Label htmlFor="return-reason">سبب الإرجاع</Label>
                  <Input
                    id="return-reason"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  />
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenSale(null)}>
              إغلاق
            </Button>
            <Select value={paper} onValueChange={(value) => setPaper(value as "58" | "80")}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="58">58 مم</SelectItem>
                <SelectItem value="80">80 مم</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={printSelected} disabled={!detail.data}>
              <Printer className="size-4" /> طباعة
            </Button>
            {can("sales.refund") && openSale?.sync_status !== "PENDING" && (
              <Button onClick={() => doReturn.mutate()} disabled={doReturn.isPending}>
                <Undo2 className="size-4" /> تنفيذ المرتجع
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Info({ label, value, sub }: { label: string; value: string; sub?: string | undefined }) {
  return (
    <div className="flex justify-between gap-3 sm:block">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="font-bold">{value}</div>
      {sub && (
        <div className="text-xs text-muted-foreground" dir="ltr">
          {sub}
        </div>
      )}
    </div>
  );
}
