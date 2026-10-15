/** Build-time flag: the standalone cashier app (VITE_APP_MODE=cashier) only exposes the till and shifts. */
export const CASHIER_APP = import.meta.env.VITE_APP_MODE === "cashier";
export const CASHIER_APP_PATHS = ["/pos", "/shifts"] as const;

export function allowedInCashierApp(path: string): boolean {
  return (CASHIER_APP_PATHS as readonly string[]).includes(path);
}
