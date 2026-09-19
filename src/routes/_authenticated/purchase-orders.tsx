import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PackageCheck, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { dateTime, money } from "@/lib/format";
import { localFirst } from "@/lib/offline/local-first";
import { db } from "@/lib/offline/db";
import { enqueue, isNetworkFailure, isOnline, REQUEST_TIMEOUT_MS } from "@/lib/offline/sync";

export const Route = createFileRoute("/_authenticated/purchase-orders")({
  head: () => ({
    meta: [
      { title: "طلبات الشراء — كاشير كلاود" },
      { name: "description", content: "إنشاء ومتابعة طلبات الشراء ثم تحويلها إلى فواتير استلام." },
      { property: "og:title", content: "طلبات الشراء — كاشير كلاود" },
      { property: "og:description", content: "دورة شراء واضحة من الطلب حتى استلام المخزون." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PurchaseOrdersPage,
});

type Line = { product_id: string; quantity: string; unit_cost: string };
const STATUS: Record<string, string> = {
  DRAFT: "مسودة",
  ORDERED: "أُرسل للمورد",
  RECEIVED: "مستلم",
  CANCELLED: "ملغي",
};

function PurchaseOrdersPage() {
  const { org, can, profile } = useAuth();
  const qc = useQueryClient();
  const currency = org?.currency ?? "SAR";
  const [open, setOpen] = useState(false);
  const [supplierId, setSupplierId] = useState("none");
  const [warehouseId, setWarehouseId] = useState("");
  const [expectedAt, setExpectedAt] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([{ product_id: "", quantity: "1", unit_cost: "0" }]);

  const orders = useQuery({
    queryKey: ["purchase-orders"],
    queryFn: () =>
      localFirst("purchase_orders", async () => {
        const { data, error } = await supabase
          .from("purchase_orders")
          .select(
            "id, order_no, supplier_id, warehouse_id, status, total, expected_at, note, created_at",
          )
          .order("created_at", { ascending: false })
          .limit(200);
        if (error) throw error;
        return data ?? [];
      }),
  });
  const suppliers = useQuery({
    queryKey: ["suppliers-lite"],
    queryFn: () =>
      localFirst("suppliers", async () => {
        const { data, error } = await supabase.from("suppliers").select("id, name").order("name");
        if (error) throw error;
        return data ?? [];
      }),
  });
  const warehouses = useQuery({
    queryKey: ["warehouses"],
    queryFn: () =>
      localFirst("warehouses", async () => {
        const { data, error } = await supabase.from("warehouses").select("id, name").order("name");
        if (error) throw error;
        return data ?? [];
      }),
  });
  const products = useQuery({
    queryKey: ["products-lite"],
    queryFn: () =>
      localFirst("products", async () => {
        const { data, error } = await supabase
          .from("products")
          .select("id, name, cost")
          .eq("is_active", true)
          .order("name");
        if (error) throw error;
        return data ?? [];
      }),
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!profile?.org_id || !profile.id || !warehouseId) throw new Error("missing");
      const validLines = lines
        .filter((line) => line.product_id && Number(line.quantity) > 0)
        .map((line) => ({
          product_id: line.product_id,
          quantity: Number(line.quantity),
          unit_cost: Number(line.unit_cost) || 0,
        }));
      if (!validLines.length) throw new Error("empty");
      const id = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      const orderNo = `PO-${createdAt.slice(0, 10).replaceAll("-", "")}-${Date.now().toString().slice(-5)}`;
      const order = {
        id,
        org_id: profile.org_id,
        supplier_id: supplierId === "none" ? null : supplierId,
        warehouse_id: warehouseId,
        order_no: orderNo,
        status: "ORDERED",
        note: note.trim() || null,
        expected_at: expectedAt ? new Date(`${expectedAt}T12:00:00`).toISOString() : null,
        created_by: profile.id,
      };
      const items = validLines.map((line) => ({
        id: crypto.randomUUID(),
        org_id: profile.org_id as string,
        purchase_order_id: id,
        ...line,
        line_total: line.quantity * line.unit_cost,
      }));
      const saveOffline = async () => {
        await db().purchase_orders.put({
          ...order,
          total: items.reduce((sum, item) => sum + item.line_total, 0),
          created_at: createdAt,
          updated_at: createdAt,
        });
        await db().purchase_order_items.bulkPut(
          items.map((item) => ({ ...item, created_at: createdAt })),
        );
        await enqueue(
          "purchase_order",
          "CREATE",
          { order, items },
          { entity_id: id, idempotency_key: id },
        );
        return true;
      };
      if (!isOnline()) return saveOffline();
      try {
        const { error } = await supabase
          .from("purchase_orders")
          .insert(order)
          .abortSignal(AbortSignal.timeout(REQUEST_TIMEOUT_MS));
        if (error) throw error;
        const { error: itemError } = await supabase.from("purchase_order_items").insert(items);
        if (itemError) throw itemError;
        return false;
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (isNetworkFailure(message)) return saveOffline();
        throw error;
      }
    },
    onSuccess: (offline) => {
      toast.success(offline ? "حُفظ الطلب محليًا وسيُزامن تلقائيًا" : "تم إنشاء طلب الشراء");
      setOpen(false);
      setLines([{ product_id: "", quantity: "1", unit_cost: "0" }]);
      setNote("");
      setExpectedAt("");
      void qc.invalidateQueries({ queryKey: ["purchase-orders"] });
    },
    onError: (error: Error) =>
      toast.error(error.message === "empty" ? "أضف صنفًا واحدًا على الأقل" : "تعذر إنشاء الطلب"),
  });
  const total = lines.reduce(
    (sum, line) => sum + Number(line.quantity || 0) * Number(line.unit_cost || 0),
    0,
  );
  if (!can("purchases.manage"))
    return (
      <div className="p-10 text-center text-muted-foreground">لا تملك صلاحية طلبات الشراء.</div>
    );
  return (
    <div>
      <PageHeader
        title="طلبات الشراء"
        description="أنشئ الطلب، أرسله للمورد، ثم استلمه كفاتورة تزيد المخزون."
      >
        <Button onClick={() => setOpen(true)}>
          <Plus className="size-4" /> طلب جديد
        </Button>
      </PageHeader>
      <div className="p-4 sm:p-6">
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>رقم الطلب</TableHead>
                <TableHead>المورد</TableHead>
                <TableHead>المستودع</TableHead>
                <TableHead>الإجمالي</TableHead>
                <TableHead>التاريخ المتوقع</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(orders.data ?? []).map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-bold">{order.order_no}</TableCell>
                  <TableCell>
                    {suppliers.data?.find((item) => item.id === order.supplier_id)?.name ?? "—"}
                  </TableCell>
                  <TableCell>
                    {warehouses.data?.find((item) => item.id === order.warehouse_id)?.name ?? "—"}
                  </TableCell>
                  <TableCell>{money(order.total, currency)}</TableCell>
                  <TableCell>{order.expected_at ? dateTime(order.expected_at) : "—"}</TableCell>
                  <TableCell>
                    <Badge variant={order.status === "RECEIVED" ? "default" : "secondary"}>
                      {STATUS[order.status] ?? order.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {order.status !== "RECEIVED" && order.status !== "CANCELLED" && (
                      <Button asChild size="sm" variant="outline">
                        <Link to="/purchases">
                          <PackageCheck className="size-4" /> استلام
                        </Link>
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!orders.data?.length && (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                    لا توجد طلبات شراء بعد.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>طلب شراء جديد</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>المورد</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون مورد</SelectItem>
                  {(suppliers.data ?? []).map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>المستودع</Label>
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر" />
                </SelectTrigger>
                <SelectContent>
                  {(warehouses.data ?? []).map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="po-date">التاريخ المتوقع</Label>
              <Input
                id="po-date"
                type="date"
                value={expectedAt}
                onChange={(event) => setExpectedAt(event.target.value)}
              />
            </div>
          </div>
          <div className="space-y-3">
            {lines.map((line, index) => (
              <div key={index} className="grid grid-cols-12 items-end gap-2">
                <div className="col-span-6 space-y-1">
                  <Label>المنتج</Label>
                  <Select
                    value={line.product_id}
                    onValueChange={(value) => {
                      const product = products.data?.find((item) => item.id === value);
                      setLines(
                        lines.map((item, itemIndex) =>
                          itemIndex === index
                            ? {
                                ...item,
                                product_id: value,
                                unit_cost: String(product?.cost ?? item.unit_cost),
                              }
                            : item,
                        ),
                      );
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="اختر منتجًا" />
                    </SelectTrigger>
                    <SelectContent>
                      {(products.data ?? []).map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 space-y-1">
                  <Label>الكمية</Label>
                  <Input
                    type="number"
                    value={line.quantity}
                    onChange={(event) =>
                      setLines(
                        lines.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, quantity: event.target.value } : item,
                        ),
                      )
                    }
                  />
                </div>
                <div className="col-span-3 space-y-1">
                  <Label>التكلفة</Label>
                  <Input
                    type="number"
                    value={line.unit_cost}
                    onChange={(event) =>
                      setLines(
                        lines.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, unit_cost: event.target.value } : item,
                        ),
                      )
                    }
                  />
                </div>
                <Button
                  className="col-span-1"
                  size="icon"
                  variant="ghost"
                  aria-label="حذف الصنف"
                  onClick={() => setLines(lines.filter((_, itemIndex) => itemIndex !== index))}
                >
                  <X className="size-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setLines([...lines, { product_id: "", quantity: "1", unit_cost: "0" }])
              }
            >
              <Plus className="size-4" /> صنف آخر
            </Button>
          </div>
          <div className="space-y-2">
            <Label htmlFor="po-note">ملاحظات</Label>
            <Input id="po-note" value={note} onChange={(event) => setNote(event.target.value)} />
          </div>
          <div className="flex justify-between rounded-xl bg-secondary p-4 text-lg font-black">
            <span>إجمالي الطلب</span>
            <span>{money(total, currency)}</span>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
            <Button disabled={save.isPending || !warehouseId} onClick={() => save.mutate()}>
              إنشاء وإرسال الطلب
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
