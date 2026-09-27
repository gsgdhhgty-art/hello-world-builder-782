/** Same-device channel between the till and the customer-facing screen. */
export const DISPLAY_CHANNEL = "smartpos-customer-display";

export interface DisplayState {
  store: string;
  currency: string;
  lines: Array<{ name: string; quantity: number; total: number }>;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  /** Set right after checkout so the customer sees the paid/change summary. */
  done?: { paid: number; change: number } | null;
}

export function openDisplayChannel() {
  if (typeof BroadcastChannel === "undefined") return null;
  return new BroadcastChannel(DISPLAY_CHANNEL);
}
