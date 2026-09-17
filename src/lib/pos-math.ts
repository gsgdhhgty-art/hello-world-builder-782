/**
 * Client-side preview of invoice totals.
 * The authoritative calculation lives in the database function create_sale();
 * this only renders an estimate while the cashier builds the cart.
 */
export interface CartLineInput {
  price: number;
  quantity: number;
  discount: number;
}

export interface CartTotals {
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateCartTotals(lines: CartLineInput[], taxRate: number): CartTotals {
  let subtotal = 0;
  let discount = 0;
  for (const line of lines) {
    const gross = line.price * line.quantity;
    subtotal += gross;
    discount += Math.min(Math.max(line.discount, 0), gross);
  }
  const net = subtotal - discount;
  const tax = round2((net * taxRate) / 100);
  return {
    subtotal: round2(subtotal),
    discount: round2(discount),
    tax,
    total: round2(net + tax),
  };
}
