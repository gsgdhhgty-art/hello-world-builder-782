import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CloudDownload, CloudOff, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { db, hasLocalDb, type SyncOp } from "@/lib/offline/db";
import { isOnline, lastPullAt, processQueue, pullAll } from "@/lib/offline/sync";
import { useOffline } from "@/hooks/useOffline";
import { dateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/sync")({
  head: () => ({
    meta: [
      { title: "المزامنة — SmartPOS" },
      {
        name: "description",
        content: "المعاملات المعلقة، المزامنة اليدوية، وحل التعارضات بين الجهاز والسحابة.",
      },
      { property: "og:title", content: "المزامنة — SmartPOS" },
      { property: "og:description", content: "إدارة قائمة انتظار المزامنة والتعارضات." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SyncPage,
});

const ENTITY_LABELS: Record<string, string> = {
  sale: "فاتورة بيع",
  customer: "عميل",
  expense: "مصروف",
  shift_open: "فتح وردية",
  shift_close: "إغلاق وردية",
  return: "مرتجع",
  purchase: "فاتورة مشتريات",
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: "بانتظار الرفع",
  SYNCING: "جارٍ الرفع",
  FAILED: "فشل — إعادة محاولة",
  CONFLICT: "تعارض يحتاج مراجعة",
  SYNCED: "تم",
};

function SyncPage() {
  const qc = useQueryClient();
  const { online } = useOffline();

  const queueQuery = useQuery({
    queryKey: ["sync-queue"],
    queryFn: async (): Promise<SyncOp[]> =>
      hasLocalDb() ? db().sync_queue.orderBy("created_at").toArray() : [],
    refetchInterval: 5000,
  });

  const pullQuery = useQuery({
    queryKey: ["last-pull"],
    queryFn: () => lastPullAt().then((v) => v ?? null),
    refetchInterval: 10000,
  });

  const pushNow = useMutation({
    mutationFn: async () => {
      if (!isOnline()) throw new Error("offline");
      const before = (await db().sync_queue.toArray()).length;
      await processQueue();
      const after = (await db().sync_queue.toArray()).length;
      return before - after;
    },
    onSuccess: (done) => {
      toast.success(done > 0 ? `تمت مزامنة ${done} معاملة` : "لا توجد معاملات جاهزة للرفع");
      void qc.invalidateQueries({ queryKey: ["sync-queue"] });
    },
    onError: () => toast.error("تعذرت المزامنة — لا يوجد اتصال بالإنترنت"),
  });

  const pullNow = useMutation({
    mutationFn: async () => {
      if (!isOnline()) throw new Error("offline");
      await pullAll();
    },
    onSuccess: () => {
      toast.success("تم تنزيل أحدث البيانات من السحابة");
      void qc.invalidateQueries();
    },
    onError: () => toast.error("تعذر التنزيل — لا يوجد اتصال بالإنترنت"),
  });

  const retryOp = useMutation({
    mutationFn: async (op: SyncOp) => {
      await db().sync_queue.update(op.id, {
        status: "PENDING",
        retry_count: 0,
        last_error: null,
        next_attempt_at: new Date().toISOString(),
      });
      await processQueue();
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["sync-queue"] });
      toast.success("تمت إعادة المحاولة");
    },
  });

  const dropOp = useMutation({
    mutationFn: async (op: SyncOp) => {
      await db().sync_queue.delete(op.id);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["sync-queue"] });
      toast.success("تم استبعاد المعاملة من قائمة المزامنة");
    },
  });

  const ops = queueQuery.data ?? [];
  const conflicts = ops.filter((o) => o.status === "CONFLICT");
  const pending = ops.filter((o) => o.status !== "CONFLICT");

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 sm:flex sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-black">المزامنة</h1>
          <p className="text-sm text-muted-foreground">
            {online ? "متصل" : "بدون إنترنت"} · آخر تنزيل: {dateTime(pullQuery.data)}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={!online || pullNow.isPending}
            onClick={() => pullNow.mutate()}
          >
            <CloudDownload className="size-4" /> تنزيل من السحابة
          </Button>
          <Button disabled={!online || pushNow.isPending} onClick={() => pushNow.mutate()}>
            <RefreshCw className={pushNow.isPending ? "size-4 animate-spin" : "size-4"} /> مزامنة
            الآن
          </Button>
        </div>
      </header>

      {!online && (
        <div className="flex items-center gap-2 rounded-xl bg-destructive/10 p-3 text-sm font-semibold text-destructive">
          <CloudOff className="size-4" /> لا يوجد اتصال — كل المعاملات محفوظة على الجهاز وسترسل
          تلقائيًا.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            المعاملات المعلقة <Badge variant="secondary">{pending.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {pending.map((op) => (
            <OpRow key={op.id} op={op} onRetry={() => retryOp.mutate(op)} />
          ))}
          {!pending.length && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              لا توجد معاملات معلقة — كل شيء متزامن.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-amber-500" /> التعارضات
            <Badge variant="secondary">{conflicts.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {conflicts.map((op) => (
            <div key={op.id} className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
              <OpRow op={op} onRetry={() => retryOp.mutate(op)} />
              <div className="mt-2 flex justify-end">
                <Button size="sm" variant="ghost" onClick={() => dropOp.mutate(op)}>
                  <Trash2 className="size-4" /> استبعاد
                </Button>
              </div>
            </div>
          ))}
          {!conflicts.length && (
            <p className="py-6 text-center text-sm text-muted-foreground">لا توجد تعارضات.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function OpRow({ op, onRetry }: { op: SyncOp; onRetry: () => void }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border p-3">
      <div className="min-w-0">
        <div className="truncate text-sm font-bold">
          {ENTITY_LABELS[op.entity] ?? op.entity} · {STATUS_LABELS[op.status] ?? op.status}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {dateTime(op.created_at)} · محاولات: {op.retry_count}
          {op.last_error ? ` · ${op.last_error}` : ""}
        </div>
      </div>
      <Button size="sm" variant="outline" className="shrink-0" onClick={onRetry}>
        إعادة المحاولة
      </Button>
    </div>
  );
}
