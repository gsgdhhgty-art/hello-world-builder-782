import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, History, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { dateTime, money, num, PAYMENT_LABELS } from "@/lib/format";
import { round2 } from "@/lib/pos-math";

export const Route = createFileRoute("/_authenticated/returns")({
  head: () => ({
    meta: [
      { title: "المرتجعات والاستبدال — SmartPOS" },
      { name: "description", content: "إدارة مرتجعات واستبدال المبيعات وتحديث المخزون." },
      { property: "og:title", content: "المرتجعات والاستبدال — SmartPOS" },
      { property: "og:description", content: "تحقق من الفاتورة ونفّذ المرتجع أو الاستبدال بأمان." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ReturnsPage,
});

type SaleRow = {
  id: string;
  invoice_no: string;
  total: number;
  status: string;
  created_at: string;
};

type SaleItemRow = {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
};

type ProductRow = { id: string; name: string; price: number; tax_rate: number | null };

type ExchangeResult = {
  invoice_no: string;
  returned_total: number;
  replacement_total: number;
  amount_due: number;
  refund_due: number;
};

function ReturnsPage() {
  const { org, can } = useAuth();
  const qc = useQueryClient();
  const currency = org?.currency ?? "EGP";
  const [invoice, setInvoice] = useState("");
  const [saleId, setSaleId] = useState<string | null>(null);
  const [mode, setMode] = useState<"return" | "exchange">("return");
  const [qty, setQty] = useState<Record<string, string>>({});
  const [replacementQty, setReplacementQty] = useState<Record<string, number>>({});
  const [replacementProductId, setReplacementProductId] = useState("");
  const [settlementMethod, setSettlementMethod] = useState("CASH");
  const [reason, setReason] = useState("");

  const salesQuery = useQuery({
    queryKey: ["returnable-sales"],
    queryFn: async (): Promise<SaleRow[]> => {
      const { data, error } = await supabase
        .from("sales")
        .select("id, invoice_no, total, status, created_at")
        .neq("status", "VOID")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as SaleRow[];
    },
  });

  const itemsQuery = useQuery({
    queryKey: ["return-sale-items", saleId],
    enabled: Boolean(saleId),
    queryFn: async (): Promise<SaleItemRow[]> => {
      if (!saleId) return [];
      const { data, error } = await supabase
        .from("sale_items")
        .select("id, product_name, quantity, unit_price, line_total")
        .eq("sale_id", saleId);
      if (error) throw error;
      return (data ?? []) as SaleItemRow[];
    },
  });

  const returnedQuery = useQuery({
    queryKey: ["already-returned", saleId],
    enabled: Boolean(saleId && itemsQuery.data?.length),
    queryFn: async () => {
      const itemIds = (itemsQuery.data ?? []).map((item) => item.id);
      if (!itemIds.length) return {} as Record<string, number>;
      const { data, error } = await supabase
        .from("sale_return_items")
        .select("sale_item_id, quantity")
        .in("sale_item_id", itemIds);
      if (error) throw error;
      return (data ?? []).reduce<Record<string, number>>((map, row) => {
        map[row.sale_item_id] = (map[row.sale_item_id] ?? 0) + Number(row.quantity);
        return map;
      }, {});
    },
  });

  const productsQuery = useQuery({
    queryKey: ["exchange-products"],
    enabled: mode === "exchange",
    queryFn: async (): Promise<ProductRow[]> => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, price, tax_rate")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as ProductRow[];
    },
  });

  const historyQuery = useQuery({
    queryKey: ["sale-exchanges"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sale_exchanges")
        .select(
          "id, original_sale_id, replacement_sale_id, returned_total, replacement_total, amount_due, refund_due, settlement_method, note, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  const filteredSales = useMemo(() => {
    const query = invoice.trim().toLowerCase();
    return (salesQuery.data ?? []).filter((sale) =>
      query ? sale.invoice_no.toLowerCase().includes(query) : true,
    );
  }, [salesQuery.data, invoice]);

  const refundEstimate = useMemo(
    () =>
      round2(
        (itemsQuery.data ?? []).reduce((total, item) => {
          const amount = Number(qty[item.id]) || 0;
          return total + (amount > 0 ? (Number(item.line_total) * amount) / item.quantity : 0);
        }, 0),
      ),
    [itemsQuery.data, qty],
  );

  const replacementEstimate = useMemo(
    () =>
      round2(
        (productsQuery.data ?? []).reduce((total, product) => {
          const amount = replacementQty[product.id] ?? 0;
          const taxRate = product.tax_rate ?? org?.tax_rate ?? 0;
          return total + product.price * amount * (1 + taxRate / 100);
        }, 0),
      ),
    [productsQuery.data, replacementQty, org?.tax_rate],
  );

  const submit = useMutation({
    mutationFn: async () => {
      if (!saleId) throw new Error("sale required");
      const returnItems = Object.entries(qty)
        .map(([sale_item_id, value]) => ({ sale_item_id, quantity: Number(value) || 0 }))
        .filter((item) => item.quantity > 0);
      if (!returnItems.length) throw new Error("empty");
      if (mode === "return") {
        const { data, error } = await supabase.rpc("create_return", {
          _sale_id: saleId,
          _items: returnItems,
          ...(reason.trim() ? { _reason: reason.trim() } : {}),
        });
        if (error) throw error;
        return { kind: "return" as const, data: data as { total: number } };
      }
      const replacements = Object.entries(replacementQty)
        .map(([product_id, quantity]) => ({ product_id, quantity }))
        .filter((item) => item.quantity > 0);
      if (!replacements.length) throw new Error("replacement required");
      const { data, error } = await supabase.rpc("create_exchange", {
        _sale_id: saleId,
        _return_items: returnItems,
        _replacement_items: replacements,
        _settlement_method: settlementMethod,
        ...(reason.trim() ? { _note: reason.trim() } : {}),
      });
      if (error) throw error;
      return { kind: "exchange" as const, data: data as ExchangeResult };
    },
    onSuccess: (result) => {
      if (result.kind === "return") {
        toast.success(`تم إصدار المرتجع بمبلغ ${money(result.data.total, currency)}`);
      } else {
        const difference = result.data.amount_due
          ? `المطلوب تحصيله ${money(result.data.amount_due, currency)}`
          : `المطلوب رده ${money(result.data.refund_due, currency)}`;
        toast.success(`تم الاستبدال بالفاتورة ${result.data.invoice_no} — ${difference}`);
      }
      setQty({});
      setReplacementQty({});
      setReason("");
      void qc.invalidateQueries({ queryKey: ["already-returned"] });
      void qc.invalidateQueries({ queryKey: ["returnable-sales"] });
      void qc.invalidateQueries({ queryKey: ["sale-exchanges"] });
      void qc.invalidateQueries({ queryKey: ["sales"] });
      void qc.invalidateQueries({ queryKey: ["pos-stock"] });
    },
    onError: (error: Error) => {
      const errors: Array<[string, string]> = [
        ["no permission", "لا تملك صلاحية تنفيذ هذه العملية"],
        ["return quantity exceeds", "الكمية تتجاوز المتاح للإرجاع"],
        ["no open shift", "افتح وردية قبل تنفيذ الاستبدال"],
        ["replacement required", "أضف صنفًا بديلًا"],
        ["empty", "اختر كمية للإرجاع"],
      ];
      toast.error(errors.find(([key]) => error.message.includes(key))?.[1] ?? "تعذر تنفيذ العملية");
    },
  });

  function addReplacement() {
    if (!replacementProductId) return;
    setReplacementQty((current) => ({
      ...current,
      [replacementProductId]: (current[replacementProductId] ?? 0) + 1,
    }));
  }

  if (!can("sales.refund")) {
    return <div className="p-10 text-center text-muted-foreground">لا تملك صلاحية المرتجعات.</div>;
  }

  return (
    <div>
      <PageHeader
        title="المرتجعات والاستبدال"
        description="تحقق من الفاتورة، حدّد الأصناف، ثم أعدها أو استبدلها في عملية واحدة."
      />
      <Tabs defaultValue="operation" className="space-y-4 px-4 pb-6 sm:px-6">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="operation">
            <RotateCcw className="me-2 size-4" /> عملية جديدة
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="me-2 size-4" /> سجل الاستبدال
          </TabsTrigger>
        </TabsList>

        <TabsContent value="operation">
          <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
            <Card>
              <CardHeader>
                <CardTitle>التحقق من الفاتورة</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="رقم الفاتورة"
                    value={invoice}
                    onChange={(event) => setInvoice(event.target.value)}
                    className="pe-9"
                  />
                </div>
                <div className="max-h-[60vh] space-y-2 overflow-y-auto">
                  {filteredSales.map((sale) => (
                    <Button
                      key={sale.id}
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setSaleId(sale.id);
                        setQty({});
                      }}
                      className={`h-auto w-full justify-start p-3 text-start ${saleId === sale.id ? "border-primary bg-primary/5" : ""}`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex justify-between gap-2 font-bold">
                          <span>{sale.invoice_no}</span>
                          <span>{money(sale.total, currency)}</span>
                        </span>
                        <span className="mt-1 block text-xs font-normal text-muted-foreground">
                          {dateTime(sale.created_at)} ·{" "}
                          {sale.status === "COMPLETED" ? "متاحة" : "مرتجع جزئي"}
                        </span>
                      </span>
                    </Button>
                  ))}
                  {!filteredSales.length && (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      لا توجد فاتورة مطابقة.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle>{mode === "return" ? "أصناف المرتجع" : "أصناف الاستبدال"}</CardTitle>
                <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
                  <Button
                    size="sm"
                    variant={mode === "return" ? "default" : "ghost"}
                    onClick={() => setMode("return")}
                  >
                    مرتجع
                  </Button>
                  <Button
                    size="sm"
                    variant={mode === "exchange" ? "default" : "ghost"}
                    onClick={() => setMode("exchange")}
                  >
                    استبدال
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {!saleId && (
                  <p className="py-12 text-center text-sm text-muted-foreground">
                    اختر فاتورة للبدء.
                  </p>
                )}
                {(itemsQuery.data ?? []).map((item) => {
                  const already = returnedQuery.data?.[item.id] ?? 0;
                  const max = Number(item.quantity) - already;
                  return (
                    <div
                      key={item.id}
                      className="grid grid-cols-[minmax(0,1fr)_88px] items-center gap-3 rounded-lg border p-3"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{item.product_name}</div>
                        <div className="text-xs text-muted-foreground">
                          مباع {num(item.quantity)} · مرتجع {num(already)} · متاح {num(max)} ·{" "}
                          {money(item.unit_price, currency)}
                        </div>
                      </div>
                      <Input
                        aria-label={`كمية إرجاع ${item.product_name}`}
                        type="number"
                        min={0}
                        max={max}
                        step="0.001"
                        disabled={max <= 0}
                        value={qty[item.id] ?? ""}
                        onChange={(event) =>
                          setQty((current) => ({ ...current, [item.id]: event.target.value }))
                        }
                      />
                    </div>
                  );
                })}

                {saleId && mode === "exchange" && (
                  <div className="space-y-3 border-t pt-4">
                    <Label>الأصناف البديلة</Label>
                    <div className="flex gap-2">
                      <Select value={replacementProductId} onValueChange={setReplacementProductId}>
                        <SelectTrigger className="min-w-0 flex-1">
                          <SelectValue placeholder="اختر صنفًا بديلًا" />
                        </SelectTrigger>
                        <SelectContent>
                          {(productsQuery.data ?? []).map((product) => (
                            <SelectItem key={product.id} value={product.id}>
                              {product.name} — {money(product.price, currency)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        aria-label="إضافة الصنف البديل"
                        onClick={addReplacement}
                      >
                        <Plus className="size-4" />
                      </Button>
                    </div>
                    {Object.entries(replacementQty).map(([productId, amount]) => {
                      const product = productsQuery.data?.find((item) => item.id === productId);
                      if (!product) return null;
                      return (
                        <div
                          key={productId}
                          className="flex items-center gap-3 rounded-lg border p-3"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-semibold">{product.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {money(product.price, currency)}
                            </div>
                          </div>
                          <Input
                            className="w-20"
                            type="number"
                            min={1}
                            step="0.001"
                            value={amount}
                            onChange={(event) =>
                              setReplacementQty((current) => ({
                                ...current,
                                [productId]: Math.max(Number(event.target.value) || 0, 0),
                              }))
                            }
                          />
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            aria-label={`حذف ${product.name}`}
                            onClick={() =>
                              setReplacementQty((current) => {
                                const next = { ...current };
                                delete next[productId];
                                return next;
                              })
                            }
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      );
                    })}
                    <div className="space-y-2">
                      <Label>طريقة تسوية الفرق</Label>
                      <Select value={settlementMethod} onValueChange={setSettlementMethod}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(PAYMENT_LABELS)
                            .filter(([key]) => ["CASH", "CARD", "TRANSFER", "CREDIT"].includes(key))
                            .map(([key, label]) => (
                              <SelectItem key={key} value={key}>
                                {label}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {saleId && (
                  <>
                    <div className="space-y-1">
                      <Label htmlFor="return-reason">سبب العملية</Label>
                      <Textarea
                        id="return-reason"
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        placeholder="مقاس غير مناسب، صنف تالف..."
                      />
                    </div>
                    <div className="grid gap-2 rounded-lg bg-muted/50 p-3 text-sm sm:grid-cols-3">
                      <Summary label="قيمة المرتجع" value={refundEstimate} currency={currency} />
                      {mode === "exchange" && (
                        <Summary
                          label="قيمة البديل"
                          value={replacementEstimate}
                          currency={currency}
                        />
                      )}
                      {mode === "exchange" && (
                        <Summary
                          label={
                            replacementEstimate >= refundEstimate ? "المطلوب تحصيله" : "المطلوب رده"
                          }
                          value={Math.abs(replacementEstimate - refundEstimate)}
                          currency={currency}
                        />
                      )}
                    </div>
                    <Button
                      className="w-full"
                      disabled={
                        submit.isPending ||
                        refundEstimate <= 0 ||
                        (mode === "exchange" && replacementEstimate <= 0)
                      }
                      onClick={() => submit.mutate()}
                    >
                      {mode === "exchange" ? (
                        <ArrowLeftRight className="size-4" />
                      ) : (
                        <RotateCcw className="size-4" />
                      )}
                      {submit.isPending
                        ? "جارٍ التنفيذ..."
                        : mode === "exchange"
                          ? "تنفيذ الاستبدال"
                          : "إصدار المرتجع"}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      تُراجع الكميات والأسعار في النظام، ويتحدث المخزون وتُسجل العملية تلقائيًا.
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>سجل عمليات الاستبدال</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(historyQuery.data ?? []).map((exchange) => (
                <div
                  key={exchange.id}
                  className="grid gap-3 rounded-lg border p-3 text-sm sm:grid-cols-[1fr_repeat(3,auto)] sm:items-center"
                >
                  <div>
                    <div className="font-bold">استبدال {exchange.original_sale_id.slice(0, 8)}</div>
                    <div className="text-xs text-muted-foreground">
                      {dateTime(exchange.created_at)}
                      {exchange.note ? ` · ${exchange.note}` : ""}
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">مرتجع </span>
                    <b>{money(exchange.returned_total, currency)}</b>
                  </div>
                  <div>
                    <span className="text-muted-foreground">بديل </span>
                    <b>{money(exchange.replacement_total, currency)}</b>
                  </div>
                  <Badge variant={Number(exchange.amount_due) > 0 ? "default" : "secondary"}>
                    {Number(exchange.amount_due) > 0
                      ? `تحصيل ${money(exchange.amount_due, currency)}`
                      : `رد ${money(exchange.refund_due, currency)}`}
                  </Badge>
                </div>
              ))}
              {!historyQuery.data?.length && (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  لا توجد عمليات استبدال بعد.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Summary({ label, value, currency }: { label: string; value: number; currency: string }) {
  return (
    <div className="flex justify-between gap-2 sm:block">
      <span className="text-muted-foreground">{label}</span>
      <div className="font-black text-primary">{money(value, currency)}</div>
    </div>
  );
}
