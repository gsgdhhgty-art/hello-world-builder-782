import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChefHat, Clock, Minus, Plus, Receipt, Search, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { db, hasLocalDb } from "@/lib/offline/db";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  addTicketItem,
  canBill,
  nextTicketStatus,
  ORDER_TYPE_LABELS,
  TABLE_STATUS_LABELS,
  TICKET_STATUS_LABELS,
  ticketTotal,
  ticketUrgency,
  type OrderType,
  type TableStatus,
  type TicketItem,
  type TicketStatus,
} from "@/lib/kitchen";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface DiningTable {
  id: string;
  name: string;
  zone: string;
  seats: number;
  status: TableStatus;
}
interface Ticket {
  id: string;
  ticket_no: number;
  table_id: string | null;
  order_type: OrderType;
  status: TicketStatus;
  items: TicketItem[];
  note: string | null;
  customer_name: string | null;
  created_at: string;
}

const TABLE_TONE: Record<TableStatus, string> = {
  FREE: "border-success/40 bg-success/10 text-success",
  OCCUPIED: "border-industry/50 bg-industry/10 text-industry",
  BILL: "border-warning/60 bg-warning/15 text-warning-foreground",
  RESERVED: "border-info/40 bg-info/10 text-info",
};
const URGENCY: Record<string, string> = {
  ok: "border-border",
  warn: "border-warning ring-1 ring-warning/40",
  late: "border-destructive ring-2 ring-destructive/40",
};

export function TablesBoard() {
  const { org, profile, can } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const currency = org?.currency ?? "EGP";
  const [orderFor, setOrderFor] = useState<{ type: OrderType; table?: DiningTable } | null>(null);
  const [newTable, setNewTable] = useState({ name: "", zone: "الصالة", seats: 4 });
  const [, setTick] = useState(0);

  const tables = useQuery({
    queryKey: ["dining-tables", org?.id],
    enabled: Boolean(org?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dining_tables")
        .select("id, name, zone, seats, status")
        .order("sort_order")
        .order("name");
      if (error) throw error;
      return (data ?? []) as DiningTable[];
    },
  });
  const tickets = useQuery({
    queryKey: ["kitchen-tickets", org?.id],
    enabled: Boolean(org?.id),
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kitchen_tickets")
        .select("id, ticket_no, table_id, order_type, status, items, note, customer_name, created_at")
        .in("status", ["NEW", "PREPARING", "READY", "SERVED"])
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as Ticket[];
    },
  });

  useEffect(() => {
    if (!org?.id) return;
    const ch = supabase
      .channel(`kitchen-${org.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "kitchen_tickets", filter: `org_id=eq.${org.id}` }, () => {
        void qc.invalidateQueries({ queryKey: ["kitchen-tickets", org.id] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "dining_tables", filter: `org_id=eq.${org.id}` }, () => {
        void qc.invalidateQueries({ queryKey: ["dining-tables", org.id] });
      })
      .subscribe();
    const t = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => {
      void supabase.removeChannel(ch);
      clearInterval(t);
    };
  }, [org?.id, qc]);

  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["kitchen-tickets", org?.id] }),
      qc.invalidateQueries({ queryKey: ["dining-tables", org?.id] }),
    ]);

  async function setTableStatus(id: string, status: TableStatus) {
    const { error } = await supabase.from("dining_tables").update({ status }).eq("id", id);
    if (error) { toast.error("تعذر تحديث الطاولة"); return; }
    await refresh();
  }

  async function addTable() {
    if (!org?.id || !newTable.name.trim()) return;
    const { error } = await supabase.from("dining_tables").insert({
      org_id: org.id,
      branch_id: profile?.branch_id ?? null,
      name: newTable.name.trim(),
      zone: newTable.zone.trim() || "الصالة",
      seats: newTable.seats,
      sort_order: (tables.data?.length ?? 0) + 1,
    });
    if (error) { toast.error(error.message.includes("unique") ? "اسم الطاولة مستخدم" : "تعذر إضافة الطاولة"); return; }
    setNewTable({ name: "", zone: newTable.zone, seats: 4 });
    toast.success("أضيفت الطاولة");
    await refresh();
  }

  async function removeTable(id: string) {
    const { error } = await supabase.from("dining_tables").delete().eq("id", id);
    if (error) { toast.error("تعذر حذف الطاولة"); return; }
    await refresh();
  }

  async function advance(t: Ticket) {
    const next = nextTicketStatus(t.status);
    if (!next) return;
    const { error } = await supabase.from("kitchen_tickets").update({ status: next }).eq("id", t.id);
    if (error) { toast.error("تعذر تحديث الطلب"); return; }
    await refresh();
  }

  async function cancel(t: Ticket) {
    const { error } = await supabase.from("kitchen_tickets").update({ status: "CANCELLED" }).eq("id", t.id);
    if (error) { toast.error("تعذر إلغاء الطلب"); return; }
    if (t.table_id && !(tickets.data ?? []).some((x) => x.id !== t.id && x.table_id === t.table_id)) {
      await supabase.from("dining_tables").update({ status: "FREE" }).eq("id", t.table_id);
    }
    await refresh();
  }

  /** Hand the ticket to the cashier: create a held order on this device and open it in the POS. */
  async function bill(t: Ticket) {
    if (!hasLocalDb()) { toast.error("هذا الجهاز لا يدعم التخزين المحلي"); return; }
    const heldId = crypto.randomUUID();
    const table = tables.data?.find((x) => x.id === t.table_id);
    await db().held_orders.put({
      id: heldId,
      label: `طلب #${t.ticket_no} — ${table ? `طاولة ${table.name}` : ORDER_TYPE_LABELS[t.order_type]} — ${money(ticketTotal(t.items), currency)}`,
      created_at: new Date().toISOString(),
      lines: t.items.map((i) => ({ product_id: i.product_id, quantity: i.qty, discount: 0 })),
    });
    const { error } = await supabase.from("kitchen_tickets").update({ status: "BILLED" }).eq("id", t.id);
    if (error) {
      await db().held_orders.delete(heldId);
      toast.error("تعذر إرسال الطلب للتحصيل");
      return;
    }
    if (t.table_id && !(tickets.data ?? []).some((x) => x.id !== t.id && x.table_id === t.table_id)) {
      await supabase.from("dining_tables").update({ status: "FREE" }).eq("id", t.table_id);
    }
    await qc.invalidateQueries({ queryKey: ["held-orders"] });
    navigate({ to: "/pos", search: { resume: heldId } });
  }

  const list = tickets.data ?? [];
  const byTable = useMemo(() => {
    const m = new Map<string, Ticket[]>();
    for (const t of list) if (t.table_id) m.set(t.table_id, [...(m.get(t.table_id) ?? []), t]);
    return m;
  }, [list]);
  const zones = useMemo(() => {
    const m = new Map<string, DiningTable[]>();
    for (const t of tables.data ?? []) m.set(t.zone, [...(m.get(t.zone) ?? []), t]);
    return [...m.entries()];
  }, [tables.data]);
  const columns: TicketStatus[] = ["NEW", "PREPARING", "READY", "SERVED"];
  const canManage = can("*") || profile?.role === "OWNER" || profile?.role === "ADMIN";
  const tableName = (id: string | null) => tables.data?.find((x) => x.id === id)?.name;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="طاولات مشغولة" value={`${(tables.data ?? []).filter((t) => t.status !== "FREE").length} / ${(tables.data ?? []).length}`} />
        <Stat label="طلبات في المطبخ" value={String(list.filter((t) => t.status === "NEW" || t.status === "PREPARING").length)} />
        <Stat label="جاهز للتقديم" value={String(list.filter((t) => t.status === "READY").length)} />
        <Stat label="قيمة الطلبات المفتوحة" value={money(list.reduce((s, t) => s + ticketTotal(t.items), 0), currency)} />
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="size-5 text-industry" /> خريطة الطاولات
          </CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setOrderFor({ type: "TAKEAWAY" })}>
              طلب تيك أواي
            </Button>
            <Button variant="outline" size="sm" onClick={() => setOrderFor({ type: "DELIVERY" })}>
              طلب توصيل
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {zones.length === 0 && (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              لا توجد طاولات بعد. {canManage ? "أضف طاولات الصالة من الأسفل." : "اطلب من المدير إضافة الطاولات."}
            </p>
          )}
          {zones.map(([zone, items]) => (
            <div key={zone}>
              <p className="mb-2 text-sm font-bold text-muted-foreground">{zone}</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                {items.map((t) => {
                  const open = byTable.get(t.id) ?? [];
                  const total = open.reduce((s, x) => s + ticketTotal(x.items), 0);
                  return (
                    <div key={t.id} className={cn("rounded-2xl border-2 p-3 transition-shadow hover:shadow-md", TABLE_TONE[t.status])}>
                      <div className="flex items-start justify-between">
                        <span className="text-xl font-black">{t.name}</span>
                        <span className="text-xs font-semibold">{t.seats} مقاعد</span>
                      </div>
                      <p className="mt-1 text-xs font-bold">{TABLE_STATUS_LABELS[t.status]}</p>
                      <p className="mt-1 h-4 text-xs text-foreground/80">{open.length ? `${open.length} طلب — ${money(total, currency)}` : ""}</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        <Button size="sm" className="h-7 flex-1 bg-industry text-industry-foreground hover:bg-industry/90" onClick={() => setOrderFor({ type: "DINE_IN", table: t })}>
                          طلب
                        </Button>
                        {t.status === "OCCUPIED" && (
                          <Button size="sm" variant="outline" className="h-7" onClick={() => void setTableStatus(t.id, "BILL")}>
                            الحساب
                          </Button>
                        )}
                        {t.status === "FREE" && (
                          <Button size="sm" variant="outline" className="h-7" onClick={() => void setTableStatus(t.id, "RESERVED")}>
                            حجز
                          </Button>
                        )}
                        {(t.status === "RESERVED" || (t.status !== "FREE" && open.length === 0)) && (
                          <Button size="sm" variant="ghost" className="h-7" onClick={() => void setTableStatus(t.id, "FREE")}>
                            تفريغ
                          </Button>
                        )}
                        {canManage && t.status === "FREE" && open.length === 0 && (
                          <Button size="icon" variant="ghost" className="size-7" aria-label={`حذف طاولة ${t.name}`} onClick={() => void removeTable(t.id)}>
                            <Trash2 className="size-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {canManage && (
            <div className="flex flex-wrap items-end gap-2 border-t pt-4">
              <Input className="w-28" placeholder="رقم/اسم" value={newTable.name} onChange={(e) => setNewTable({ ...newTable, name: e.target.value })} />
              <Input className="w-32" placeholder="المنطقة" value={newTable.zone} onChange={(e) => setNewTable({ ...newTable, zone: e.target.value })} />
              <Input className="w-20" type="number" min={1} max={40} value={newTable.seats} onChange={(e) => setNewTable({ ...newTable, seats: Math.max(1, Math.min(40, Number(e.target.value) || 1)) })} />
              <Button size="sm" onClick={() => void addTable()}>
                <Plus className="size-4" /> إضافة طاولة
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ChefHat className="size-5 text-industry" /> شاشة المطبخ / البار
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 lg:grid-cols-4">
            {columns.map((col) => (
              <div key={col} className="rounded-xl bg-muted/60 p-3">
                <div className="mb-3 flex items-center justify-between text-sm font-black">
                  {TICKET_STATUS_LABELS[col]}
                  <Badge variant="secondary">{list.filter((t) => t.status === col).length}</Badge>
                </div>
                <div className="space-y-3">
                  {list
                    .filter((t) => t.status === col)
                    .map((t) => {
                      const mins = Math.max(0, Math.floor((Date.now() - new Date(t.created_at).getTime()) / 60000));
                      return (
                        <div key={t.id} className={cn("rounded-xl border-2 bg-card p-3 shadow-sm", col === "SERVED" ? "border-border" : URGENCY[ticketUrgency(t.created_at)])}>
                          <div className="flex items-center justify-between">
                            <span className="text-lg font-black">#{t.ticket_no}</span>
                            <span className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                              <Clock className="size-3" /> {mins} د
                            </span>
                          </div>
                          <p className="text-xs font-bold text-industry">
                            {t.table_id ? `طاولة ${tableName(t.table_id) ?? ""}` : ORDER_TYPE_LABELS[t.order_type]}
                            {t.customer_name ? ` — ${t.customer_name}` : ""}
                          </p>
                          <ul className="mt-2 space-y-0.5 text-sm">
                            {t.items.map((i, n) => (
                              <li key={n} className="flex justify-between gap-2">
                                <span className="font-semibold">{i.qty}× {i.name}</span>
                              </li>
                            ))}
                          </ul>
                          {t.note && <p className="mt-1 rounded bg-warning/15 px-2 py-1 text-xs">{t.note}</p>}
                          <div className="mt-3 flex flex-wrap gap-1">
                            {nextTicketStatus(t.status) && (
                              <Button size="sm" className="h-7 flex-1" onClick={() => void advance(t)}>
                                {TICKET_STATUS_LABELS[nextTicketStatus(t.status)!]}
                              </Button>
                            )}
                            {canBill(t.status) && can("sales.create") && (
                              <Button size="sm" variant="outline" className="h-7" onClick={() => void bill(t)}>
                                <Receipt className="size-3.5" /> تحصيل
                              </Button>
                            )}
                            {(t.status === "NEW" || t.status === "PREPARING") && (
                              <Button size="sm" variant="ghost" className="h-7 text-destructive" onClick={() => void cancel(t)}>
                                إلغاء
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {orderFor && (
        <OrderDialog
          target={orderFor}
          currency={currency}
          onClose={() => setOrderFor(null)}
          onSent={async () => {
            setOrderFor(null);
            await refresh();
          }}
        />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
    </div>
  );
}

function OrderDialog({
  target,
  currency,
  onClose,
  onSent,
}: {
  target: { type: OrderType; table?: DiningTable };
  currency: string;
  onClose: () => void;
  onSent: () => Promise<void>;
}) {
  const { org, profile } = useAuth();
  const [items, setItems] = useState<TicketItem[]>([]);
  const [search, setSearch] = useState("");
  const [note, setNote] = useState("");
  const [customer, setCustomer] = useState("");
  const [busy, setBusy] = useState(false);

  const products = useQuery({
    queryKey: ["menu-products", org?.id],
    enabled: Boolean(org?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, price, image_url")
        .eq("is_active", true)
        .order("name")
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });
  const filtered = (products.data ?? []).filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 60);

  async function send() {
    if (!org?.id || items.length === 0) return;
    setBusy(true);
    const { error } = await supabase.from("kitchen_tickets").insert({
      org_id: org.id,
      branch_id: profile?.branch_id ?? null,
      table_id: target.table?.id ?? null,
      order_type: target.type,
      items: items as never,
      note: note.trim() || null,
      customer_name: customer.trim() || null,
    });
    if (!error && target.table) {
      await supabase.from("dining_tables").update({ status: "OCCUPIED" }).eq("id", target.table.id);
    }
    setBusy(false);
    if (error) { toast.error("تعذر إرسال الطلب للمطبخ"); return; }
    toast.success("أُرسل الطلب للمطبخ");
    await onSent();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {target.table ? `طلب طاولة ${target.table.name}` : `طلب ${ORDER_TYPE_LABELS[target.type]}`}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-[1fr_280px]">
          <div>
            <div className="relative mb-3">
              <Search className="absolute right-3 top-2.5 size-4 text-muted-foreground" />
              <Input className="pr-9" placeholder="ابحث في المنيو" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="grid max-h-80 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
              {filtered.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="rounded-lg border bg-card p-2 text-start transition-colors hover:border-industry"
                  onClick={() => setItems((cur) => addTicketItem(cur, { product_id: p.id, name: p.name, price: Number(p.price) }))}
                >
                  <p className="line-clamp-2 text-sm font-bold">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{money(Number(p.price), currency)}</p>
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col rounded-xl border p-3">
            <div className="flex-1 space-y-2 overflow-y-auto">
              {items.length === 0 && <p className="text-center text-sm text-muted-foreground">اختر أصناف الطلب</p>}
              {items.map((i, n) => (
                <div key={n} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex-1 font-semibold">{i.name}</span>
                  <Button size="icon" variant="outline" className="size-6" aria-label="إنقاص" onClick={() => setItems((cur) => cur.flatMap((x, k) => (k === n ? (x.qty > 1 ? [{ ...x, qty: x.qty - 1 }] : []) : [x])))}>
                    <Minus className="size-3" />
                  </Button>
                  <span className="w-5 text-center font-bold">{i.qty}</span>
                  <Button size="icon" variant="outline" className="size-6" aria-label="زيادة" onClick={() => setItems((cur) => cur.map((x, k) => (k === n ? { ...x, qty: x.qty + 1 } : x)))}>
                    <Plus className="size-3" />
                  </Button>
                </div>
              ))}
            </div>
            {target.type !== "DINE_IN" && (
              <Input className="mt-2" placeholder="اسم العميل / العنوان" value={customer} onChange={(e) => setCustomer(e.target.value)} maxLength={80} />
            )}
            <Input className="mt-2" placeholder="ملاحظة للمطبخ (بدون سكر، حار...)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
            <div className="mt-3 flex items-center justify-between text-lg font-black">
              <span>الإجمالي</span>
              <span>{money(ticketTotal(items), currency)}</span>
            </div>
            <Button className="mt-3 bg-industry text-industry-foreground hover:bg-industry/90" disabled={busy || items.length === 0} onClick={() => void send()}>
              <ChefHat className="size-4" /> إرسال للمطبخ
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
