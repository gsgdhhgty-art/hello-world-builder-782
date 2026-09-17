import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Camera,
  CloudOff,
  Minus,
  PauseCircle,
  Percent,
  PlayCircle,
  Plus,
  Search,
  Star,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
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
import { Keypad } from "@/components/pos/Keypad";
import { CameraScanner } from "@/components/pos/CameraScanner";
import { PaymentDialog, type PaymentLine } from "@/components/pos/PaymentDialog";
import { ReceiptDialog, type ReceiptData } from "@/components/pos/ReceiptDialog";
import { money, num } from "@/lib/format";
import { calculateCartTotals, round2 } from "@/lib/pos-math";
import { cn } from "@/lib/utils";
import { db, hasLocalDb, type HeldOrder } from "@/lib/offline/db";
import { localFirst } from "@/lib/offline/local-first";
import { enqueue, isOnline, localStockMap, recordLocalSale } from "@/lib/offline/sync";
import { useOffline } from "@/hooks/useOffline";

export const Route = createFileRoute("/_authenticated/pos")({
  head: () => ({
    meta: [
      { title: "الكاشير — كاشير كلاود" },
      { name: "description", content: "شاشة نقاط البيع: بحث المنتجات، سلة الفاتورة والدفع." },
      { property: "og:title", content: "الكاشير — كاشير كلاود" },
      { property: "og:description", content: "شاشة نقاط البيع وإتمام الفواتير." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PosPage,
});

interface ProductRow {
  id: string;
  name: string;
  barcode: string | null;
  sku: string | null;
  price: number;
  unit: string;
  track_stock: boolean;
  category_id: string | null;
  image_url: string | null;
}

interface CartLine {
  product: ProductRow;
  quantity: number;
  discount: number;
}

const FAV_KEY = "kashir_favorites";
/** إذا لم يستجب الخادم خلال هذه المدة نُكمل الفاتورة محليًا ثم نزامنها لاحقًا. */
const SALE_TIMEOUT_MS = 7000;

/** يعتبر الخطأ انقطاعًا في الشبكة (وليس رفضًا من الخادم) فنُكمل العملية محليًا. */
function isNetworkFailure(message: string): boolean {
  return (
    /fetch|network|timeout|abort|signal|Failed to fetch|NetworkError/i.test(message) || !isOnline()
  );
}

function readFavorites(): string[] {
  if (typeof localStorage === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(FAV_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

function PosPage() {
  const { org, profile, can, session } = useAuth();
  const { online, pending } = useOffline();
  const qc = useQueryClient();
  const currency = org?.currency ?? "SAR";
  const searchRef = useRef<HTMLInputElement | null>(null);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState("none");
  const [openingCash, setOpeningCash] = useState("0");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [heldOpen, setHeldOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [newCustomer, setNewCustomer] = useState<{ open: boolean; name: string; phone: string }>({
    open: false,
    name: "",
    phone: "",
  });
  const [qtyEditor, setQtyEditor] = useState<{ id: string; value: string } | null>(null);
  const [discEditor, setDiscEditor] = useState<{
    id: string | null;
    mode: "percent" | "amount";
    value: string;
  } | null>(null);
  const [cartDiscount, setCartDiscount] = useState(0);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);

  useEffect(() => setFavorites(readFavorites()), []);

  // بعد إغلاق نوافذ الدفع/الإيصال نضمن بقاء الشاشة قابلة للنقر فورًا
  useEffect(() => {
    if (payOpen || receipt) return;
    const t = window.setTimeout(() => {
      document.body.style.pointerEvents = "";
    }, 250);
    return () => window.clearTimeout(t);
  }, [payOpen, receipt]);

  function toggleFavorite(id: string) {
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      localStorage.setItem(FAV_KEY, JSON.stringify(next));
      return next;
    });
  }

  const shiftQuery = useQuery({
    queryKey: ["open-shift", session?.user.id],
    queryFn: async () => {
      if (isOnline()) {
        const { data, error } = await supabase
          .from("shifts")
          .select("*")
          .eq("status", "OPEN")
          .maybeSingle();
        if (!error) {
          if (hasLocalDb() && data) await db().shifts.put(data);
          return data;
        }
      }
      if (!hasLocalDb()) return null;
      const rows = await db().shifts.where("status").equals("OPEN").toArray();
      return rows.find((s) => s["user_id"] === session?.user.id) ?? null;
    },
  });

  const productsQuery = useQuery({
    queryKey: ["pos-products"],
    queryFn: () =>
      localFirst<ProductRow>("products", async () => {
        const { data, error } = await supabase
          .from("products")
          .select("id, name, barcode, sku, price, unit, track_stock, category_id, image_url")
          .eq("is_active", true)
          .order("name");
        if (error) throw error;
        return (data ?? []) as ProductRow[];
      }),
  });

  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: () =>
      localFirst<{ id: string; name: string }>("categories", async () => {
        const { data, error } = await supabase.from("categories").select("id, name").order("name");
        if (error) throw error;
        return data ?? [];
      }),
  });

  const stockQuery = useQuery({
    queryKey: ["pos-stock"],
    queryFn: async () => {
      if (isOnline()) {
        const { data } = await supabase.from("inventory").select("*");
        if (data && hasLocalDb()) {
          await db().inventory.bulkPut(
            data.map((r) => ({ ...r, id: `${r.product_id}:${r.warehouse_id}` })),
          );
        }
      }
      return localStockMap();
    },
  });

  const customersQuery = useQuery({
    queryKey: ["customers-lite"],
    queryFn: () =>
      localFirst<{ id: string; name: string }>("customers", async () => {
        const { data, error } = await supabase.from("customers").select("id, name").order("name");
        if (error) throw error;
        return data ?? [];
      }),
  });

  const heldQuery = useQuery({
    queryKey: ["held-orders"],
    queryFn: async () => (hasLocalDb() ? db().held_orders.orderBy("created_at").toArray() : []),
  });

  const openShift = useMutation({
    mutationFn: async () => {
      const cash = Number(openingCash) || 0;
      const txn = crypto.randomUUID();

      // offline: open locally and queue for the server to validate later
      async function openLocally() {
        if (!hasLocalDb()) throw new Error("local database unavailable");
        const local = db();
        const reg = (await local.registers.toArray())[0];
        await local.shifts.put({
          id: txn,
          org_id: profile?.org_id ?? null,
          branch_id: reg?.["branch_id"] ?? null,
          register_id: reg?.["id"] ?? null,
          user_id: session?.user.id ?? null,
          opening_cash: cash,
          status: "OPEN",
          opened_at: new Date().toISOString(),
        });
        await enqueue(
          "shift_open",
          "CREATE",
          { opening_cash: cash, register_id: reg?.["id"] ?? null, client_txn_id: txn },
          { entity_id: txn, idempotency_key: txn },
        );
      }

      if (!isOnline()) return openLocally();
      try {
        const { error } = await supabase
          .rpc("open_shift", { _opening_cash: cash, _client_txn_id: txn })
          .abortSignal(AbortSignal.timeout(SALE_TIMEOUT_MS));
        if (error) throw error;
        return;
      } catch (e) {
        const message = e instanceof Error ? e.message : "";
        if (isNetworkFailure(message)) return openLocally();
        throw e;
      }
    },
    onSuccess: () => {
      toast.success("تم فتح الوردية");
      void qc.invalidateQueries({ queryKey: ["open-shift"] });
    },
    onError: (e: Error) =>
      toast.error(
        e.message.includes("no register")
          ? "لا يوجد جهاز كاشير مُعد — أضفه من الإعدادات"
          : e.message.includes("no permission")
            ? "لا تملك صلاحية فتح وردية"
            : "تعذر فتح الوردية",
      ),
  });

  const addCustomer = useMutation({
    mutationFn: async () => {
      const name = newCustomer.name.trim();
      if (!name) throw new Error("empty");
      const id = crypto.randomUUID();
      const row = {
        id,
        org_id: profile!.org_id!,
        name,
        phone: newCustomer.phone.trim() || null,
        balance: 0,
      };
      async function saveLocally() {
        if (hasLocalDb()) await db().customers.put(row);
        await enqueue("customer", "CREATE", row, { entity_id: id, idempotency_key: id });
      }
      if (!isOnline()) await saveLocally();
      else {
        try {
          const { error } = await supabase
            .from("customers")
            .insert(row)
            .abortSignal(AbortSignal.timeout(SALE_TIMEOUT_MS));
          if (error) throw error;
        } catch (e) {
          const message = e instanceof Error ? e.message : "";
          if (!isNetworkFailure(message)) throw e;
          await saveLocally();
        }
      }
      return id;
    },
    onSuccess: (id) => {
      setCustomerId(id);
      setNewCustomer({ open: false, name: "", phone: "" });
      toast.success("تم إضافة العميل");
      void qc.invalidateQueries({ queryKey: ["customers-lite"] });
    },
    onError: () => toast.error("تعذر إضافة العميل"),
  });

  const totals = useMemo(
    () =>
      calculateCartTotals(
        cart.map((l) => ({
          price: Number(l.product.price),
          quantity: l.quantity,
          discount: l.discount,
        })),
        Number(org?.tax_rate ?? 0),
      ),
    [cart, org?.tax_rate],
  );

  const gross = useMemo(
    () => round2(cart.reduce((s, l) => s + Number(l.product.price) * l.quantity, 0)),
    [cart],
  );
  const effCartDiscount = Math.min(cartDiscount, Math.max(gross - totals.discount, 0));
  const netAfterCartDiscount = round2(totals.subtotal - totals.discount - effCartDiscount);
  const taxTotal = round2((netAfterCartDiscount * Number(org?.tax_rate ?? 0)) / 100);
  const grandTotal = round2(netAfterCartDiscount + taxTotal);

  const checkout = useMutation({
    mutationFn: async (payments: PaymentLine[]) => {
      const dbg = (m: string) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = window as any;
        w.__DBG = [...(w.__DBG ?? []), m];
      };
      dbg("start:" + String(isOnline()));
      const clientTxnId = crypto.randomUUID();
      const localCreatedAt = new Date().toISOString();
      const payload = {
        items: cart.map((l) => ({
          product_id: l.product.id,
          quantity: l.quantity,
          discount: l.discount,
        })),
        payments: payments.map((p) => ({ method: p.method, amount: p.amount })),
        cart_discount: effCartDiscount,
        customer_id: customerId === "none" ? null : customerId,
        client_txn_id: clientTxnId,
        local_created_at: localCreatedAt,
      };
      const paidNonCredit = round2(
        payments.filter((p) => p.method !== "CREDIT").reduce((s, p) => s + p.amount, 0),
      );
      const method =
        payments.filter((p) => p.method !== "CREDIT" || payments.length === 1).length > 1
          ? "MIXED"
          : (payments[0]?.method ?? "CASH");

      const base = {
        subtotal: totals.subtotal,
        discount: round2(totals.discount + effCartDiscount),
        tax: taxTotal,
        total: grandTotal,
        payment_method: payments.length > 1 ? "MIXED" : method,
        cashier: profile?.full_name ?? "",
        customer:
          customerId === "none"
            ? null
            : ((customersQuery.data ?? []).find((c) => c.id === customerId)?.name ?? null),
        created_at: localCreatedAt,
        items: cart.map((l) => ({
          name: l.product.name,
          quantity: l.quantity,
          unit_price: Number(l.product.price),
          line_total: round2(Number(l.product.price) * l.quantity - l.discount),
        })),
      };

      async function saveOffline(): Promise<ReceiptData> {
        dbg("saveOffline");
        const paid = Math.min(paidNonCredit, grandTotal);
        const invoice = `OFF-${localCreatedAt.slice(0, 10).replace(/-/g, "")}-${clientTxnId
          .slice(0, 4)
          .toUpperCase()}`;
        await recordLocalSale({
          id: clientTxnId,
          client_txn_id: clientTxnId,
          invoice_no: invoice,
          total: grandTotal,
          subtotal: totals.subtotal,
          discount: round2(totals.discount + effCartDiscount),
          tax: taxTotal,
          paid,
          change_due: round2(Math.max(paidNonCredit - grandTotal, 0)),
          payment_method: base.payment_method,
          customer_id: customerId === "none" ? null : customerId,
          cashier_id: profile?.id ?? null,
          status: "COMPLETED",
          sync_status: "PENDING",
          local_created_at: localCreatedAt,
          created_at: localCreatedAt,
          items: cart.map((l) => ({
            product_id: l.product.id,
            product_name: l.product.name,
            quantity: l.quantity,
            unit_price: Number(l.product.price),
            discount: l.discount,
            tax: 0,
            line_total: round2(Number(l.product.price) * l.quantity - l.discount),
          })),
        });
        await enqueue("sale", "CREATE", payload, {
          entity_id: clientTxnId,
          idempotency_key: clientTxnId,
        });
        return {
          ...base,
          invoice_no: invoice,
          paid,
          change_due: round2(Math.max(paidNonCredit - grandTotal, 0)),
          credit: round2(Math.max(grandTotal - paidNonCredit, 0)),
          offline: true,
        };
      }

      if (!isOnline()) {
        dbg("offlinebranch");
        return saveOffline();
      }

      try {
        const { data, error } = await supabase
          .rpc("create_sale", { _payload: payload })
          .abortSignal(AbortSignal.timeout(SALE_TIMEOUT_MS));
        if (error) throw error;
        const res = data as {
          invoice_no: string;
          total: number;
          subtotal: number;
          discount: number;
          tax: number;
          paid: number;
          change_due: number;
          credit: number;
        };
        return {
          ...base,
          invoice_no: res.invoice_no,
          subtotal: Number(res.subtotal),
          discount: Number(res.discount),
          tax: Number(res.tax),
          total: Number(res.total),
          paid: Number(res.paid),
          change_due: Number(res.change_due),
          credit: Number(res.credit ?? 0),
          offline: false,
        } satisfies ReceiptData;
      } catch (e) {
        const message = e instanceof Error ? e.message : "";
        dbg("err:" + message.slice(0, 80));
        if (isNetworkFailure(message)) return saveOffline();
        throw e;
      }
    },
    onSuccess: (data) => {
      setPayOpen(false);
      // نفتح الإيصال بعد إغلاق نافذة الدفع لتجنّب تعطّل التفاعل عند تراكب النوافذ
      window.setTimeout(() => setReceipt(data), 180);
      setCart([]);
      setCartDiscount(0);
      setCustomerId("none");
      void qc.invalidateQueries({ queryKey: ["pos-stock"] });
      void qc.invalidateQueries({ queryKey: ["sales"] });
      searchRef.current?.focus();
    },
    onError: (e: Error) => {
      const map: Record<string, string> = {
        "no open shift": "افتح وردية قبل البيع",
        "cart is empty": "السلة فارغة",
        "credit sale requires a customer": "البيع الآجل يحتاج اختيار عميل",
        "no permission to create sales": "لا تملك صلاحية البيع",
        "no warehouse configured": "لا يوجد مستودع مرتبط بالفرع",
      };
      const key = Object.keys(map).find((k) => e.message.includes(k));
      toast.error(key ? map[key] : "تعذر إتمام الفاتورة");
    },
  });

  async function holdOrder() {
    if (!cart.length || !hasLocalDb()) return;
    const order: HeldOrder = {
      id: crypto.randomUUID(),
      label: `${cart.length} صنف — ${money(grandTotal, currency)} — ${profile?.full_name ?? ""}`,
      created_at: new Date().toISOString(),
      lines: cart.map((l) => ({
        product_id: l.product.id,
        quantity: l.quantity,
        discount: l.discount,
      })),
    };
    await db().held_orders.put(order);
    setCart([]);
    setCartDiscount(0);
    await qc.invalidateQueries({ queryKey: ["held-orders"] });
    toast.success("تم تعليق الطلب");
  }

  async function resumeOrder(order: HeldOrder) {
    const products = productsQuery.data ?? [];
    const lines: CartLine[] = [];
    for (const l of order.lines) {
      const product = products.find((p) => p.id === l.product_id);
      if (product) lines.push({ product, quantity: l.quantity, discount: l.discount });
    }
    setCart(lines);
    await db().held_orders.delete(order.id);
    await qc.invalidateQueries({ queryKey: ["held-orders"] });
    setHeldOpen(false);
  }

  const filtered = useMemo(() => {
    const list = productsQuery.data ?? [];
    const q = search.trim().toLowerCase();
    return list.filter((p) => {
      if (
        category === "fav"
          ? !favorites.includes(p.id)
          : category !== "all" && p.category_id !== category
      )
        return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.barcode ?? "").toLowerCase().includes(q) ||
        (p.sku ?? "").toLowerCase().includes(q)
      );
    });
  }, [productsQuery.data, search, category, favorites]);

  function addToCart(p: ProductRow, qty = 1) {
    setCart((prev) => {
      const idx = prev.findIndex((l) => l.product.id === p.id);
      if (idx === -1) return [...prev, { product: p, quantity: qty, discount: 0 }];
      const next = [...prev];
      const line = next[idx]!;
      next[idx] = { ...line, quantity: line.quantity + qty };
      return next;
    });
  }

  function setQty(id: string, qty: number) {
    setCart((prev) =>
      qty <= 0
        ? prev.filter((l) => l.product.id !== id)
        : prev.map((l) => (l.product.id === id ? { ...l, quantity: qty } : l)),
    );
  }

  function scanCode(code: string) {
    const value = code.trim();
    if (!value) return;
    const exact = (productsQuery.data ?? []).find((p) => p.barcode === value || p.sku === value);
    const target = exact ?? filtered[0];
    if (target) {
      addToCart(target);
      setSearch("");
    } else {
      toast.error("لا يوجد منتج بهذا الباركود");
    }
  }

  function applyDiscount() {
    if (!discEditor) return;
    const raw = Number(discEditor.value) || 0;
    if (discEditor.id) {
      const line = cart.find((l) => l.product.id === discEditor.id);
      if (!line) return;
      const lineGross = Number(line.product.price) * line.quantity;
      const value =
        discEditor.mode === "percent"
          ? round2((lineGross * raw) / 100)
          : round2(Math.min(raw, lineGross));
      setCart((prev) =>
        prev.map((l) => (l.product.id === discEditor.id ? { ...l, discount: value } : l)),
      );
    } else {
      const value = discEditor.mode === "percent" ? round2((gross * raw) / 100) : round2(raw);
      setCartDiscount(Math.min(value, gross));
    }
    setDiscEditor(null);
  }

  if (!can("sales.create")) {
    return (
      <div className="p-10 text-center text-muted-foreground">لا تملك صلاحية استخدام الكاشير.</div>
    );
  }

  if (shiftQuery.isLoading) {
    return <div className="p-10 text-center text-muted-foreground">جارٍ التحميل...</div>;
  }

  if (!shiftQuery.data) {
    return (
      <div className="grid min-h-[70vh] place-items-center p-6">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>فتح وردية</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              أدخل النقدية الافتتاحية في الدرج لبدء البيع. تعمل بدون إنترنت أيضًا.
            </p>
            <div className="space-y-2">
              <Label htmlFor="opening">النقدية الافتتاحية</Label>
              <Input
                id="opening"
                type="number"
                step="0.01"
                value={openingCash}
                onChange={(e) => setOpeningCash(e.target.value)}
              />
            </div>
            <Button
              className="w-full"
              disabled={openShift.isPending || !can("shift.open")}
              onClick={() => openShift.mutate()}
            >
              فتح الوردية
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const stock = stockQuery.data ?? {};
  const cats = categoriesQuery.data ?? [];

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col lg:h-screen lg:flex-row">
      {/* ===== catalog ===== */}
      <section className="flex min-w-0 flex-1 flex-col border-s bg-background">
        {!online && (
          <div className="flex items-center gap-2 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive">
            <CloudOff className="size-4" />
            تعمل بدون إنترنت — البيع مستمر ويُحفظ محليًا
            {pending > 0 ? ` (${pending} بانتظار الرفع)` : ""}
          </div>
        )}
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b p-3 sm:flex">
          <form
            className="relative min-w-0 flex-1"
            onSubmit={(e) => {
              e.preventDefault();
              scanCode(search);
            }}
          >
            <Search className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              autoFocus
              placeholder="ابحث بالاسم أو SKU أو امسح الباركود"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-11 pe-9 text-base"
            />
          </form>
          <Button
            variant="outline"
            size="icon"
            className="size-11 shrink-0"
            onClick={() => setScannerOpen(true)}
          >
            <Camera className="size-5" />
          </Button>
        </div>

        <div className="flex gap-2 overflow-x-auto border-b p-2">
          <Button
            size="sm"
            variant={category === "all" ? "default" : "outline"}
            className="shrink-0"
            onClick={() => setCategory("all")}
          >
            الكل
          </Button>
          <Button
            size="sm"
            variant={category === "fav" ? "default" : "outline"}
            className="shrink-0"
            onClick={() => setCategory("fav")}
          >
            <Star className="size-4" /> المفضلة
          </Button>
          {cats.map((c) => (
            <Button
              key={c.id}
              size="sm"
              variant={category === c.id ? "default" : "outline"}
              className="shrink-0"
              onClick={() => setCategory(c.id)}
            >
              {c.name}
            </Button>
          ))}
        </div>

        <div className="grid flex-1 auto-rows-min grid-cols-2 gap-2 overflow-y-auto p-3 sm:grid-cols-3 xl:grid-cols-5">
          {filtered.map((p) => {
            const qty = stock[p.id] ?? 0;
            const out = p.track_stock && qty <= 0;
            return (
              <div key={p.id} className="relative">
                <button
                  type="button"
                  onClick={() => addToCart(p)}
                  className={cn(
                    "flex h-full w-full flex-col gap-1 overflow-hidden rounded-xl border bg-card text-start transition hover:border-primary hover:shadow-md active:scale-[0.98]",
                    out && "opacity-60",
                  )}
                >
                  <div className="grid aspect-square w-full place-items-center bg-muted/50">
                    {p.image_url ? (
                      <img
                        src={p.image_url}
                        alt={p.name}
                        loading="lazy"
                        className="size-full object-cover"
                      />
                    ) : (
                      <span className="text-2xl font-black text-muted-foreground">
                        {p.name.slice(0, 1)}
                      </span>
                    )}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5 p-2">
                    <span className="line-clamp-2 text-sm font-semibold">{p.name}</span>
                    <span className="text-base font-extrabold text-primary">
                      {money(p.price, currency)}
                    </span>
                    <span className="truncate text-[11px] text-muted-foreground">
                      {p.track_stock ? `المتوفر ${num(qty)} ${p.unit}` : "بدون مخزون"}
                      {p.barcode ? ` · ${p.barcode}` : p.sku ? ` · ${p.sku}` : ""}
                    </span>
                  </div>
                </button>
                <button
                  type="button"
                  aria-label="تفضيل"
                  onClick={() => toggleFavorite(p.id)}
                  className="absolute end-2 top-2 rounded-full bg-background/90 p-1.5 shadow"
                >
                  <Star
                    className={cn(
                      "size-4",
                      favorites.includes(p.id)
                        ? "fill-amber-400 text-amber-400"
                        : "text-muted-foreground",
                    )}
                  />
                </button>
              </div>
            );
          })}
          {!filtered.length && (
            <p className="col-span-full py-10 text-center text-sm text-muted-foreground">
              لا توجد منتجات مطابقة. أضف منتجاتك من صفحة المنتجات.
            </p>
          )}
        </div>
      </section>

      {/* ===== cart ===== */}
      <aside className="flex w-full shrink-0 flex-col bg-card lg:h-screen lg:w-[400px]">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b p-3">
          <div className="min-w-0">
            <div className="truncate font-bold">فاتورة جديدة</div>
            <div className="truncate text-xs text-muted-foreground">
              الكاشير: {profile?.full_name}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => setHeldOpen(true)}>
              <PlayCircle className="size-4" />
              {(heldQuery.data ?? []).length || ""}
            </Button>
            {cart.length > 0 && (
              <>
                <Button variant="ghost" size="sm" onClick={() => void holdOrder()}>
                  <PauseCircle className="size-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setClearOpen(true)}>
                  <Trash2 className="size-4" />
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b p-3">
          <Select value={customerId} onValueChange={setCustomerId}>
            <SelectTrigger className="min-w-0">
              <SelectValue placeholder="عميل نقدي" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">عميل نقدي</SelectItem>
              {(customersQuery.data ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            className="shrink-0"
            onClick={() => setNewCustomer({ open: true, name: "", phone: "" })}
          >
            <UserPlus className="size-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {!cart.length && (
            <p className="p-8 text-center text-sm text-muted-foreground">
              اضغط على المنتج لإضافته، أو امسح الباركود.
            </p>
          )}
          {cart.map((l) => (
            <div key={l.product.id} className="flex items-center gap-2 border-b p-2">
              <div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted">
                {l.product.image_url ? (
                  <img src={l.product.image_url} alt="" className="size-full object-cover" />
                ) : (
                  <span className="text-xs font-bold">{l.product.name.slice(0, 1)}</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{l.product.name}</div>
                <div className="text-xs text-muted-foreground">
                  {money(l.product.price, currency)}
                  {l.discount > 0 ? ` − خصم ${money(l.discount, currency)}` : ""}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  size="icon"
                  variant="outline"
                  className="size-8"
                  onClick={() => setQty(l.product.id, l.quantity - 1)}
                >
                  <Minus className="size-3.5" />
                </Button>
                <button
                  type="button"
                  className="w-10 rounded-md border py-1 text-center text-sm font-bold"
                  onClick={() => setQtyEditor({ id: l.product.id, value: "" })}
                >
                  {num(l.quantity)}
                </button>
                <Button
                  size="icon"
                  variant="outline"
                  className="size-8"
                  onClick={() => setQty(l.product.id, l.quantity + 1)}
                >
                  <Plus className="size-3.5" />
                </Button>
              </div>
              <div className="w-20 shrink-0 text-end text-sm font-bold">
                {money(round2(Number(l.product.price) * l.quantity - l.discount), currency)}
              </div>
              <div className="flex shrink-0 flex-col">
                {can("sales.discount") && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    onClick={() => setDiscEditor({ id: l.product.id, mode: "percent", value: "" })}
                  >
                    <Percent className="size-3.5" />
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  onClick={() => setQty(l.product.id, 0)}
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-1 border-t p-3 text-sm">
          <Row label="الإجمالي الفرعي" value={money(totals.subtotal, currency)} />
          <Row
            label="الخصم"
            value={money(round2(totals.discount + effCartDiscount), currency)}
            action={
              can("sales.discount") && cart.length > 0 ? (
                <button
                  type="button"
                  className="text-xs font-semibold text-primary underline"
                  onClick={() => setDiscEditor({ id: null, mode: "percent", value: "" })}
                >
                  خصم على الفاتورة
                </button>
              ) : null
            }
          />
          <Row label="الضريبة" value={money(taxTotal, currency)} />
          <div className="flex items-center justify-between border-t pt-2 text-lg font-black">
            <span>الإجمالي</span>
            <span className="text-primary">{money(grandTotal, currency)}</span>
          </div>
          <Button
            className="h-14 w-full text-lg font-black"
            disabled={!cart.length || checkout.isPending}
            onClick={() => setPayOpen(true)}
          >
            الدفع · {money(grandTotal, currency)}
          </Button>
        </div>
      </aside>

      <CameraScanner open={scannerOpen} onOpenChange={setScannerOpen} onDetected={scanCode} />

      <PaymentDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        total={grandTotal}
        currency={currency}
        customers={customersQuery.data ?? []}
        customerId={customerId}
        onCustomerChange={setCustomerId}
        submitting={checkout.isPending}
        onConfirm={(payments) => checkout.mutate(payments)}
      />

      <ReceiptDialog
        receipt={receipt}
        onClose={() => setReceipt(null)}
        org={org?.name ?? "متجري"}
        currency={currency}
      />

      {/* quantity keypad */}
      <Dialog open={!!qtyEditor} onOpenChange={(o) => !o && setQtyEditor(null)}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>الكمية</DialogTitle>
          </DialogHeader>
          <div className="rounded-lg border p-3 text-end text-2xl font-black">
            {qtyEditor?.value || "0"}
          </div>
          <Keypad
            value={qtyEditor?.value ?? ""}
            onChange={(v) => setQtyEditor((prev) => (prev ? { ...prev, value: v } : prev))}
            onConfirm={() => {
              if (!qtyEditor) return;
              setQty(qtyEditor.id, Number(qtyEditor.value) || 0);
              setQtyEditor(null);
            }}
          />
        </DialogContent>
      </Dialog>

      {/* discount keypad */}
      <Dialog open={!!discEditor} onOpenChange={(o) => !o && setDiscEditor(null)}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>{discEditor?.id ? "خصم على الصنف" : "خصم على الفاتورة"}</DialogTitle>
          </DialogHeader>
          <div className="flex gap-2">
            <Button
              className="flex-1"
              variant={discEditor?.mode === "percent" ? "default" : "outline"}
              onClick={() => setDiscEditor((p) => (p ? { ...p, mode: "percent" } : p))}
            >
              نسبة %
            </Button>
            <Button
              className="flex-1"
              variant={discEditor?.mode === "amount" ? "default" : "outline"}
              onClick={() => setDiscEditor((p) => (p ? { ...p, mode: "amount" } : p))}
            >
              مبلغ ثابت
            </Button>
          </div>
          <div className="rounded-lg border p-3 text-end text-2xl font-black">
            {discEditor?.value || "0"}
          </div>
          <Keypad
            value={discEditor?.value ?? ""}
            onChange={(v) => setDiscEditor((prev) => (prev ? { ...prev, value: v } : prev))}
            onConfirm={applyDiscount}
          />
        </DialogContent>
      </Dialog>

      {/* held orders */}
      <Dialog open={heldOpen} onOpenChange={setHeldOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>الطلبات المعلقة</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {(heldQuery.data ?? []).map((o) => (
              <div key={o.id} className="flex items-center gap-2 rounded-lg border p-2 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{o.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(o.created_at).toLocaleTimeString("ar-EG")} · {o.lines.length} صنف
                  </div>
                </div>
                <Button size="sm" onClick={() => void resumeOrder(o)}>
                  استئناف
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={async () => {
                    await db().held_orders.delete(o.id);
                    await qc.invalidateQueries({ queryKey: ["held-orders"] });
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            {!(heldQuery.data ?? []).length && (
              <p className="py-6 text-center text-sm text-muted-foreground">لا توجد طلبات معلقة.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* clear confirm */}
      <Dialog open={clearOpen} onOpenChange={setClearOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>تفريغ السلة؟</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">سيتم حذف كل الأصناف من الفاتورة الحالية.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClearOpen(false)}>
              إلغاء
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setCart([]);
                setCartDiscount(0);
                setClearOpen(false);
              }}
            >
              تفريغ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* new customer */}
      <Dialog
        open={newCustomer.open}
        onOpenChange={(o) => setNewCustomer((p) => ({ ...p, open: o }))}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>عميل جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="cname">الاسم</Label>
              <Input
                id="cname"
                value={newCustomer.name}
                onChange={(e) => setNewCustomer((p) => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cphone">الجوال</Label>
              <Input
                id="cphone"
                value={newCustomer.phone}
                onChange={(e) => setNewCustomer((p) => ({ ...p, phone: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={!newCustomer.name.trim() || addCustomer.isPending}
              onClick={() => addCustomer.mutate()}
            >
              إضافة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value, action }: { label: string; value: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">
        {label} {action}
      </span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
