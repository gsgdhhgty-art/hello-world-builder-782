import { useState } from "react";
import { AlertTriangle, Package, Scale, ScanBarcode, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { money, num } from "@/lib/format";
import { expiryState } from "@/lib/scale-barcode";
import { cn } from "@/lib/utils";
import type { CheckoutCatalogProps } from "../shared/catalog";
import { matchesSupermarketFilter, type SupermarketFilter } from "./rules";

export function SupermarketCheckoutCatalog(props: CheckoutCatalogProps) {
  const [filter, setFilter] = useState<SupermarketFilter>("all");
  const products = props.products.filter(p => matchesSupermarketFilter(p, filter, props.stock[p.id] ?? 0, props.alertDays));
  return <>
    <div className="flex flex-wrap items-center gap-2 border-b bg-card px-3 py-2">
      <h1 className="me-auto flex items-center gap-2 text-sm font-bold"><ScanBarcode className="size-4 text-primary" /> بيع السوبر ماركت</h1>
      {([
        ["all", "جميع الأصناف"], ["weight", "بالوزن"], ["soon", "قريبة الانتهاء"], ["available", "المتوفر"],
      ] as const).map(([value, label]) => <Button key={value} size="sm" variant={filter === value ? "default" : "ghost"} onClick={() => setFilter(value)}>{value === "weight" && <Scale className="size-4" />}{label}</Button>)}
    </div>
    <div className="grid flex-1 auto-rows-min grid-cols-2 gap-2 overflow-y-auto p-3 min-[480px]:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 scroll-slim">
      {products.map(p => {
        const quantity = props.stock[p.id] ?? 0;
        const expiry = expiryState(p.expires_at, props.alertDays);
        const blocked = expiry === "expired" && props.blockExpired;
        return <article key={p.id} className="relative flex min-w-0 flex-col overflow-hidden rounded-lg border bg-card">
          <Button variant="ghost" disabled={blocked} onClick={() => props.onAdd(p)} aria-label={`إضافة ${p.name}`} className="group h-auto min-h-44 w-full flex-1 flex-col items-stretch justify-start gap-2 whitespace-normal rounded-none p-3 text-start hover:bg-accent/40">
            <div className="grid h-20 w-full place-items-center">
              {p.image_url ? <img src={p.image_url} alt="" loading="lazy" width={120} height={80} className="h-20 w-full object-contain" /> : p.sold_by_weight ? <Scale className="size-8 text-primary/60" /> : <Package className="size-8 text-muted-foreground/50" />}
            </div>
            <span className="line-clamp-2 min-h-10 text-sm font-semibold">{p.name}</span>
            <span className="text-base font-black">{money(p.price, props.currency)}<span className="ms-1 text-xs font-normal text-muted-foreground">/ {p.unit}</span></span>
            <span className={cn("text-xs", p.track_stock && quantity <= 0 ? "text-destructive" : "text-muted-foreground")}>{p.track_stock ? `${num(quantity)} ${p.unit} بالمخزون` : "غير متتبع المخزون"}</span>
            {p.barcode && <span dir="ltr" className="truncate text-xs text-muted-foreground">{p.barcode}</span>}
            {expiry === "soon" || expiry === "expired" ? <span className={cn("flex items-center gap-1 text-xs", expiry === "expired" ? "text-destructive" : "text-warning")}><AlertTriangle className="size-3 shrink-0" />{expiry === "expired" ? "منتهي الصلاحية" : "قريب الانتهاء"} · {p.expires_at}</span> : null}
          </Button>
          <Button variant="ghost" size="icon" onClick={() => props.onFavorite(p.id)} aria-label={`تفضيل ${p.name}`} title="المفضلة" className="absolute end-1 top-1 size-8 bg-card/90"><Star className={cn("size-4", props.favorites.includes(p.id) ? "fill-warning text-warning" : "text-muted-foreground")} /></Button>
        </article>;
      })}
      {!products.length && <p className="col-span-full py-12 text-center text-sm text-muted-foreground">لا توجد أصناف تطابق هذا الاختيار.</p>}
    </div>
  </>;
}