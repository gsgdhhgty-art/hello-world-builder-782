import type { CheckoutProduct } from "../shared/catalog";
import { expiryState } from "@/lib/scale-barcode";

export type SupermarketFilter = "all" | "weight" | "soon" | "available";

export function matchesSupermarketFilter(
  product: CheckoutProduct,
  filter: SupermarketFilter,
  stock: number,
  alertDays: number,
  now = new Date(),
): boolean {
  switch (filter) {
    case "weight": return product.sold_by_weight === true;
    case "soon": return expiryState(product.expires_at, alertDays, now) === "soon";
    case "available": return !product.track_stock || stock > 0;
    default: return true;
  }
}