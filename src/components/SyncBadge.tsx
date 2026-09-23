import { AlertTriangle, Cloud, CloudOff, RefreshCw } from "lucide-react";
import { useOffline } from "@/hooks/useOffline";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function SyncBadge({ className }: { className?: string }) {
  const { online, pending, conflicts, syncing, sync } = useOffline();

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={() => void sync()}
      title={online ? "متصل — اضغط للمزامنة الآن" : "تعمل بدون إنترنت، وسيتم رفع البيانات تلقائيًا"}
      className={cn(
        "press flex h-9 items-center gap-2 rounded-md px-3 text-xs font-semibold transition-colors",
        online
          ? "bg-sidebar-accent/60 text-inherit"
          : "bg-destructive/15 text-destructive ring-1 ring-destructive/25",
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
    </Button>
  );
}
