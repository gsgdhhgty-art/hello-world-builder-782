import { describe, expect, it } from "vitest";
import { buildReceiptHtml, type ReceiptData } from "./ReceiptDialog";

const receipt: ReceiptData = {
  invoice_no: "INV-100",
  total: 115,
  subtotal: 100,
  discount: 0,
  tax: 15,
  paid: 120,
  change_due: 5,
  payment_method: "CASH",
  offline: false,
  cashier: "أحمد",
  created_at: "2026-09-25T20:00:00.000Z",
  payments: [{ method: "CASH", amount: 120 }],
  items: [{ name: "منتج تجريبي", sku: "SKU-1", quantity: 2, unit_price: 50, line_total: 100 }],
};

describe("buildReceiptHtml", () => {
  it("includes professional business identity and receipt details", () => {
    const html = buildReceiptHtml(
      receipt,
      {
        name: "متجر الاختبار",
        logo_url: "https://example.com/logo.png",
        commercial_register: "123456",
        tax_number: "987654",
        receipt_header: "فاتورة بيع معتمدة",
        receipt_footer: "نتمنى رؤيتكم قريبًا",
      },
      "EGP",
      "80",
    );
    expect(html).toContain("متجر الاختبار");
    expect(html).toContain("https://example.com/logo.png");
    expect(html).toContain("123456");
    expect(html).toContain("INV-100");
    expect(html).toContain("منتج تجريبي");
    expect(html).toContain("نتمنى رؤيتكم قريبًا");
    expect(html).toContain("size:80mm auto");
  });

  it("escapes untrusted receipt text and supports 58mm paper", () => {
    const html = buildReceiptHtml(
      { ...receipt, cashier: '<script>alert("x")</script>' },
      { name: "متجر <آمن>" },
      "EGP",
      "58",
    );
    expect(html).not.toContain('<script>alert("x")</script>');
    expect(html).toContain("متجر &lt;آمن&gt;");
    expect(html).toContain("size:58mm auto");
  });
});