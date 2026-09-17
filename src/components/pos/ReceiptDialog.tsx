import { useEffect } from "react";
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
  customer?: string | null;
  created_at: string;
  items: Array<{ name: string; quantity: number; unit_price: number; line_total: number }>;
}

/** Local receipt printing — works with no internet (browser print dialog only). */
function printReceipt(receipt: ReceiptData, org: string, currency: string) {
  const rows = receipt.items
    .map(
      (i) =>
        `<tr><td>${i.name}</td><td>${num(i.quantity, 0)}</td><td>${money(i.unit_price, currency)}</td><td>${money(i.line_total, currency)}</td></tr>`,
    )
    .join("");
  const html = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
  <title>${receipt.invoice_no}</title><style>
  body{font-family:system-ui,sans-serif;width:80mm;margin:0 auto;padding:8px;font-size:12px}
  h1{font-size:16px;text-align:center;margin:4px 0}
  table{width:100%;border-collapse:collapse;margin-top:8px}
  th,td{text-align:start;padding:2px 0;font-size:11px}
  tfoot td{border-top:1px dashed #000;padding-top:4px;font-weight:700}
  .c{text-align:center}.muted{color:#555;font-size:11px}
  </style></head><body>
  <h1>${org}</h1>
  <div class="c muted">فاتورة ${receipt.invoice_no}</div>
  <div class="c muted">${dateTime(receipt.created_at)}</div>
  <div class="muted">الكاشير: ${receipt.cashier}</div>
  ${receipt.customer ? `<div class="muted">العميل: ${receipt.customer}</div>` : ""}
  <table><thead><tr><th>الصنف</th><th>كمية</th><th>سعر</th><th>الإجمالي</th></tr></thead>
  <tbody>${rows}</tbody>
  <tfoot>
    <tr><td colspan="3">الإجمالي الفرعي</td><td>${money(receipt.subtotal, currency)}</td></tr>
    <tr><td colspan="3">الخصم</td><td>${money(receipt.discount, currency)}</td></tr>
    <tr><td colspan="3">الضريبة</td><td>${money(receipt.tax, currency)}</td></tr>
    <tr><td colspan="3">الإجمالي</td><td>${money(receipt.total, currency)}</td></tr>
    <tr><td colspan="3">المدفوع</td><td>${money(receipt.paid, currency)}</td></tr>
    <tr><td colspan="3">الباقي</td><td>${money(receipt.change_due, currency)}</td></tr>
    ${receipt.credit ? `<tr><td colspan="3">آجل</td><td>${money(receipt.credit, currency)}</td></tr>` : ""}
  </tfoot></table>
  <p class="c muted">شكرًا لزيارتكم</p>
  <script>window.onload=function(){window.print();}</script>
  </body></html>`;
  const w = window.open("", "_blank", "width=380,height=600");
  if (!w) return;
  w.document.write(html);
  w.document.close();
}

export function ReceiptDialog({
  receipt,
  onClose,
  org,
  currency,
}: {
  receipt: ReceiptData | null;
  onClose: () => void;
  org: string;
  currency: string;
}) {
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
          <div className="space-y-2 text-sm">
            <div className="rounded-xl border bg-muted/40 p-4 text-center">
              <div className="text-xs text-muted-foreground">فاتورة</div>
              <div className="text-xl font-black">{receipt.invoice_no}</div>
              <div className="mt-2 text-2xl font-black text-primary">
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
            <div className="flex justify-between">
              <span className="text-muted-foreground">طريقة الدفع</span>
              <span className="font-semibold">
                {PAYMENT_LABELS[receipt.payment_method] ?? receipt.payment_method}
              </span>
            </div>
            {receipt.offline && (
              <p className="rounded-lg bg-amber-500/10 p-2 text-xs font-semibold text-amber-600 dark:text-amber-400">
                محفوظة محليًا — سترسل تلقائيًا عند عودة الإنترنت.
              </p>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            فاتورة جديدة
          </Button>
          <Button onClick={() => receipt && printReceipt(receipt, org, currency)}>
            <Printer className="size-4" /> طباعة الإيصال
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
