export interface CheckoutProduct {
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
  sold_by_weight?: boolean;
}

export interface CheckoutCatalogProps {
  products: CheckoutProduct[];
  stock: Record<string, number>;
  currency: string;
  favorites: string[];
  alertDays: number;
  blockExpired: boolean;
  onAdd: (product: CheckoutProduct) => void;
  onFavorite: (id: string) => void;
}