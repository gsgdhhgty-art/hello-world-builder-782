import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getPwaState, installPwa, subscribePwaState, type PwaState } from "@/lib/pwa";

export function PwaInstallControl() {
  const [state, setState] = useState<PwaState>(getPwaState);
  const [instructionsOpen, setInstructionsOpen] = useState(false);

  useEffect(() => subscribePwaState(setState), []);

  if (state.installed) return null;

  async function handleInstall() {
    if (state.canInstall) {
      await installPwa();
      return;
    }
    setInstructionsOpen(true);
  }

  return (
    <>
      <Button
        variant="ghost"
        aria-label="تثبيت التطبيق"
        title="تثبيت التطبيق"
        className="gap-2 px-2 sm:px-3"
        onClick={() => void handleInstall()}
      >
        <Download className="size-5" />
        <span className="hidden sm:inline">تثبيت التطبيق</span>
      </Button>
      <Dialog open={instructionsOpen} onOpenChange={setInstructionsOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>تثبيت SmartPOS على جهازك</DialogTitle>
            <DialogDescription>
              هذا المتصفح لا يوفّر نافذة تثبيت تلقائية. افتح قائمة المتصفح ثم اختر «إضافة إلى الشاشة
              الرئيسية» أو «تثبيت التطبيق». سيظهر SmartPOS كتطبيق مستقل دون الحاجة إلى ملف APK.
            </DialogDescription>
          </DialogHeader>
          <Button variant="outline" onClick={() => setInstructionsOpen(false)}>
            فهمت
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
