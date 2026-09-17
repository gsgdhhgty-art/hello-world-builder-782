/**
 * تسجيل مُحرّس لخدمة العمل بدون إنترنت.
 * لا يُسجّل في التطوير ولا داخل معاينة Lovable (إطار مضمّن) لتفادي التعارض مع أدوات المعاينة.
 */
export function registerOfflineSupport(): void {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  if (import.meta.env.DEV) return;
  const host = window.location.hostname;
  const inPreview = window.self !== window.top || host.includes("id-preview--");
  if (inPreview) return;

  void navigator.serviceWorker.register("/sw.js").catch(() => {
    /* لا شيء: التطبيق يعمل عاديًا بدون التخزين المحلي للملفات */
  });
}
