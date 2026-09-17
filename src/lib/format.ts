export function money(value: number | string | null | undefined, currency = "SAR") {
  const n = Number(value ?? 0);
  return `${n.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

export function num(value: number | string | null | undefined, digits = 0) {
  const n = Number(value ?? 0);
  return n.toLocaleString("ar-EG", { minimumFractionDigits: digits, maximumFractionDigits: 3 });
}

export function dateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("ar-EG", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const ROLE_LABELS: Record<string, string> = {
  OWNER: "المالك",
  ADMIN: "مسؤول",
  MANAGER: "مدير",
  CASHIER: "أمين صندوق",
  INVENTORY_MANAGER: "مسؤول مخزون",
  ACCOUNTANT: "محاسب",
};

export const PAYMENT_LABELS: Record<string, string> = {
  CASH: "نقدًا",
  CARD: "شبكة / بطاقة",
  TRANSFER: "تحويل",
  WALLET: "محفظة",
  CREDIT: "آجل",
  MIXED: "دفع مختلط",
};

export const PERMISSION_LIST: { key: string; label: string }[] = [
  { key: "sales.create", label: "إنشاء بيع" },
  { key: "sales.view_own", label: "عرض مبيعاته" },
  { key: "sales.view_all", label: "عرض كل المبيعات" },
  { key: "sales.refund", label: "المرتجعات" },
  { key: "sales.discount", label: "منح خصم" },
  { key: "products.view", label: "عرض المنتجات" },
  { key: "products.edit", label: "تعديل المنتجات والأسعار" },
  { key: "inventory.view", label: "عرض المخزون" },
  { key: "inventory.edit", label: "تعديل المخزون" },
  { key: "purchases.manage", label: "إدارة المشتريات" },
  { key: "suppliers.manage", label: "إدارة الموردين" },
  { key: "customers.manage", label: "إدارة العملاء" },
  { key: "expenses.manage", label: "إدارة المصروفات" },
  { key: "reports.view", label: "عرض التقارير" },
  { key: "profit.view", label: "عرض الأرباح" },
  { key: "shift.open", label: "فتح وردية" },
  { key: "shift.close", label: "إغلاق وردية" },
];
