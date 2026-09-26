import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HandCoins, Printer, Search, Wallet } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { EmptyState } from "@/components/EmptyState";
import { dateTime, money, PAYMENT_LABELS } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/credit-accounts")({
  head: () => ({
    meta: [
      { title: "الحسابات الآجلة — SmartPOS" },
      {
        name: "description",
        content: "متابعة أرصدة البيع الآجل، تحصيل الدفعات، وطباعة كشف حساب العميل.",
      },
      { property: "og:title", content: "الحسابات الآجلة — SmartPOS" },
      { property: "og:description", content: "كشوف حسابات العملاء وتحصيل المبالغ المؤجلة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CreditAccountsPage,
});

type LedgerSale = {
  id: string;
  invoice_no: string;
  created_at: string;
  total: number;
  paid: number;
  credit: number;
  payment_method: string;
  status: string;
  items: { name: string; quantity: number; unit_price: number; line_total: number }[];
};

type LedgerPayment = {
  id: string;
  amount: number;
  method: string;
  note: string | null;
  balance_after: number;
  created_at: string;
};

type Ledger = {
  customer: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    balance: number;
  };
  sales: LedgerSale[];
  payments: LedgerPayment[];
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildStatementHtml(
  ledger: Ledger,
  business: { name: string; phone?: string | null; address?: string | null },
  currency: string,
) {
  const rows = ledger.sales
    .map(
      (sale) => `<tr>
        <td>${escapeHtml(sale.invoice_no)}</td>
        <td>${escapeHtml(dateTime(sale.created_at))}</td>
        <td>${escapeHtml(sale.items.map((i) => `${i.name} ×${i.quantity}`).join("، "))}</td>
        <td>${escapeHtml(money(sale.total, currency))}</td>
        <td>${escapeHtml(money(sale.paid, currency))}</td>
        <td>${escapeHtml(money(sale.credit, currency))}</td>
      </tr>`,
    )
    .join("");
  const payments = ledger.payments
    .map(
      (payment) => `<tr>
        <td>${escapeHtml(dateTime(payment.created_at))}</td>
        <td>${escapeHtml(PAYMENT_LABELS[payment.method] ?? payment.method)}</td>
        <td>${escapeHtml(money(payment.amount, currency))}</td>
        <td>${escapeHtml(money(payment.balance_after, currency))}</td>
        <td>${escapeHtml(payment.note ?? "-")}</td>
      </tr>`,
    )
    .join("");

  return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8" />
  <title>كشف حساب ${escapeHtml(ledger.customer.name)}</title>
  <style>
    body{font-family:"Segoe UI",Tahoma,sans-serif;padding:24px;color:#111}
    h1{font-size:20px;margin:0}
    .muted{color:#555;font-size:12px}
    table{width:100%;border-collapse:collapse;margin-top:12px;font-size:12px}
    th,td{border:1px solid #ccc;padding:6px;text-align:right}
    th{background:#f2f4f7}
    .total{margin-top:16px;font-size:16px;font-weight:700}
    h2{font-size:14px;margin-top:24px}
  </style></head><body onload="window.print()">
  <h1>${escapeHtml(business.name)}</h1>
  <div class="muted">${escapeHtml(business.address ?? "")} ${escapeHtml(business.phone ?? "")}</div>
  <h2>كشف حساب آجل — ${escapeHtml(ledger.customer.name)} ${escapeHtml(ledger.customer.phone ?? "")}</h2>
  <div class="muted">تاريخ الطباعة: ${escapeHtml(dateTime(new Date().toISOString()))}</div>
  <h2>الفواتير</h2>
  <table><thead><tr><th>الفاتورة</th><th>التاريخ</th><th>الأصناف</th><th>الإجمالي</th><th>المدفوع</th><th>المتبقي</th></tr></thead>
  <tbody>${rows || '<tr><td colspan="6">لا توجد فواتير</td></tr>'}</tbody></table>
  <h2>الدفعات</h2>
  <table><thead><tr><th>التاريخ</th><th>الطريقة</th><th>المبلغ</th><th>الرصيد بعدها</th><th>ملاحظة</th></tr></thead>
  <tbody>${payments || '<tr><td colspan="5">لا توجد دفعات</td></tr>'}</tbody></table>
  <div class="total">الرصيد المستحق: ${escapeHtml(money(ledger.customer.balance, currency))}</div>
  </body></html>`;
}

function CreditAccountsPage() {
  const { org, can } = useAuth();
  const qc = useQueryClient();
  const currency = org?.currency ?? "EGP";
  const allowed = can("sales.create") || can("customers.manage");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("CASH");
  const [note, setNote] = useState("");

  const customers = useQuery({
    queryKey: ["credit-customers"],
    enabled: allowed,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, phone, balance")
        .order("balance", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const ledger = useQuery({
    queryKey: ["customer-ledger", selectedId],
    enabled: allowed && !!selectedId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_customer_ledger", {
        _customer_id: selectedId!,
      });
      if (error) throw error;
      return data as unknown as Ledger;
    },
  });

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (customers.data ?? []).filter(
      (c) => !query || c.name.toLowerCase().includes(query) || (c.phone ?? "").includes(query),
    );
  }, [customers.data, search]);

  const totalDue = (customers.data ?? []).reduce((sum, c) => sum + Number(c.balance), 0);
  const dueCount = (customers.data ?? []).filter((c) => Number(c.balance) > 0).length;

  const pay = useMutation({
    mutationFn: async () => {
      const value = Number(amount);
      if (!selectedId) throw new Error("no customer");
      if (!Number.isFinite(value) || value <= 0) throw new Error("invalid amount");
      const { error } = await supabase.rpc("record_customer_payment", {
        _customer_id: selectedId,
        _amount: value,
        _method: method,
        _note: note,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم تسجيل الدفعة");
      setPayOpen(false);
      setAmount("");
      setNote("");
      void qc.invalidateQueries({ queryKey: ["credit-customers"] });
      void qc.invalidateQueries({ queryKey: ["customer-ledger", selectedId] });
      void qc.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (error: Error) => {
      const message = error.message.includes("exceeds")
        ? "المبلغ أكبر من الرصيد المستحق"
        : "تعذر تسجيل الدفعة";
      toast.error(message);
    },
  });

  const printStatement = () => {
    if (!ledger.data) return;
    const html = buildStatementHtml(
      ledger.data,
      { name: org?.name ?? "المتجر", phone: org?.phone, address: org?.address },
      currency,
    );
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) {
      toast.error("تعذر فتح نافذة الطباعة");
      return;
    }
    win.document.write(html);
    win.document.close();
  };

  if (!allowed) {
    return (
      <div>
        <PageHeader title="الحسابات الآجلة" description="متابعة أرصدة العملاء." />
        <EmptyState
          icon={Wallet}
          title="لا تملك صلاحية الاطلاع"
          description="اطلب من مدير المتجر منحك صلاحية البيع أو إدارة العملاء."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="الحسابات الآجلة"
        description="أرصدة العملاء المؤجلة، تحصيل الدفعات، وطباعة كشف الحساب."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">إجمالي المستحق</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{money(totalDue, currency)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">عملاء عليهم مبالغ</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{dueCount}</CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">العملاء</CardTitle>
            <div className="relative mt-2">
              <Search className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث بالاسم أو رقم الهاتف"
                className="pr-9"
              />
            </div>
          </CardHeader>
          <CardContent className="max-h-[520px] space-y-2 overflow-auto">
            {filtered.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">لا يوجد عملاء</p>
            ) : (
              filtered.map((customer) => (
                <button
                  key={customer.id}
                  type="button"
                  onClick={() => setSelectedId(customer.id)}
                  className={`flex w-full items-center justify-between rounded-lg border p-3 text-right transition ${
                    selectedId === customer.id ? "border-primary bg-primary/10" : "hover:bg-muted"
                  }`}
                >
                  <span>
                    <span className="block font-medium">{customer.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {customer.phone ?? "—"}
                    </span>
                  </span>
                  <span
                    className={`text-sm font-semibold ${Number(customer.balance) > 0 ? "text-destructive" : "text-muted-foreground"}`}
                  >
                    {money(customer.balance, currency)}
                  </span>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">
              {ledger.data ? `كشف حساب ${ledger.data.customer.name}` : "اختر عميلًا"}
            </CardTitle>
            {ledger.data && (
              <div className="flex gap-2">
                <Button
                  size="lg"
                  onClick={() => setPayOpen(true)}
                  disabled={Number(ledger.data.customer.balance) <= 0}
                >
                  <HandCoins className="ms-2 size-4" /> تحصيل دفعة
                </Button>
                <Button size="lg" variant="outline" onClick={printStatement}>
                  <Printer className="ms-2 size-4" /> طباعة الكشف
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {!selectedId ? (
              <EmptyState
                icon={Wallet}
                title="اختر عميلًا من القائمة"
                description="ستظهر هنا فواتيره الآجلة ودفعاته ورصيده المستحق."
              />
            ) : ledger.isLoading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">جارٍ التحميل…</p>
            ) : ledger.data ? (
              <div className="space-y-6">
                <div className="rounded-lg border p-4">
                  <p className="text-sm text-muted-foreground">الرصيد المستحق</p>
                  <p className="text-2xl font-bold text-destructive">
                    {money(ledger.data.customer.balance, currency)}
                  </p>
                </div>

                <div>
                  <h3 className="mb-2 text-sm font-semibold">الفواتير</h3>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>الفاتورة</TableHead>
                          <TableHead>التاريخ</TableHead>
                          <TableHead>الأصناف</TableHead>
                          <TableHead>الإجمالي</TableHead>
                          <TableHead>المدفوع</TableHead>
                          <TableHead>المتبقي</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {ledger.data.sales.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-muted-foreground">
                              لا توجد فواتير
                            </TableCell>
                          </TableRow>
                        ) : (
                          ledger.data.sales.map((sale) => (
                            <TableRow key={sale.id}>
                              <TableCell className="font-medium">{sale.invoice_no}</TableCell>
                              <TableCell>{dateTime(sale.created_at)}</TableCell>
                              <TableCell className="max-w-[260px] truncate">
                                {sale.items.map((i) => `${i.name} ×${i.quantity}`).join("، ")}
                              </TableCell>
                              <TableCell>{money(sale.total, currency)}</TableCell>
                              <TableCell>{money(sale.paid, currency)}</TableCell>
                              <TableCell
                                className={Number(sale.credit) > 0 ? "text-destructive" : ""}
                              >
                                {money(sale.credit, currency)}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <div>
                  <h3 className="mb-2 text-sm font-semibold">الدفعات</h3>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>التاريخ</TableHead>
                          <TableHead>الطريقة</TableHead>
                          <TableHead>المبلغ</TableHead>
                          <TableHead>الرصيد بعدها</TableHead>
                          <TableHead>ملاحظة</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {ledger.data.payments.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center text-muted-foreground">
                              لا توجد دفعات
                            </TableCell>
                          </TableRow>
                        ) : (
                          ledger.data.payments.map((payment) => (
                            <TableRow key={payment.id}>
                              <TableCell>{dateTime(payment.created_at)}</TableCell>
                              <TableCell>
                                {PAYMENT_LABELS[payment.method] ?? payment.method}
                              </TableCell>
                              <TableCell>{money(payment.amount, currency)}</TableCell>
                              <TableCell>{money(payment.balance_after, currency)}</TableCell>
                              <TableCell>{payment.note ?? "—"}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-destructive">تعذر تحميل كشف الحساب</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تحصيل دفعة من {ledger.data?.customer.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>المبلغ</Label>
              <Input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="h-12 text-lg"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                الرصيد الحالي: {money(ledger.data?.customer.balance ?? 0, currency)}
              </p>
            </div>
            <div>
              <Label>طريقة الدفع</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger className="h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">نقدي</SelectItem>
                  <SelectItem value="CARD">بطاقة</SelectItem>
                  <SelectItem value="TRANSFER">تحويل</SelectItem>
                  <SelectItem value="WALLET">محفظة</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>ملاحظة</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setAmount(String(ledger.data?.customer.balance ?? ""))}
            >
              سداد كامل الرصيد
            </Button>
          </div>
          <DialogFooter>
            <Button size="lg" onClick={() => pay.mutate()} disabled={pay.isPending}>
              تأكيد الدفعة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
