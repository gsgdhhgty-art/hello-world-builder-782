/**
 * Per-device cashier hardware: silent receipt printing and ESC/POS cash drawer.
 * Settings live on the device (each till has its own printer), not in the org.
 */
export interface HardwareSettings {
  /** Print automatically after each sale. */
  autoPrint: boolean;
  paper: "58" | "80";
  /** OS printer name for silent printing (desktop app). Empty = default printer. */
  printerName: string;
  /** Network ESC/POS printer (usually port 9100) used to kick the cash drawer. */
  drawerHost: string;
  drawerPort: number;
  /** Open the drawer automatically when a sale includes cash. */
  openDrawerOnCash: boolean;
}

interface NativeBridge {
  printHtml(html: string, deviceName?: string): Promise<{ ok: boolean; error?: string }>;
  listPrinters(): Promise<Array<{ name: string; isDefault: boolean }>>;
  sendRaw(host: string, port: number, bytes: number[]): Promise<{ ok: boolean; error?: string }>;
}

const KEY = "smartpos_hardware";
export const DEFAULT_HARDWARE: HardwareSettings = {
  autoPrint: false,
  paper: "80",
  printerName: "",
  drawerHost: "",
  drawerPort: 9100,
  openDrawerOnCash: false,
};

/** ESC p m t1 t2 — pulse drawer pin 2 (standard across Epson/Xprinter/Rongta). */
export const DRAWER_KICK = [0x1b, 0x70, 0x00, 0x19, 0xfa];

export function nativeBridge(): NativeBridge | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { smartposNative?: NativeBridge }).smartposNative ?? null;
}

export function loadHardware(): HardwareSettings {
  if (typeof localStorage === "undefined") return DEFAULT_HARDWARE;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT_HARDWARE, ...(JSON.parse(raw) as Partial<HardwareSettings>) } : DEFAULT_HARDWARE;
  } catch {
    return DEFAULT_HARDWARE;
  }
}

export function saveHardware(s: HardwareSettings) {
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function isValidHost(host: string) {
  return /^(\d{1,3}\.){3}\d{1,3}$|^[a-z0-9.-]+$/i.test(host.trim());
}

export async function openCashDrawer(s = loadHardware()): Promise<{ ok: boolean; error?: string }> {
  const bridge = nativeBridge();
  if (!bridge) return { ok: false, error: "فتح الدرج متاح في تطبيق سطح المكتب فقط" };
  if (!s.drawerHost || !isValidHost(s.drawerHost)) return { ok: false, error: "أدخل عنوان IP لطابعة الدرج" };
  return bridge.sendRaw(s.drawerHost.trim(), s.drawerPort || 9100, DRAWER_KICK);
}

/** Silent print in the desktop app; returns false when the browser print window must be used. */
export async function printSilently(html: string, s = loadHardware()) {
  const bridge = nativeBridge();
  if (!bridge) return false;
  const res = await bridge.printHtml(html.replace(/<script>[\s\S]*?<\/script>/g, ""), s.printerName || undefined);
  if (!res.ok) throw new Error(res.error || "تعذرت الطباعة");
  return true;
}
