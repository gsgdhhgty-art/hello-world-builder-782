import { useEffect, useRef } from "react";

type Options = {
  /** Called with a complete scanned code. */
  onScan: (code: string) => void;
  /** Minimum characters accepted as a barcode. */
  minLength?: number;
  /** Maximum gap (ms) between keystrokes of the same scan. */
  maxKeyGapMs?: number;
  /** Ignore the same code if re-scanned within this window (ms). */
  dedupeMs?: number;
  /** Input the scanner may be focused in (e.g. the POS search box). */
  allowedTarget?: React.RefObject<HTMLInputElement | null>;
  enabled?: boolean;
};

/**
 * Hardware barcode reader support (USB / Bluetooth keyboard-wedge scanners).
 * Buffers fast keystrokes, accepts Enter or Tab as terminator, and keeps
 * working while the cashier's search box holds the focus.
 */
export function useBarcodeScanner({
  onScan,
  minLength = 4,
  maxKeyGapMs = 300,
  dedupeMs = 800,
  allowedTarget,
  enabled = true,
}: Options) {
  const handler = useRef(onScan);
  handler.current = onScan;

  useEffect(() => {
    if (!enabled) return;
    let buffer = "";
    let lastKeyAt = 0;
    let lastCode = "";
    let lastCodeAt = 0;

    const flush = (raw: string) => {
      const code = raw.trim();
      buffer = "";
      if (code.length < minLength) return false;
      const now = Date.now();
      if (code === lastCode && now - lastCodeAt < dedupeMs) return true;
      lastCode = code;
      lastCodeAt = now;
      handler.current(code);
      return true;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const editable =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable);
      const allowed = allowedTarget?.current && target === allowedTarget.current;
      if (editable && !allowed) {
        buffer = "";
        return;
      }

      const now = Date.now();
      if (event.key === "Enter" || event.key === "Tab") {
        const pending = buffer;
        const fast = now - lastKeyAt <= maxKeyGapMs;
        buffer = "";
        if (fast && flush(pending)) event.preventDefault();
        return;
      }
      if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return;
      if (now - lastKeyAt > maxKeyGapMs) buffer = "";
      buffer += event.key;
      lastKeyAt = now;
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [enabled, minLength, maxKeyGapMs, dedupeMs, allowedTarget]);
}
