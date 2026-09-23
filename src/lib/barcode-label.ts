import JsBarcode from "jsbarcode";

export function printProductLabel(product: {
  name: string;
  barcode: string | null;
  price: number;
  currency: string;
}) {
  if (!product.barcode) throw new Error("لا يوجد باركود لهذا المنتج");

  const canvas = document.createElement("canvas");
  JsBarcode(canvas, product.barcode, {
    format: "EAN13",
    width: 2,
    height: 64,
    margin: 8,
    displayValue: true,
    fontSize: 14,
  });
  const barcodeImage = canvas.toDataURL("image/png");
  const popup = window.open("", "_blank", "width=520,height=560");
  if (!popup) throw new Error("اسمح بالنوافذ المنبثقة لطباعة الملصق");

  const safeName = product.name.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return entities[char] ?? char;
  });

  popup.document.write(`<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>ملصق ${safeName}</title><style>@page{size:50mm 30mm;margin:0}*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif}.label{width:50mm;height:30mm;padding:2mm;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden}.name{max-width:100%;font-size:9pt;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.barcode{width:44mm;height:15mm;object-fit:fill}.price{font-size:10pt;font-weight:800;direction:ltr}</style></head><body><div class="label"><div class="name">${safeName}</div><img class="barcode" src="${barcodeImage}" alt=""><div class="price">${Number(product.price).toFixed(2)} ${product.currency}</div></div><script>window.onload=()=>{window.print();window.onafterprint=()=>window.close()}</script></body></html>`);
  popup.document.close();
}