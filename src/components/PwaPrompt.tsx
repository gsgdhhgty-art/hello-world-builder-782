import { useEffect, useState } from "react";
import { Download, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  applyPwaUpdate,
  getPwaState,
  installPwa,
  subscribePwaState,
  type PwaState,
} from "@/lib/pwa";

export function PwaPrompt() {
  const [state, setState] = useState<PwaState>(getPwaState);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => subscribePwaState(setState), []);

  if (dismissed || (!state.canInstall && !state.updateReady)) return null;

  const isUpdate = state.updateReady;
  return (
    <aside
      className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-md items-center gap-3 rounded-lg border bg-card p-3 text-card-foreground shadow-lg"
      aria-live="polite"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
        {isUpdate ? <RefreshCw className="size-5" /> : <Download className="size-5" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold">
          {isUpdate ? "يتوفر تحديث جديد" : "ثبّت SmartPOS على جهازك"}
        </p>
        <p className="text-xs text-muted-foreground">
          {isUpdate ? "حدّث الملفات بأمان للحصول على أحدث نسخة." : "افتحه كتطبيق مستقل للعمل بسرعة."}
        </p>
      </div>
      <Button
        size="sm"
        disabled={state.updating}
        onClick={() => void (isUpdate ? applyPwaUpdate() : installPwa())}
      >
        {state.updating ? "جارٍ التحديث" : isUpdate ? "تحديث الآن" : "تثبيت"}
      </Button>
      <Button variant="ghost" size="icon" aria-label="إغلاق" onClick={() => setDismissed(true)}>
        <X className="size-4" />
      </Button>
    </aside>
  );
}