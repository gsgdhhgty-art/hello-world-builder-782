import { useEffect, useState } from "react";
import { CheckCircle2, Printer } from "lucide-react";
import JsBarcode from "jsbarcode";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { dateTime, money, num, PAYMENT_LABELS } from "@/lib/format";
import { toast } from "sonner";
import { nativeBridge, printSilently } from "@/lib/hardware";

export interface ReceiptData {
  invoice_no: string;
  total: number;
  subtotal: number;
  discount: number;
  tax: number;
  profit?: number;
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
  business_type?: string | null | undefined;
  address?: string | null | undefined;
  phone?: string | null | undefined;
  tax_number?: string | null | undefined;
  commercial_register?: string | null | undefined;
  logo_url?: string | null | undefined;
  receipt_header?: string | null | undefined;
  receipt_footer?: string | null | undefined;
  tax_enabled?: boolean | undefined;
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

function optionalLine(label: string, value: string | null | undefined, dir = "rtl") {
  return value
    ? `<div class="business-line" dir="${dir}"><b>${escapeHtml(label)}:</b> ${escapeHtml(value)}</div>`
    : "";
}

export function buildReceiptHtml(
  receipt: ReceiptData,
  business: ReceiptBusiness,
  currency: string,
  paper: "58" | "80" = "80",
  barcodeImage?: string,
) {
  const safeLogo =
    business.logo_url && /^https?:\/\//i.test(business.logo_url)
      ? escapeHtml(business.logo_url)
      : null;
  const rows = receipt.items
    .map(
      (item, index) => `<tr>
        <td><span class="item-index">${index + 1}</span>${escapeHtml(item.name)}${item.sku ? `<small>${escapeHtml(item.sku)}</small>` : ""}</td>
        <td>${num(item.quantity, 0)}</td>
        <td>${money(item.unit_price, currency)}</td>
        <td>${money(item.line_total, currency)}</td>
      </tr>`,
    )
    .join("");
  const payments = receipt.payments
    .map(
      (payment) =>
        `<div class="pair"><span>${escapeHtml(PAYMENT_LABELS[payment.method] ?? payment.method)}</span><strong>${money(payment.amount, currency)}</strong></div>`,
    )
    .join("");
  const showTax = business.tax_enabled === true;
  return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
  <title>${escapeHtml(receipt.invoice_no)}</title><style>
  @page{size:${paper}mm auto;margin:0}*{box-sizing:border-box}body{font-family:Arial,Tahoma,sans-serif;width:${paper}mm;margin:0 auto;padding:${paper === "58" ? "3mm 2.5mm" : "5mm 4mm"};font-size:${paper === "58" ? "9px" : "11px"};line-height:1.45;color:#000;background:#fff;font-variant-numeric:tabular-nums}.brand{text-align:center;padding-bottom:7px}.logo{display:block;max-width:${paper === "58" ? "27mm" : "34mm"};max-height:17mm;object-fit:contain;margin:0 auto 4px}.brand h1{font-size:${paper === "58" ? "17px" : "21px"};line-height:1.2;margin:3px 0 1px;font-weight:900}.business-type{font-weight:700;margin-bottom:3px}.receipt-type{font-size:${paper === "58" ? "10px" : "12px"};font-weight:800;margin-bottom:3px}.business-line{font-size:${paper === "58" ? "8px" : "10px"};margin:1px 0}.rule{border:0;border-top:1px dashed #000;margin:6px 0}.meta{margin:0;padding:1px 0}.pair{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin:2px 0}.pair span:first-child{min-width:0}.meta-grid{display:grid;grid-template-columns:1fr 1fr;gap:2px 10px}.meta-grid .pair{margin:0}.divider{border-top:1px dashed #000;margin:6px 0}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{text-align:start;padding:4px 2px;vertical-align:top}th{border-block:1px solid #000;font-size:${paper === "58" ? "8px" : "10px"};font-weight:900}th:first-child,td:first-child{width:45%;word-break:break-word}th:not(:first-child),td:not(:first-child){text-align:center}tbody tr:last-child{border-bottom:1px dashed #000}.item-index{display:inline-block;min-width:12px;font-weight:700}small{display:block;color:#444;font-size:8px;margin-inline-start:12px}.totals{margin-top:5px;padding:3px 0}.total{font-size:${paper === "58" ? "14px" : "18px"};font-weight:900;padding:5px 2px;border-block:2px solid #000;margin:5px 0}.payments{padding-top:1px}.footer{text-align:center;margin-top:8px;padding-top:7px;border-top:1px dashed #000;white-space:pre-line}.thanks{font-size:${paper === "58" ? "10px" : "12px"};font-weight:900}.notice{font-size:8px;margin-top:3px}.offline{border:1px solid #000;padding:3px;margin-top:5px;text-align:center;font-weight:700}.barcode{display:block;width:${paper === "58" ? "43mm" : "55mm"};height:${paper === "58" ? "13mm" : "16mm"};object-fit:fill;margin:7px auto 1px}.barcode-number{text-align:center;font:9px Arial,sans-serif;direction:ltr}
  </style></head><body>
  <header class="brand">${safeLogo ? `<img class="logo" src="${safeLogo}" alt="">` : ""}<h1>${escapeHtml(business.name)}</h1>
  ${business.business_type ? `<div class="business-type">${escapeHtml(business.business_type)}</div>` : ""}${business.receipt_header ? `<div class="receipt-type">${escapeHtml(business.receipt_header)}</div>` : '<div class="receipt-type">فاتورة مبيعات</div>'}
  ${optionalLine("العنوان", business.address)}${optionalLine("الهاتف", business.phone, "ltr")}${optionalLine("السجل التجاري", business.commercial_register, "ltr")}${optionalLine("الرقم الضريبي", business.tax_number, "ltr")}</header>
  <hr class="rule"><section class="meta"><div class="pair"><span>رقم الفاتورة</span><strong dir="ltr">${escapeHtml(receipt.invoice_no)}</strong></div><div class="meta-grid"><div class="pair"><span>التاريخ</span><strong>${dateTime(receipt.created_at)}</strong></div><div class="pair"><span>الكاشير</span><strong>${escapeHtml(receipt.cashier)}</strong></div></div>${receipt.customer ? `<div class="pair"><span>العميل</span><strong>${escapeHtml(receipt.customer)}</strong></div>` : ""}</section><hr class="rule">
  <table><thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead><tbody>${rows}</tbody></table>
  <section class="totals"><div class="pair"><span>الإجمالي الفرعي</span><strong>${money(receipt.subtotal, currency)}</strong></div>${receipt.discount > 0 ? `<div class="pair"><span>خصم</span><strong>− ${money(receipt.discount, currency)}</strong></div>` : ""}${showTax ? `<div class="pair"><span>ضريبة القيمة المضافة</span><strong>${money(receipt.tax, currency)}</strong></div>` : ""}${receipt.profit !== undefined ? `<div class="pair"><span>الربح (نسخة إدارية)</span><strong>${money(receipt.profit, currency)}</strong></div>` : ""}<div class="pair total"><span>الإجمالي الكلي</span><strong>${money(receipt.total, currency)}</strong></div></section>
  <section class="payments"><div class="pair"><span>طريقة الدفع</span><strong>${escapeHtml(PAYMENT_LABELS[receipt.payment_method] ?? receipt.payment_method)}</strong></div><div class="pair"><span>المبلغ المدفوع</span><strong>${money(receipt.paid, currency)}</strong></div><div class="pair"><span>الباقي</span><strong>${money(receipt.change_due, currency)}</strong></div>${receipt.credit ? `<div class="pair"><span>المتبقي آجلًا</span><strong>${money(receipt.credit, currency)}</strong></div>` : ""}${receipt.payments.length > 1 ? `<div class="divider"></div>${payments}` : ""}</section>
  ${receipt.offline ? '<div class="offline">نسخة محفوظة محليًا — بانتظار المزامنة</div>' : ""}
  <footer class="footer"><div class="thanks">${escapeHtml(business.receipt_footer || `شكرًا لتسوقكم من ${business.name}`)}</div><div class="notice">نسعد بخدمتكم دائمًا — يرجى الاحتفاظ بالفاتورة للاستبدال أو الاسترجاع</div>${barcodeImage ? `<img class="barcode" src="${barcodeImage}" alt=""><div class="barcode-number">${escapeHtml(receipt.invoice_no)}</div>` : ""}</footer>
  <script>window.onload=function(){window.print();}</script></body></html>`;
}

function makeReceiptBarcode(value: string) {
  const canvas = document.createElement("canvas");
  JsBarcode(canvas, value, {
    format: "CODE128",
    width: 2,
    height: 52,
    margin: 0,
    displayValue: false,
  });
  return canvas.toDataURL("image/png");
}

/**
 * Local receipt printing — works with no internet. The desktop app prints silently
 * to the configured printer; browsers/Android fall back to the print window.
 */
export function printReceipt(
  receipt: ReceiptData,
  business: ReceiptBusiness,
  currency: string,
  paper: "58" | "80" = "80",
) {
  const html = buildReceiptHtml(
    receipt,
    business,
    currency,
    paper,
    makeReceiptBarcode(receipt.invoice_no),
  );
  if (nativeBridge()) {
    printSilently(html).catch((e: unknown) =>
      toast.error(`فشلت طباعة الفاتورة ${receipt.invoice_no}`, {
        description: e instanceof Error ? e.message : "تأكد من تشغيل الطابعة وتوصيلها",
        duration: 15000,
        action: {
          label: "إعادة الطباعة",
          onClick: () => printReceipt(receipt, business, currency, paper),
        },
      }),
    );
    return true;
  }
  const w = window.open("", "_blank", "width=380,height=600");
  if (!w) {
    toast.error("تعذر فتح نافذة الطباعة", {
      description: "اسمح بالنوافذ المنبثقة لهذا الموقع ثم أعد الطباعة",
      duration: 15000,
      action: {
        label: "إعادة الطباعة",
        onClick: () => printReceipt(receipt, business, currency, paper),
      },
    });
    return false;
  }
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
              {business.logo_url && (
                <img
                  src={business.logo_url}
                  alt={`شعار ${business.name}`}
                  className="mx-auto mb-2 h-14 max-w-32 object-contain"
                />
              )}
              <div className="text-lg font-black text-primary">{business.name}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {business.receipt_header || "فاتورة مبيعات"}
              </div>
              <div className="mt-2 text-xl font-black" dir="ltr">
                {receipt.invoice_no}
              </div>
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
            <div className="grid gap-1 rounded-lg border px-3 py-2 text-xs text-muted-foreground sm:grid-cols-2">
              <span>
                الكاشير: <b className="text-foreground">{receipt.cashier}</b>
              </span>
              <span>
                العميل: <b className="text-foreground">{receipt.customer || "عميل نقدي"}</b>
              </span>
              {business.phone && <span dir="ltr">{business.phone}</span>}
              {business.commercial_register && <span>س.ت: {business.commercial_register}</span>}
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
              {business.tax_enabled && (
                <ReceiptRow label="الضريبة" value={money(receipt.tax, currency)} />
              )}
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
            <Button
              size="sm"
              variant={paper === "58" ? "default" : "ghost"}
              onClick={() => setPaper("58")}
            >
              58 مم
            </Button>
            <Button
              size="sm"
              variant={paper === "80" ? "default" : "ghost"}
              onClick={() => setPaper("80")}
            >
              80 مم
            </Button>
          </div>
          <Button variant="outline" onClick={onClose}>
            فاتورة جديدة
          </Button>
          <Button
            onClick={() => {
              if (receipt && !printReceipt(receipt, business, currency, paper))
                window.alert("اسمح بالنوافذ المنبثقة لطباعة الإيصال.");
            }}
          >
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
