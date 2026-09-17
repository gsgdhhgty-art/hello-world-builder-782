import { AlertTriangle, Cloud, CloudOff, RefreshCw } from "lucide-react";
import { useOffline } from "@/hooks/useOffline";
import { cn } from "@/lib/utils";

export function SyncBadge({ className }: { className?: string }) {
  const { online, pending, conflicts, syncing, sync } = useOffline();

  return (
    <button
      type="button"
      onClick={() => void sync()}
      title={online ? "متصل — اضغط للمزامنة الآن" : "تعمل بدون إنترنت، وسيتم رفع البيانات تلقائيًا"}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors",
        online ? "bg-sidebar-accent/60" : "bg-destructive/15 text-destructive",
        className,
      )}
    >
      {syncing ? (
        <RefreshCw className="size-4 animate-spin" />
      ) : online ? (
        <Cloud className="size-4" />
      ) : (
        <CloudOff className="size-4" />
      )}
      <span className="truncate">
        {online ? (pending > 0 ? `مزامنة ${pending} عملية` : "متصل ومتزامن") : "بدون إنترنت"}
      </span>
      {conflicts > 0 && (
        <span className="ms-auto flex items-center gap-1 text-amber-500">
          <AlertTriangle className="size-3.5" />
          {conflicts}
        </span>
      )}
    </button>
  );
}
