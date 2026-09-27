import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Camera,
  CloudOff,
  Inbox,
  Minus,
  Monitor,
  Printer,
  PauseCircle,
  Package,
  Percent,
  PlayCircle,
  Plus,
  Search,
  ShoppingCart,
  Star,
  Sparkles,
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
import { ReceiptDialog, printReceipt, type ReceiptData } from "@/components/pos/ReceiptDialog";
import { HardwareDialog } from "@/components/pos/HardwareDialog";
import { loadHardware, nativeBridge, openCashDrawer } from "@/lib/hardware";
import { openDisplayChannel, type DisplayState } from "@/lib/customer-display";
import { money, num } from "@/lib/format";
import { beep } from "@/lib/feedback";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { calculateCartTotals, round2 } from "@/lib/pos-math";
import { cn } from "@/lib/utils";
import { db, getMeta, hasLocalDb, setMeta, type HeldOrder } from "@/lib/offline/db";
import { localFirst } from "@/lib/offline/local-first";
import { enqueue, isOnline, localStockMap, recordLocalSale } from "@/lib/offline/sync";
import { useOffline } from "@/hooks/useOffline";
import { resolveProductImages } from "@/lib/product-images";
import { AiSuggestDialog } from "@/components/pos/AiSuggestDialog";
import { expiryState, matchesScaleCode, parseScaleBarcode } from "@/lib/scale-barcode";

export const Route = createFileRoute("/_authenticated/pos")({
  head: () => ({
    meta: [
      { title: "الكاشير — SmartPOS" },
      { name: "description", content: "شاشة نقاط البيع: بحث المنتجات، سلة الفاتورة والدفع." },
      { property: "og:title", content: "الكاشير — SmartPOS" },
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
  expires_at: string | null;
}

interface CartLine {
  product: ProductRow;
  quantity: number;
  discount: number;
}

const FAV_KEY = "pos_favorites";
/** إذا لم يستجب الخادم خلال هذه المدة نُكمل الفاتورة محليًا ثم نزامنها لاحقًا. */
const SALE_TIMEOUT_MS = 7000;

/** يعتبر الخطأ انقطاعًا في الشبكة (وليس رفضًا من الخادم) فنُكمل العملية محليًا. */
function isNetworkFailure(message: string): boolean {
  return (
    /fetch|network|timeout|abort|signal|Failed to fetch|NetworkError/i.test(message) || !isOnline()
  );
}

function PosPage() {
  const { org, profile, can, session } = useAuth();
  const { online, pending } = useOffline();
  const qc = useQueryClient();
  const currency = org?.currency ?? "EGP";
  const taxRate = org?.tax_enabled ? Number(org.tax_rate) : 0;
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
  const [aiOpen, setAiOpen] = useState(false);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [hardwareOpen, setHardwareOpen] = useState(false);

  useEffect(() => {
    if (!hasLocalDb()) return;
    void getMeta<string[]>(FAV_KEY).then((saved) => setFavorites(saved ?? []));
  }, []);

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
      if (hasLocalDb()) void setMeta(FAV_KEY, next);
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
    queryFn: async () => {
      const rows = await localFirst<ProductRow>("products", async () => {
        const { data, error } = await supabase
          .from("products")
          .select(
            "id, name, barcode, sku, price, unit, track_stock, category_id, image_url, expires_at",
          )
          .eq("is_active", true)
          .order("name");
        if (error) throw error;
        return (data ?? []) as ProductRow[];
      });
      return resolveProductImages(rows);
    },
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
        taxRate,
      ),
    [cart, taxRate],
  );

  const gross = useMemo(
    () => round2(cart.reduce((s, l) => s + Number(l.product.price) * l.quantity, 0)),
    [cart],
  );
  const effCartDiscount = Math.min(cartDiscount, Math.max(gross - totals.discount, 0));
  const netAfterCartDiscount = round2(totals.subtotal - totals.discount - effCartDiscount);
  const taxTotal = round2((netAfterCartDiscount * taxRate) / 100);
  const grandTotal = round2(netAfterCartDiscount + taxTotal);

  const receiptBusiness = {
    name: org?.name ?? "متجري",
    business_type: org?.business_type,
    address: org?.address,
    phone: org?.phone,
    tax_number: org?.tax_number,
    commercial_register: org?.commercial_register,
    logo_url: org?.logo_src,
    receipt_header: org?.receipt_header,
    receipt_footer: org?.receipt_footer,
    tax_enabled: org?.tax_enabled,
  };

  // شاشة العميل: نبث السلة الحالية لنافذة العميل على نفس الجهاز
  const displayRef = useRef<BroadcastChannel | null>(null);
  const displayState: DisplayState = {
    store: org?.name ?? "SmartPOS",
    currency,
    lines: cart.map((l) => ({
      name: l.product.name,
      quantity: l.quantity,
      total: round2(Number(l.product.price) * l.quantity - l.discount),
    })),
    subtotal: totals.subtotal,
    discount: round2(totals.discount + effCartDiscount),
    tax: taxTotal,
    total: grandTotal,
    done: null,
  };
  const displayJson = JSON.stringify(displayState);
  const latestDisplay = useRef(displayState);
  latestDisplay.current = displayState;
  useEffect(() => {
    const ch = openDisplayChannel();
    displayRef.current = ch;
    if (ch) ch.onmessage = () => ch.postMessage(latestDisplay.current);
    return () => ch?.close();
  }, []);
  useEffect(() => {
    // لا نمسح شاشة "شكرًا" فور إفراغ السلة بعد البيع
    if (cart.length === 0) return;
    displayRef.current?.postMessage(JSON.parse(displayJson) as DisplayState);
  }, [displayJson, cart.length]);

  const openCustomerDisplay = () => {
    const w = window.open("/customer-display", "smartpos-customer-display", "width=1024,height=700");
    if (!w) toast.error("اسمح بالنوافذ المنبثقة لفتح شاشة العميل");
  };

  const kickDrawer = async () => {
    const res = await openCashDrawer();
    if (!res.ok) toast.error(res.error ?? "تعذر فتح الدرج");
  };


  const checkout = useMutation({
    mutationFn: async (payments: PaymentLine[]) => {
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
        payments: payments.map((p) => ({ method: p.method, amount: p.amount })),
        items: cart.map((l) => ({
          name: l.product.name,
          sku: l.product.sku ?? l.product.barcode,
          quantity: l.quantity,
          unit_price: Number(l.product.price),
          line_total: round2(Number(l.product.price) * l.quantity - l.discount),
        })),
      };

      async function saveOffline(): Promise<ReceiptData> {
        const paid = Math.min(paidNonCredit, grandTotal);
        const invoice = `OFF-${localCreatedAt.slice(0, 10).replace(/-/g, "")}-${clientTxnId
          .slice(0, 4)
          .toUpperCase()}`;
        const warehouses = hasLocalDb() ? await db().warehouses.toArray() : [];
        const branchId = shiftQuery.data?.branch_id as string | undefined;
        const warehouse =
          warehouses.find(
            (candidate) => candidate["branch_id"] === branchId && candidate["is_active"] !== false,
          ) ??
          warehouses.find(
            (candidate) => !candidate["branch_id"] && candidate["is_active"] !== false,
          );
        await recordLocalSale(
          {
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
          },
          warehouse?.["id"] as string | undefined,
        );
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

      if (!isOnline()) return saveOffline();

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
        if (isNetworkFailure(message)) return saveOffline();
        throw e;
      }
    },
    onSuccess: (data) => {
      setPayOpen(false);
      setMobileCartOpen(false);
      const hw = loadHardware();
      if (hw.openDrawerOnCash && data.payments.some((p) => p.method === "CASH")) void kickDrawer();
      displayRef.current?.postMessage({
        ...displayState,
        done: { paid: data.paid, change: data.change_due },
      } satisfies DisplayState);
      if (hw.autoPrint) printReceipt(data, receiptBusiness, currency, hw.paper);
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

  const addToCart = useCallback(
    (p: ProductRow, qty = 1) => {
      if (
        org?.block_expired_sales &&
        expiryState(p.expires_at, org.expiry_alert_days) === "expired"
      ) {
        beep("error");
        toast.error(`${p.name} منتهي الصلاحية — لم تتم إضافته`);
        return false;
      }
      setCart((prev) => {
        const idx = prev.findIndex((l) => l.product.id === p.id);
        if (idx === -1) return [...prev, { product: p, quantity: qty, discount: 0 }];
        const next = [...prev];
        const line = next[idx]!;
        next[idx] = { ...line, quantity: line.quantity + qty };
        return next;
      });
      return true;
    },
    [org?.block_expired_sales, org?.expiry_alert_days],
  );

  function setQty(id: string, qty: number) {
    setCart((prev) =>
      qty <= 0
        ? prev.filter((l) => l.product.id !== id)
        : prev.map((l) => (l.product.id === id ? { ...l, quantity: qty } : l)),
    );
  }

  const scanCode = useCallback(
    (code: string) => {
      const value = code.trim();
      if (!value) return;
      const scale = org?.scale_barcode_enabled
        ? parseScaleBarcode(value, org.scale_barcode_prefix, org.scale_barcode_mode)
        : null;
      if (scale) {
        const product = (productsQuery.data ?? []).find((candidate) =>
          matchesScaleCode(candidate, scale.code),
        );
        if (product) {
          const quantity =
            scale.mode === "WEIGHT" ? scale.value : scale.value / Number(product.price);
          if (!Number.isFinite(quantity) || quantity <= 0 || !addToCart(product, quantity)) return;
          beep("ok");
          toast.success(
            `تمت إضافة ${product.name} — ${num(quantity)} ${product.unit} — ${money(product.price * quantity, currency)}`,
          );
          setSearch("");
          searchRef.current?.focus();
          return;
        }
      }
      const local = (productsQuery.data ?? []).find((p) => p.barcode === value || p.sku === value);
      if (local) {
        if (!addToCart(local)) return;
        beep("ok");
        toast.success(`تمت إضافة ${local.name} — ${money(local.price, currency)}`);
        setSearch("");
        searchRef.current?.focus();
        return;
      }
      // Not in the cached catalog yet: ask the server before rejecting the scan.
      void (async () => {
        const { data } = await supabase
          .from("products")
          .select(
            "id, name, barcode, sku, price, unit, track_stock, category_id, image_url, expires_at",
          )
          .or(`barcode.eq.${value},sku.eq.${value}`)
          .eq("is_active", true)
          .limit(1)
          .maybeSingle();
        if (data) {
          if (!addToCart(data as ProductRow)) return;
          beep("ok");
          toast.success(`تمت إضافة ${data.name} — ${money(data.price, currency)}`);
          setSearch("");
          void productsQuery.refetch();
        } else {
          beep("error");
          toast.error(`الباركود ${value} غير مسجل — لم تتم إضافة أي منتج`);
          setSearch(value);
        }
        searchRef.current?.focus();
      })();
    },
    [addToCart, currency, org, productsQuery],
  );

  useBarcodeScanner({ onScan: scanCode, allowedTarget: searchRef });

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
  const cartUnits = cart.reduce((sum, line) => sum + line.quantity, 0);

  return (
    <div className="flex min-h-[calc(100vh-72px)] flex-col gap-3 bg-background p-2 pb-24 sm:p-3 lg:h-[calc(100vh-72px)] lg:flex-row lg:overflow-hidden lg:pb-3">
      {/* ===== catalog ===== */}
      <section className="workspace-card flex min-w-0 flex-1 flex-col overflow-hidden">
        {!online && (
          <div className="flex items-center gap-2 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive">
            <CloudOff className="size-4" />
            تعمل بدون إنترنت — البيع مستمر ويُحفظ محليًا
            {pending > 0 ? ` (${pending} بانتظار الرفع)` : ""}
          </div>
        )}
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 p-3 sm:flex">
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
              className="h-12 rounded-xl border-primary/20 bg-background pe-10 text-sm shadow-xs focus-visible:ring-primary/15"
            />
          </form>
          <Button
            variant="outline"
            size="icon"
            className="size-12 shrink-0 border-primary/20 text-primary"
            onClick={() => setScannerOpen(true)}
            aria-label="فتح ماسح الباركود بالكاميرا"
            title="مسح الباركود بالكاميرا"
          >
            <Camera className="size-5" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-12 shrink-0 border-primary/20 text-primary"
            onClick={() => setAiOpen(true)}
            aria-label="اقتراح منتجات بالذكاء الاصطناعي"
            title="اقتراح منتجات من وصف العميل"
          >
            <Sparkles className="size-5" />
          </Button>
        </div>

        <div className="flex gap-2 overflow-x-auto border-y border-border/70 bg-muted/30 p-2 scroll-slim">
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

        <div className="grid flex-1 auto-rows-min grid-cols-2 gap-2 overflow-y-auto p-2 min-[480px]:grid-cols-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 scroll-slim">
          {filtered.map((p) => {
            const qty = stock[p.id] ?? 0;
            const out = p.track_stock && qty <= 0;
            const expired = expiryState(p.expires_at, org?.expiry_alert_days ?? 30) === "expired";
            return (
              <div key={p.id} className="relative">
                <button
                  type="button"
                  onClick={() => addToCart(p)}
                  className={cn(
                    "group flex h-full w-full touch-target select-none flex-col gap-1 overflow-hidden rounded-lg border border-border bg-card text-start shadow-xs transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-card active:scale-[0.98]",
                    (out || (expired && org?.block_expired_sales)) && "opacity-60",
                  )}
                >
                  <div className="grid aspect-[4/3] w-full place-items-center bg-muted/45 p-2">
                    {p.image_url ? (
                      <img
                        src={p.image_url}
                        alt={p.name}
                        loading="lazy"
                        className="size-full object-contain transition-transform group-hover:scale-105"
                      />
                    ) : (
                      <Package className="size-10 text-muted-foreground/35" />
                    )}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5 p-2">
                    <span className="line-clamp-2 text-sm font-semibold">{p.name}</span>
                    <span className="text-sm font-black text-foreground">
                      {money(p.price, currency)}
                    </span>
                    <span
                      className={cn(
                        "mt-1 w-fit rounded-full px-2 py-0.5 text-[10px] font-bold",
                        out ? "bg-destructive/10 text-destructive" : "status-success",
                      )}
                    >
                      {p.track_stock ? `${num(qty)} متوفر` : "متاح"}
                    </span>
                    {expired ? (
                      <span className="text-[10px] font-bold text-destructive">منتهي الصلاحية</span>
                    ) : null}
                  </div>
                </button>
                <button
                  type="button"
                  aria-label="تفضيل"
                  onClick={() => toggleFavorite(p.id)}
                  className="absolute end-2 top-2 rounded-full border border-border bg-card/95 p-1.5 shadow-xs"
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

      <div className="fixed inset-x-3 bottom-3 z-30 lg:hidden">
        <Button
          className="grid h-16 w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl bg-success px-4 text-success-foreground shadow-lg hover:bg-success/90"
          disabled={!cart.length}
          onClick={() => setMobileCartOpen(true)}
        >
          <span className="relative grid size-10 shrink-0 place-items-center rounded-lg bg-success-foreground/15">
            <ShoppingCart className="size-5" />
            <span className="absolute -end-1 -top-1 grid min-w-5 place-items-center rounded-full bg-card px-1 text-[10px] font-black text-foreground">
              {num(cartUnits)}
            </span>
          </span>
          <span className="min-w-0 text-start">
            <span className="block truncate text-xs opacity-85">عرض الفاتورة وإغلاق البيع</span>
            <span className="block truncate text-base font-black">
              {money(grandTotal, currency)}
            </span>
          </span>
          <span className="shrink-0 text-sm font-black">متابعة</span>
        </Button>
      </div>

      {mobileCartOpen ? (
        <Button
          type="button"
          variant="ghost"
          className="fixed inset-0 z-40 h-auto rounded-none bg-foreground/30 p-0 hover:bg-foreground/30 lg:hidden"
          aria-label="إغلاق سلة المشتريات"
          onClick={() => setMobileCartOpen(false)}
        />
      ) : null}

      {/* ===== cart ===== */}
      <aside
        className={cn(
          "workspace-card fixed inset-x-2 bottom-2 top-20 z-50 flex w-auto shrink-0 flex-col overflow-hidden transition-transform duration-200 lg:static lg:h-full lg:w-[390px] lg:translate-y-0 xl:w-[420px]",
          mobileCartOpen
            ? "translate-y-0"
            : "pointer-events-none translate-y-[110%] lg:pointer-events-auto",
        )}
      >
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b p-4">
          <div className="min-w-0">
            <div className="truncate text-lg font-black">
              سلة المشتريات{" "}
              <span className="ms-1 inline-grid size-6 place-items-center rounded-full bg-primary text-xs text-primary-foreground">
                {cart.length}
              </span>
            </div>
            <div className="truncate text-xs text-muted-foreground">
              الكاشير: {profile?.full_name}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              aria-label="إغلاق السلة"
              onClick={() => setMobileCartOpen(false)}
            >
              <X className="size-4" />
            </Button>
            <Button variant="ghost" size="sm" aria-label="شاشة العميل" title="شاشة العميل" onClick={openCustomerDisplay}>
              <Monitor className="size-4" />
            </Button>
            <Button variant="ghost" size="sm" aria-label="الطابعة والدرج" title="الطابعة والدرج" onClick={() => setHardwareOpen(true)}>
              <Printer className="size-4" />
            </Button>
            {nativeBridge() && (
              <Button variant="ghost" size="sm" aria-label="فتح الدرج" title="فتح الدرج" onClick={() => void kickDrawer()}>
                <Inbox className="size-4" />
              </Button>
            )}
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

        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b bg-muted/25 p-3">
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
            aria-label="إضافة عميل جديد"
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
            <div
              key={l.product.id}
              className="flex items-center gap-2 border-b border-border/60 p-3 hover:bg-muted/25"
            >
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
                  aria-label={`تقليل كمية ${l.product.name}`}
                  onClick={() => setQty(l.product.id, l.quantity - 1)}
                >
                  <Minus className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="h-8 w-10 px-0 text-center text-sm font-bold"
                  aria-label={`تعديل كمية ${l.product.name}`}
                  onClick={() => setQtyEditor({ id: l.product.id, value: "" })}
                >
                  {num(l.quantity)}
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  className="size-8"
                  aria-label={`زيادة كمية ${l.product.name}`}
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
                    aria-label={`إضافة خصم إلى ${l.product.name}`}
                    onClick={() => setDiscEditor({ id: l.product.id, mode: "percent", value: "" })}
                  >
                    <Percent className="size-3.5" />
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  aria-label={`حذف ${l.product.name} من السلة`}
                  onClick={() => setQty(l.product.id, 0)}
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-2 border-t bg-muted/20 p-4 text-sm">
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
          <Row
            label={org?.tax_enabled ? `الضريبة (${num(org.tax_rate, 2)}%)` : "الضريبة (متوقفة)"}
            value={money(taxTotal, currency)}
          />
          <div className="flex items-center justify-between rounded-xl bg-primary/8 px-3 py-2 text-xl font-black">
            <span>الإجمالي</span>
            <span className="text-primary">{money(grandTotal, currency)}</span>
          </div>
          <Button
            className="h-14 w-full bg-success text-lg font-black text-success-foreground shadow-lg shadow-success/20 hover:bg-success/90"
            disabled={!cart.length || checkout.isPending}
            onClick={() => setPayOpen(true)}
          >
            الدفع · {money(grandTotal, currency)}
          </Button>
        </div>
      </aside>

      <CameraScanner open={scannerOpen} onOpenChange={setScannerOpen} onDetected={scanCode} />
      <AiSuggestDialog
        open={aiOpen}
        onOpenChange={setAiOpen}
        products={productsQuery.data ?? []}
        currency={currency}
        online={online}
        onAdd={(id) => {
          const product = productsQuery.data?.find((item) => item.id === id);
          if (product) addToCart(product);
        }}
      />

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
        business={{
          name: org?.name ?? "متجري",
          business_type: org?.business_type,
          address: org?.address,
          phone: org?.phone,
          tax_number: org?.tax_number,
          commercial_register: org?.commercial_register,
          logo_url: org?.logo_src,
          receipt_header: org?.receipt_header,
          receipt_footer: org?.receipt_footer,
          tax_enabled: org?.tax_enabled,
        }}
        currency={currency}
      />

      <HardwareDialog open={hardwareOpen} onOpenChange={setHardwareOpen} />

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
