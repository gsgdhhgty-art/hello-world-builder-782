import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Camera barcode scanning for tablets and phones (native BarcodeDetector). */
export function CameraScanner({
  open,
  onOpenChange,
  onDetected,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDetected: (code: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    async function start() {
      const Detector = (globalThis as any).BarcodeDetector;
      if (!Detector) {
        setError(
          "الكاميرا لا تدعم قراءة الباركود على هذا الجهاز. استخدم الماسح أو أدخل الرقم يدويًا.",
        );
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (cancelled) return;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        const detector = new Detector();
        timer = setInterval(async () => {
          if (!videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            const raw = codes?.[0]?.rawValue;
            if (raw) {
              onDetected(String(raw));
              onOpenChange(false);
            }
          } catch {
            /* frame not readable yet */
          }
        }, 400);
      } catch {
        setError("تعذر الوصول إلى الكاميرا. تأكد من منح الإذن.");
      }
    }

    void start();
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open, onDetected, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>المسح بالكاميرا</DialogTitle>
        </DialogHeader>
        {error ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{error}</p>
        ) : (
          <video ref={videoRef} className="w-full rounded-lg bg-black" muted playsInline />
        )}
      </DialogContent>
    </Dialog>
  );
}
