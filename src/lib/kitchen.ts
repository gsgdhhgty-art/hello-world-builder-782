/** Pure helpers for table service & the kitchen display (restaurants and cafés). */

export type TicketStatus = "NEW" | "PREPARING" | "READY" | "SERVED" | "BILLED" | "CANCELLED";
export type OrderType = "DINE_IN" | "TAKEAWAY" | "DELIVERY";
export type TableStatus = "FREE" | "OCCUPIED" | "BILL" | "RESERVED";

export interface TicketItem {
  product_id: string;
  name: string;
  price: number;
  qty: number;
  note?: string;
}

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  NEW: "جديد",
  PREPARING: "قيد التحضير",
  READY: "جاهز للتقديم",
  SERVED: "تم التقديم",
  BILLED: "أُرسل للتحصيل",
  CANCELLED: "ملغي",
};

export const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  DINE_IN: "صالة",
  TAKEAWAY: "تيك أواي",
  DELIVERY: "توصيل",
};

export const TABLE_STATUS_LABELS: Record<TableStatus, string> = {
  FREE: "متاحة",
  OCCUPIED: "مشغولة",
  BILL: "طلب الحساب",
  RESERVED: "محجوزة",
};

/** Kitchen flow moves strictly forward: NEW → PREPARING → READY → SERVED. */
export function nextTicketStatus(status: TicketStatus): TicketStatus | null {
  switch (status) {
    case "NEW":
      return "PREPARING";
    case "PREPARING":
      return "READY";
    case "READY":
      return "SERVED";
    default:
      return null;
  }
}

/** A ticket can be sent to the cashier once the kitchen accepted it and it is not closed. */
export function canBill(status: TicketStatus): boolean {
  return status === "PREPARING" || status === "READY" || status === "SERVED";
}

export function ticketTotal(items: TicketItem[]): number {
  return Math.round(items.reduce((s, i) => s + i.price * i.qty, 0) * 100) / 100;
}

/** Add a product to a draft ticket, merging identical lines without a note. */
export function addTicketItem(items: TicketItem[], item: Omit<TicketItem, "qty">): TicketItem[] {
  const idx = items.findIndex((i) => i.product_id === item.product_id && !i.note);
  if (idx >= 0) {
    return items.map((i, n) => (n === idx ? { ...i, qty: i.qty + 1 } : i));
  }
  return [...items, { ...item, qty: 1 }];
}

/** Kitchen urgency based on minutes waited: ok < 10, warn < 20, late ≥ 20. */
export function ticketUrgency(createdAt: string, now: number = Date.now()): "ok" | "warn" | "late" {
  const mins = (now - new Date(createdAt).getTime()) / 60000;
  if (mins >= 20) return "late";
  if (mins >= 10) return "warn";
  return "ok";
}

/** Expiry buckets used by pharmacy / grocery boards. */
export function expiryBucket(
  expiresAt: string | null,
  today: Date = new Date(),
): "expired" | "d30" | "d90" | "ok" | "none" {
  if (!expiresAt) return "none";
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const days = Math.floor((new Date(expiresAt + "T00:00:00").getTime() - start) / 86400000);
  if (days < 0) return "expired";
  if (days <= 30) return "d30";
  if (days <= 90) return "d90";
  return "ok";
}
