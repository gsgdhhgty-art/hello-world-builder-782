import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, CalendarClock, PackageX, Scale, TrendingUp, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { dateTime, money, num } from "@/lib/format";
import { expiryBucket } from "@/lib/kitchen";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface ProductStock {
  id: string;
  name: string;
  price: number;
  cost: number;
  expires_at: string | null;
  sold_by_weight: boolean;
  reorder_level: number;
  unit: string;
  qty: number;
}

function useProductStock() {
  const { org } = useAuth();
  return useQuery({
    queryKey: ["industry-product-stock", org?.id],
    enabled: Boolean(org?.id),
    queryFn: async (): Promise<ProductStock[]> => {
      const [{ data: products, error }, { data: inv, error: invErr }] = await Promise.all([
        supabase
          .from("products")
          .select("id, name, price, cost, expires_at, sold_by_weight, reorder_level, unit, track_stock")
          .eq("is_active", true)
          .limit(2000),
        supabase.from("inventory").select("product_id, quantity").limit(5000),
      ]);
      if (error) throw error;
      if (invErr) throw invErr;
      const qty = new Map<string, number>();
      for (const r of inv ?? []) qty.set(r.product_id, (qty.get(r.product_id) ?? 0) + Number(r.quantity));
      return (products ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        price: Number(p.price),
        cost: Number(p.cost),
        expires_at: p.expires_at,
        sold_by_weight: p.sold_by_weight,
        reorder_level: Number(p.reorder_level),
        unit: p.unit,
        qty: qty.get(p.id) ?? 0,
      }));
    },
  });
}

function useTopSellers(days: number) {
  const { org } = useAuth();
  return useQuery({
    queryKey: ["industry-top-sellers", org?.id, days],
    enabled: Boolean(org?.id),
    queryFn: async () => {
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const { data, error } = await supabase
        .from("sale_items")
        .select("product_id, product_name, quantity, line_total, sales!inner(status)")
        .gte("created_at", since)
        .eq("sales.status", "COMPLETED")
        .limit(5000);
      if (error) throw error;
      const m = new Map<string, { name: string; qty: number; total: number }>();
      for (const r of data ?? []) {
        if (!r.product_id) continue;
        const cur = m.get(r.product_id) ?? { name: r.product_name, qty: 0, total: 0 };
        cur.qty += Number(r.quantity);
        cur.total += Number(r.line_total);
        m.set(r.product_id, cur);
      }
      return [...m.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.total - a.total);
    },
  });
}

function Kpi({ icon: Icon, label, value, tone }: { icon: typeof Wallet; label: string; value: string; tone: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
      <span className={`grid size-10 place-items-center rounded-lg ${tone}`}>
        <Icon className="size-5" />
      </span>
      <div>
        <p className="text-xs font-semibold text-muted-foreground">{label}</p>
        <p className="text-xl font-black">{value}</p>
      </div>
    </div>
  );
}

function LowStockList({ items, currency }: { items: ProductStock[]; currency: string }) {
  const low = items.filter((p) => p.reorder_level > 0 && p.qty <= p.reorder_level).sort((a, b) => a.qty - b.qty);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <PackageX className="size-5 text-destructive" /> يحتاج إعادة طلب ({low.length})
        </CardTitle>
        <Button asChild size="sm" variant="outline">
          <Link to="/purchase-orders">طلب شراء</Link>
        </Button>
      </CardHeader>
      <CardContent className="max-h-80 space-y-1 overflow-y-auto">
        {low.length === 0 && <p className="text-sm text-muted-foreground">كل الأصناف فوق حد الطلب.</p>}
        {low.slice(0, 40).map((p) => (
          <div key={p.id} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm odd:bg-muted/50">
            <span className="font-semibold">{p.name}</span>
            <span className="text-xs">
              <b className={p.qty <= 0 ? "text-destructive" : "text-warning-foreground"}>{num(p.qty)}</b> / حد {num(p.reorder_level)} — {money(p.price, currency)}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function TopSellers({ currency }: { currency: string }) {
  const top = useTopSellers(30);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="size-5 text-industry" /> الأكثر مبيعًا آخر 30 يومًا
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {(top.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">لا توجد مبيعات في الفترة.</p>}
        {(top.data ?? []).slice(0, 10).map((r, i) => {
          const max = top.data?.[0]?.total || 1;
          return (
            <div key={r.id}>
              <div className="flex justify-between text-sm">
                <span className="font-semibold">
                  {i + 1}. {r.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {num(r.qty)} — {money(r.total, currency)}
                </span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-muted">
                <div className="h-1.5 rounded-full bg-industry" style={{ width: `${Math.max(4, (r.total / max) * 100)}%` }} />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

const BUCKET_LABEL = { expired: "منتهي", d30: "خلال 30 يومًا", d90: "خلال 90 يومًا" } as const;
const BUCKET_TONE = {
  expired: "bg-destructive text-destructive-foreground",
  d30: "bg-warning text-warning-foreground",
  d90: "bg-info text-info-foreground",
} as const;

function ExpiryList({ items, currency }: { items: ProductStock[]; currency: string }) {
  const rows = items
    .map((p) => ({ p, b: expiryBucket(p.expires_at) }))
    .filter((r): r is { p: ProductStock; b: "expired" | "d30" | "d90" } => r.b === "expired" || r.b === "d30" || r.b === "d90")
    .sort((a, b) => (a.p.expires_at ?? "").localeCompare(b.p.expires_at ?? ""));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="size-5 text-industry" /> لوحة الصلاحية ({rows.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="max-h-96 space-y-1 overflow-y-auto">
        {rows.length === 0 && <p className="text-sm text-muted-foreground">لا توجد أصناف تنتهي خلال 90 يومًا. أدخل تواريخ الصلاحية من صفحة المنتجات.</p>}
        {rows.map(({ p, b }) => (
          <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm odd:bg-muted/50">
            <span className="font-semibold">{p.name}</span>
            <span className="flex items-center gap-2 text-xs">
              <span>{p.expires_at}</span>
              <span>كمية {num(p.qty)}</span>
              <span className="text-muted-foreground">{money(p.qty * p.cost, currency)}</span>
              <Badge className={BUCKET_TONE[b]}>{BUCKET_LABEL[b]}</Badge>
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/** Pharmacy / cosmetics: expiry-first board. */
export function ExpiryBoard() {
  const { org } = useAuth();
  const currency = org?.currency ?? "EGP";
  const stock = useProductStock();
  const items = stock.data ?? [];
  const expired = items.filter((p) => expiryBucket(p.expires_at) === "expired");
  const soon = items.filter((p) => expiryBucket(p.expires_at) === "d30");
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-4">
        <Kpi icon={AlertTriangle} label="أصناف منتهية" value={String(expired.length)} tone="bg-destructive/15 text-destructive" />
        <Kpi icon={CalendarClock} label="تنتهي خلال 30 يومًا" value={String(soon.length)} tone="bg-warning/20 text-warning-foreground" />
        <Kpi icon={Wallet} label="تكلفة المعرّض للانتهاء" value={money([...expired, ...soon].reduce((s, p) => s + p.qty * p.cost, 0), currency)} tone="bg-industry/15 text-industry" />
        <Kpi icon={PackageX} label="بيع المنتهي" value={org?.block_expired_sales ? "ممنوع" : "مسموح"} tone="bg-info/15 text-info" />
      </div>
      <ExpiryList items={items} currency={currency} />
      <div className="grid gap-6 lg:grid-cols-2">
        <LowStockList items={items} currency={currency} />
        <TopSellers currency={currency} />
      </div>
    </div>
  );
}

/** Supermarket: fresh/weighted goods + expiry + replenishment. */
export function FreshBoard() {
  const { org } = useAuth();
  const currency = org?.currency ?? "EGP";
  const stock = useProductStock();
  const items = stock.data ?? [];
  const weighed = items.filter((p) => p.sold_by_weight);
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-4">
        <Kpi icon={Scale} label="أصناف بالوزن" value={String(weighed.length)} tone="bg-industry/15 text-industry" />
        <Kpi icon={Scale} label="باركود الميزان" value={org?.scale_barcode_enabled ? `مفعل (${org.scale_barcode_prefix})` : "غير مفعل"} tone="bg-info/15 text-info" />
        <Kpi icon={PackageX} label="تحت حد الطلب" value={String(items.filter((p) => p.reorder_level > 0 && p.qty <= p.reorder_level).length)} tone="bg-destructive/15 text-destructive" />
        <Kpi icon={Wallet} label="قيمة المخزون بالتكلفة" value={money(items.reduce((s, p) => s + Math.max(0, p.qty) * p.cost, 0), currency)} tone="bg-success/15 text-success" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <LowStockList items={items} currency={currency} />
        <ExpiryList items={items} currency={currency} />
      </div>
      <TopSellers currency={currency} />
    </div>
  );
}

/** Specialty retail (fashion, electronics, books, home, auto parts). */
export function CatalogBoard() {
  const { org } = useAuth();
  const currency = org?.currency ?? "EGP";
  const stock = useProductStock();
  const items = stock.data ?? [];
  const value = items.reduce((s, p) => s + Math.max(0, p.qty) * p.cost, 0);
  const retail = items.reduce((s, p) => s + Math.max(0, p.qty) * p.price, 0);
  const top = useTopSellers(60);
  const sold = new Set((top.data ?? []).map((r) => r.id));
  const dead = items.filter((p) => p.qty > 0 && !sold.has(p.id)).sort((a, b) => b.qty * b.cost - a.qty * a.cost);
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-4">
        <Kpi icon={Wallet} label="المخزون بالتكلفة" value={money(value, currency)} tone="bg-industry/15 text-industry" />
        <Kpi icon={TrendingUp} label="المخزون بسعر البيع" value={money(retail, currency)} tone="bg-success/15 text-success" />
        <Kpi icon={PackageX} label="تحت حد الطلب" value={String(items.filter((p) => p.reorder_level > 0 && p.qty <= p.reorder_level).length)} tone="bg-destructive/15 text-destructive" />
        <Kpi icon={AlertTriangle} label="راكد 60 يومًا" value={String(dead.length)} tone="bg-warning/20 text-warning-foreground" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <TopSellers currency={currency} />
        <LowStockList items={items} currency={currency} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">أصناف راكدة (لم تُبع منذ 60 يومًا) — {dateTime(new Date().toISOString())}</CardTitle>
        </CardHeader>
        <CardContent className="max-h-72 space-y-1 overflow-y-auto">
          {dead.length === 0 && <p className="text-sm text-muted-foreground">لا توجد أصناف راكدة.</p>}
          {dead.slice(0, 40).map((p) => (
            <div key={p.id} className="flex justify-between rounded-lg px-2 py-1.5 text-sm odd:bg-muted/50">
              <span className="font-semibold">{p.name}</span>
              <span className="text-xs text-muted-foreground">
                {num(p.qty)} {p.unit} — {money(p.qty * p.cost, currency)}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
