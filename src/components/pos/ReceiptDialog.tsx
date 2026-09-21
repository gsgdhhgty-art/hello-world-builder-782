import { useEffect, useState } from "react";
import { CheckCircle2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { dateTime, money, num, PAYMENT_LABELS } from "@/lib/format";

export interface ReceiptData {
  invoice_no: string;
  total: number;
  subtotal: number;
  discount: number;
  tax: number;
  paid: number;
  change_due: number;
  credit?: number;
  payment_method: string;
  offline: boolean;
  cashier: string;
  customer?: string | null | undefined;
  created_at: string;
  payments: Array<{ method: string; amount: number; reference?: string | null }>;
  items: Array<{
    name: string;
    sku?: string | null;
    quantity: number;
    unit_price: number;
    line_total: number;
  }>;
}

export interface ReceiptBusiness {
  name: string;
  address?: string | null | undefined;
  phone?: string | null | undefined;
  tax_number?: string | null | undefined;
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>'"]/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      })[char] ?? char,
  );
}

/** Local receipt printing — works with no internet (browser print dialog only). */
export function printReceipt(receipt: ReceiptData, business: ReceiptBusiness, currency: string, paper: "58" | "80" = "80") {
  const rows = receipt.items
    .map(
      (i) =>
        `<tr><td>${escapeHtml(i.name)}${i.sku ? `<small>${escapeHtml(i.sku)}</small>` : ""}</td><td>${num(i.quantity, 0)}</td><td>${money(i.unit_price, currency)}</td><td>${money(i.line_total, currency)}</td></tr>`,
    )
    .join("");
  const html = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
  <title>${receipt.invoice_no}</title><style>
  @page{size:${paper}mm auto;margin:0}*{box-sizing:border-box}body{font-family:system-ui,sans-serif;width:${paper}mm;margin:0 auto;padding:${paper === "58" ? "4px" : "8px"};font-size:${paper === "58" ? "10px" : "12px"};color:#000}
  h1{font-size:18px;text-align:center;margin:4px 0}.brand{text-align:center;margin-bottom:8px}.brand div{margin:1px 0}
  table{width:100%;border-collapse:collapse;margin-top:8px}
  th,td{text-align:start;padding:3px 2px;font-size:${paper === "58" ? "9px" : "11px"};vertical-align:top}th{border-bottom:1px solid #000}.total{font-size:14px}
  tfoot td{border-top:1px dashed #000;padding-top:4px;font-weight:700}
  .c{text-align:center}.muted{color:#555;font-size:11px}small{display:block;color:#666;font-size:9px}.payments{border-top:1px dashed #000;margin-top:8px;padding-top:5px}.payment{display:flex;justify-content:space-between}
  </style></head><body>
  <div class="brand"><h1>${escapeHtml(business.name)}</h1>
  ${business.address ? `<div>${escapeHtml(business.address)}</div>` : ""}
  ${business.phone ? `<div dir="ltr">${escapeHtml(business.phone)}</div>` : ""}
  ${business.tax_number ? `<div>الرقم الضريبي: ${escapeHtml(business.tax_number)}</div>` : ""}</div>
  <div class="c muted">فاتورة ${receipt.invoice_no}</div>
  <div class="c muted">${dateTime(receipt.created_at)}</div>
  <div class="muted">الكاشير: ${escapeHtml(receipt.cashier)}</div>
  ${receipt.customer ? `<div class="muted">العميل: ${escapeHtml(receipt.customer)}</div>` : ""}
  <table><thead><tr><th>الصنف</th><th>كمية</th><th>سعر</th><th>الإجمالي</th></tr></thead>
  <tbody>${rows}</tbody>
  <tfoot>
    <tr><td colspan="3">الإجمالي الفرعي</td><td>${money(receipt.subtotal, currency)}</td></tr>
    <tr><td colspan="3">الخصم</td><td>${money(receipt.discount, currency)}</td></tr>
    <tr><td colspan="3">الضريبة</td><td>${money(receipt.tax, currency)}</td></tr>
     <tr class="total"><td colspan="3">الإجمالي شامل الضريبة</td><td>${money(receipt.total, currency)}</td></tr>
    <tr><td colspan="3">المدفوع</td><td>${money(receipt.paid, currency)}</td></tr>
    <tr><td colspan="3">الباقي</td><td>${money(receipt.change_due, currency)}</td></tr>
    ${receipt.credit ? `<tr><td colspan="3">آجل</td><td>${money(receipt.credit, currency)}</td></tr>` : ""}
  </tfoot></table><div class="payments"><strong>تفاصيل الدفع</strong>${receipt.payments.map((p) => `<div class="payment"><span>${escapeHtml(PAYMENT_LABELS[p.method] ?? p.method)}</span><span>${money(p.amount, currency)}</span></div>`).join("")}</div>
  <p class="c muted">شكرًا لزيارتكم</p>
  <script>window.onload=function(){window.print();}</script>
  </body></html>`;
  const w = window.open("", "_blank", "width=380,height=600");
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  return true;
}

export function ReceiptDialog({
  receipt,
  onClose,
  business,
  currency,
}: {
  receipt: ReceiptData | null;
  onClose: () => void;
  business: ReceiptBusiness;
  currency: string;
}) {
  const [paper, setPaper] = useState<"58" | "80">("80");
  // تنظيف بعد إغلاق النافذة حتى تبقى الشاشة قابلة للاستخدام فورًا
  useEffect(() => {
    if (!receipt) document.body.style.pointerEvents = "";
  }, [receipt]);

  return (
    <Dialog open={!!receipt} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-emerald-500" />
            تم إتمام البيع
          </DialogTitle>
        </DialogHeader>
        {receipt && (
          <div className="space-y-4 text-sm">
            <div className="rounded-lg border bg-muted/30 p-4 text-center">
              <div className="font-black text-primary">{business.name}</div>
              <div className="mt-2 text-xs text-muted-foreground">فاتورة مبيعات</div>
              <div className="text-xl font-black">{receipt.invoice_no}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {dateTime(receipt.created_at)}
              </div>
              <div className="mt-3 text-3xl font-black text-primary">
                {money(receipt.total, currency)}
              </div>
              {receipt.change_due > 0 && (
                <div className="mt-1 font-bold text-emerald-600 dark:text-emerald-400">
                  الباقي للعميل: {money(receipt.change_due, currency)}
                </div>
              )}
              {!!receipt.credit && receipt.credit > 0 && (
                <div className="mt-1 font-bold text-destructive">
                  دين على العميل: {money(receipt.credit, currency)}
                </div>
              )}
            </div>
            <div className="max-h-56 overflow-y-auto rounded-lg border">
              <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-2 border-b bg-muted/40 px-3 py-2 text-xs font-bold text-muted-foreground">
                <span>الصنف</span>
                <span>الكمية</span>
                <span>السعر</span>
                <span>الإجمالي</span>
              </div>
              {receipt.items.map((item, index) => (
                <div
                  key={`${item.name}-${index}`}
                  className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-2 border-b px-3 py-2 last:border-0"
                >
                  <span className="min-w-0 truncate font-semibold">{item.name}</span>
                  <span className="tabular-nums">{num(item.quantity)}</span>
                  <span className="tabular-nums">{money(item.unit_price, currency)}</span>
                  <span className="font-bold tabular-nums">{money(item.line_total, currency)}</span>
                </div>
              ))}
            </div>
            <div className="space-y-1 rounded-lg border p-3">
              <ReceiptRow label="الإجمالي الفرعي" value={money(receipt.subtotal, currency)} />
              <ReceiptRow label="الخصم" value={money(receipt.discount, currency)} />
              <ReceiptRow label="الضريبة" value={money(receipt.tax, currency)} />
              <div className="my-2 border-t" />
              <ReceiptRow label="الإجمالي شامل الضريبة" value={money(receipt.total, currency)} />
              <ReceiptRow label="المدفوع" value={money(receipt.paid, currency)} />
              {receipt.payments.map((payment, index) => (
                <ReceiptRow
                  key={`${payment.method}-${index}`}
                  label={PAYMENT_LABELS[payment.method] ?? payment.method}
                  value={money(payment.amount, currency)}
                />
              ))}
            </div>
            {receipt.offline && (
              <p className="rounded-lg bg-amber-500/10 p-2 text-xs font-semibold text-amber-600 dark:text-amber-400">
                محفوظة محليًا — سترسل تلقائيًا عند عودة الإنترنت.
              </p>
            )}
          </div>
        )}
        <DialogFooter>
          <div className="me-auto flex rounded-md border p-1">
            <Button size="sm" variant={paper === "58" ? "default" : "ghost"} onClick={() => setPaper("58")}>58 مم</Button>
            <Button size="sm" variant={paper === "80" ? "default" : "ghost"} onClick={() => setPaper("80")}>80 مم</Button>
          </div>
          <Button variant="outline" onClick={onClose}>
            فاتورة جديدة
          </Button>
          <Button onClick={() => { if (receipt && !printReceipt(receipt, business, currency, paper)) window.alert("اسمح بالنوافذ المنبثقة لطباعة الإيصال."); }}>
            <Printer className="size-4" /> طباعة الإيصال
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReceiptRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-bold tabular-nums">{value}</span>
    </div>
  );
}
