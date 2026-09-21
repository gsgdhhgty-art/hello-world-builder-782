import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Camera barcode scanning for tablets and phones, with a Safari-compatible fallback. */
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
    let controls: IScannerControls | null = null;
    let cancelled = false;

    async function start() {
      const Detector = (globalThis as any).BarcodeDetector;
      if (!Detector) {
        try {
          if (!videoRef.current) return;
          const reader = new BrowserMultiFormatReader();
          controls = await reader.decodeFromConstraints(
            { video: { facingMode: { ideal: "environment" } } },
            videoRef.current,
            (result) => {
              if (!result || cancelled) return;
              onDetected(result.getText());
              onOpenChange(false);
            },
          );
        } catch {
          setError("تعذر تشغيل ماسح الكاميرا. استخدم قارئ USB أو أدخل الباركود يدويًا.");
        }
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
      controls?.stop();
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
          <div className="overflow-hidden rounded-lg bg-foreground">
            <video ref={videoRef} className="aspect-[4/3] w-full object-cover" muted playsInline />
            <p className="bg-foreground px-3 py-2 text-center text-xs text-background">
              وجّه الكاميرا نحو الباركود حتى يظهر كاملًا داخل الإطار
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
