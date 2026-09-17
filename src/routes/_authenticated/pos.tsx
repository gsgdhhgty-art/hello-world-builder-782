import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Minus, Plus, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { money, num, PAYMENT_LABELS } from "@/lib/format";
import { calculateCartTotals } from "@/lib/pos-math";
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
}

interface CartLine {
  product: ProductRow;
  quantity: number;
  discount: number;
}

function PosPage() {
  const { org, profile, can, session } = useAuth();
  const qc = useQueryClient();
  const currency = org?.currency ?? "SAR";

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState("none");
  const [method, setMethod] = useState("CASH");
  const [paidInput, setPaidInput] = useState("");
  const [openingCash, setOpeningCash] = useState("0");
  const [lastReceipt, setLastReceipt] = useState<null | {
    invoice_no: string;
    total: number;
    change_due: number;
  }>(null);

  const shiftQuery = useQuery({
    queryKey: ["open-shift", session?.user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shifts")
        .select("id, opening_cash, opened_at, branch_id, register_id")
        .eq("status", "OPEN")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const productsQuery = useQuery({
    queryKey: ["pos-products"],
    queryFn: () =>
      localFirst<ProductRow>("products", async () => {
        const { data, error } = await supabase
          .from("products")
          .select("id, name, barcode, sku, price, unit, track_stock, category_id")
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
          await db()
            .inventory.bulkPut(
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
      const { data: reg } = await supabase
        .from("registers")
        .select("id, branch_id")
        .eq("is_active", true)
        .order("created_at")
        .limit(1)
        .maybeSingle();
      if (!reg) throw new Error("لا يوجد جهاز كاشير مُعد");
      const { error } = await supabase.from("shifts").insert({
        org_id: profile!.org_id!,
        branch_id: reg.branch_id,
        register_id: reg.id,
        user_id: profile!.id,
        opening_cash: Number(openingCash) || 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم فتح الوردية");
      void qc.invalidateQueries({ queryKey: ["open-shift"] });
    },
    onError: () => toast.error("تعذر فتح الوردية"),
  });

  const checkout = useMutation({
    mutationFn: async () => {
      const clientTxnId = crypto.randomUUID();
      const localCreatedAt = new Date().toISOString();
      const payload = {
        items: cart.map((l) => ({
          product_id: l.product.id,
          quantity: l.quantity,
          discount: l.discount,
        })),
        payment_method: method,
        paid: method === "CREDIT" ? 0 : Number(paidInput) || 0,
        customer_id: customerId === "none" ? null : customerId,
        client_txn_id: clientTxnId,
        local_created_at: localCreatedAt,
      };

      async function saveOffline(): Promise<{
        invoice_no: string;
        total: number;
        change_due: number;
        offline: boolean;
      }> {
        const paid = method === "CREDIT" ? 0 : Math.max(Number(paidInput) || 0, totals.total);
        const invoice = `OFF-${localCreatedAt.slice(0, 10).replace(/-/g, "")}-${clientTxnId.slice(0, 4).toUpperCase()}`;
        await recordLocalSale({
          id: clientTxnId,
          client_txn_id: clientTxnId,
          invoice_no: invoice,
          total: totals.total,
          subtotal: totals.subtotal,
          discount: totals.discount,
          tax: totals.tax,
          paid,
          change_due: Math.max(paid - totals.total, 0),
          payment_method: method,
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
            line_total: Number(l.product.price) * l.quantity - l.discount,
          })),
        });
        await enqueue("sale", "CREATE", payload, {
          entity_id: clientTxnId,
          idempotency_key: clientTxnId,
        });
        return {
          invoice_no: invoice,
          total: totals.total,
          change_due: Math.max(paid - totals.total, 0),
          offline: true,
        };
      }

      if (!isOnline()) return saveOffline();

      try {
        const { data, error } = await supabase.rpc("create_sale", { _payload: payload });
        if (error) throw error;
        return {
          ...(data as { invoice_no: string; total: number; change_due: number }),
          offline: false,
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : "";
        const networkFailure =
          /fetch|network|timeout|Failed to fetch|NetworkError/i.test(message) || !isOnline();
        if (networkFailure) return saveOffline();
        throw e;
      }
    },
    onSuccess: (data) => {
      setLastReceipt(data);
      setCart([]);
      setPaidInput("");
      setMethod("CASH");
      setCustomerId("none");
      toast.success(
        data.offline
          ? `تم حفظ الفاتورة ${data.invoice_no} محليًا وسترسل تلقائيًا عند عودة الإنترنت`
          : `تم إتمام الفاتورة ${data.invoice_no}`,
      );
      void qc.invalidateQueries({ queryKey: ["pos-stock"] });
      void qc.invalidateQueries({ queryKey: ["sales"] });
    },
    onError: (e: Error) => {
      const map: Record<string, string> = {
        "no open shift": "افتح وردية قبل البيع",
        "cart is empty": "السلة فارغة",
        "credit sale requires a customer": "البيع الآجل يحتاج اختيار عميل",
        "no permission to create sales": "لا تملك صلاحية البيع",
      };
      const key = Object.keys(map).find((k) => e.message.includes(k));
      toast.error(key ? map[key] : "تعذر إتمام الفاتورة");
    },
  });

  async function holdOrder() {
    if (!cart.length || !hasLocalDb()) return;
    const order: HeldOrder = {
      id: crypto.randomUUID(),
      label: `${cart.length} صنف — ${money(totals.total, currency)}`,
      created_at: new Date().toISOString(),
      lines: cart.map((l) => ({
        product_id: l.product.id,
        quantity: l.quantity,
        discount: l.discount,
      })),
    };
    await db().held_orders.put(order);
    setCart([]);
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
  }

  const filtered = useMemo(() => {
    const list = productsQuery.data ?? [];
    const q = search.trim().toLowerCase();
    return list.filter((p) => {
      if (category !== "all" && p.category_id !== category) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.barcode ?? "").toLowerCase().includes(q) ||
        (p.sku ?? "").toLowerCase().includes(q)
      );
    });
  }, [productsQuery.data, search, category]);

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

  function addToCart(p: ProductRow) {
    setCart((prev) => {
      const idx = prev.findIndex((l) => l.product.id === p.id);
      if (idx === -1) return [...prev, { product: p, quantity: 1, discount: 0 }];
      const next = [...prev];
      const line = next[idx]!;
      next[idx] = { ...line, quantity: line.quantity + 1 };
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

  function onSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = search.trim();
    if (!q) return;
    const exact = (productsQuery.data ?? []).find((p) => p.barcode === q || p.sku === q);
    const target = exact ?? filtered[0];
    if (target) {
      addToCart(target);
      setSearch("");
    }
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
              أدخل النقدية الافتتاحية في الدرج لبدء البيع.
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

  return (
    <div className="flex h-[calc(100vh-0px)] flex-col lg:flex-row">
      {/* catalog */}
      <section className="flex min-w-0 flex-1 flex-col border-l bg-background">
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <form className="relative min-w-[220px] flex-1" onSubmit={onSearchSubmit}>
            <Search className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="ابحث بالاسم أو امسح الباركود ثم Enter"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pe-9"
            />
          </form>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="التصنيف" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل التصنيفات</SelectItem>
              {(categoriesQuery.data ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid flex-1 auto-rows-min grid-cols-2 gap-3 overflow-y-auto p-3 sm:grid-cols-3 xl:grid-cols-4">
          {filtered.map((p) => {
            const qty = stock[p.id] ?? 0;
            const out = p.track_stock && qty <= 0;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => addToCart(p)}
                className={cn(
                  "flex flex-col items-start gap-1 rounded-xl border bg-card p-3 text-start transition hover:border-primary hover:shadow-md",
                  out && "opacity-60",
                )}
              >
                <span className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold">{p.name}</span>
                <span className="text-base font-extrabold text-primary">
                  {money(p.price, currency)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {p.track_stock ? `المتوفر ${num(qty)} ${p.unit}` : "بدون مخزون"}
                </span>
              </button>
            );
          })}
          {!filtered.length && (
            <p className="col-span-full py-10 text-center text-sm text-muted-foreground">
              لا توجد منتجات مطابقة. أضف منتجاتك من صفحة المنتجات.
            </p>
          )}
        </div>
      </section>

      {/* cart */}
      <aside className="flex w-full shrink-0 flex-col bg-card lg:h-screen lg:w-[380px]">
        <div className="flex items-center justify-between border-b p-3">
          <div>
            <div className="font-bold">الفاتورة الحالية</div>
            <div className="text-xs text-muted-foreground">{profile?.full_name}</div>
          </div>
          <div className="flex items-center gap-1">
            {cart.length > 0 && (
              <>
                <Button variant="ghost" size="sm" onClick={() => void holdOrder()}>
                  <PauseCircle className="size-4" /> تعليق
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setCart([])}>
                  <Trash2 className="size-4" /> تفريغ
                </Button>
              </>
            )}
          </div>
        </div>

        {(heldQuery.data ?? []).length > 0 && (
          <div className="space-y-1 border-b bg-secondary/50 p-3">
            <div className="text-xs font-bold text-muted-foreground">طلبات معلقة</div>
            {(heldQuery.data ?? []).map((o) => (
              <div key={o.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate">{o.label}</span>
                <Button size="sm" variant="outline" onClick={() => void resumeOrder(o)}>
                  <PlayCircle className="size-3.5" /> استئناف
                </Button>
              </div>
            ))}
          </div>
        )}


        <div className="min-h-32 flex-1 space-y-2 overflow-y-auto p-3">
          {cart.map((l) => (
            <div key={l.product.id} className="rounded-lg border p-2">
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-semibold">{l.product.name}</span>
                <button
                  type="button"
                  onClick={() => setQty(l.product.id, 0)}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="حذف"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="outline"
                    className="size-7"
                    onClick={() => setQty(l.product.id, l.quantity - 1)}
                  >
                    <Minus className="size-3" />
                  </Button>
                  <Input
                    className="h-7 w-16 text-center"
                    value={l.quantity}
                    onChange={(e) => setQty(l.product.id, Number(e.target.value) || 0)}
                  />
                  <Button
                    size="icon"
                    variant="outline"
                    className="size-7"
                    onClick={() => setQty(l.product.id, l.quantity + 1)}
                  >
                    <Plus className="size-3" />
                  </Button>
                </div>
                <span className="font-bold tabular-nums">
                  {money(Number(l.product.price) * l.quantity - l.discount, currency)}
                </span>
              </div>
              {can("sales.discount") && (
                <div className="mt-2 flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">خصم</Label>
                  <Input
                    className="h-7"
                    type="number"
                    step="0.01"
                    value={l.discount}
                    onChange={(e) =>
                      setCart((prev) =>
                        prev.map((x) =>
                          x.product.id === l.product.id
                            ? { ...x, discount: Number(e.target.value) || 0 }
                            : x,
                        ),
                      )
                    }
                  />
                </div>
              )}
            </div>
          ))}
          {!cart.length && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              السلة فارغة — اختر منتجًا للبدء.
            </p>
          )}
        </div>

        <div className="space-y-3 border-t p-3">
          <div className="space-y-1 text-sm">
            <Row label="الإجمالي قبل الخصم" value={money(totals.subtotal, currency)} />
            <Row label="الخصم" value={money(totals.discount, currency)} />
            <Row
              label={`الضريبة (${num(org?.tax_rate ?? 0, 0)}%)`}
              value={money(totals.tax, currency)}
            />
            <div className="flex items-center justify-between border-t pt-2 text-lg font-extrabold">
              <span>المطلوب</span>
              <span className="tabular-nums text-primary">{money(totals.total, currency)}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PAYMENT_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger>
                <SelectValue placeholder="عميل" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">بدون عميل</SelectItem>
                {(customersQuery.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {method !== "CREDIT" && (
            <div className="space-y-1">
              <Label htmlFor="paid" className="text-xs">
                المبلغ المدفوع
              </Label>
              <Input
                id="paid"
                type="number"
                step="0.01"
                value={paidInput}
                onChange={(e) => setPaidInput(e.target.value)}
                placeholder={String(totals.total)}
              />
              {Number(paidInput) > totals.total && (
                <p className="text-xs text-muted-foreground">
                  الباقي للعميل: {money(Number(paidInput) - totals.total, currency)}
                </p>
              )}
            </div>
          )}

          <Button
            className="h-12 w-full text-base"
            disabled={!cart.length || checkout.isPending}
            onClick={() => checkout.mutate()}
          >
            {checkout.isPending ? "جارٍ الحفظ..." : "إتمام البيع"}
          </Button>

          {lastReceipt && (
            <div className="rounded-lg bg-secondary p-3 text-sm">
              <div className="font-bold">آخر فاتورة: {lastReceipt.invoice_no}</div>
              <div>الإجمالي: {money(lastReceipt.total, currency)}</div>
              <div>الباقي: {money(lastReceipt.change_due, currency)}</div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-muted-foreground">
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
