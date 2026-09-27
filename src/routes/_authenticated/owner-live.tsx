import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Bell, Radio, Receipt, TrendingUp, Wallet } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { dateTime, money, num } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/owner-live")({
  head: () => ({
    meta: [
      { title: "متابعة مباشرة للمالك — SmartPOS" },
      { name: "description", content: "مبيعات اليوم لحظيًا وتنبيهات الإلغاء والمرتجعات ونقص المخزون من الهاتف." },
      { property: "og:title", content: "متابعة مباشرة للمالك — SmartPOS" },
      { property: "og:description", content: "لوحة المالك اللحظية على الهاتف." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OwnerLive,
});

const STATUS: Record<string, string> = {
  COMPLETED: "مكتملة",
  REFUNDED: "مسترجعة",
  PARTIALLY_REFUNDED: "مسترجعة جزئيًا",
  VOID: "ملغاة",
};

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function OwnerLive() {
  const { org, can } = useAuth();
  const qc = useQueryClient();
  const currency = org?.currency ?? "EGP";
  const [live, setLive] = useState(false);

  const sales = useQuery({
    queryKey: ["owner-live-sales"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id, invoice_no, total, cost_total, status, payment_method, created_at")
        .gte("created_at", startOfToday())
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const lowStock = useQuery({
    queryKey: ["owner-low-stock"],
    queryFn: async () => {
      const [{ data: prods }, { data: inv }] = await Promise.all([
        supabase.from("products").select("id, reorder_level").eq("is_active", true).eq("track_stock", true),
        supabase.from("inventory").select("product_id, quantity"),
      ]);
      const totals = new Map<string, number>();
      for (const r of inv ?? []) totals.set(r.product_id, (totals.get(r.product_id) ?? 0) + Number(r.quantity));
      return (prods ?? []).filter((p) => (totals.get(p.id) ?? 0) <= Number(p.reorder_level)).length;
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("owner-live-sales")
      .on("postgres_changes", { event: "*", schema: "public", table: "sales" }, (payload) => {
        const row = payload.new as { status?: string; invoice_no?: string; total?: number } | null;
        if (row?.status && row.status !== "COMPLETED") {
          const msg = `تنبيه: فاتورة ${row.invoice_no ?? ""} أصبحت ${STATUS[row.status] ?? row.status}`;
          toast.warning(msg);
          if (typeof Notification !== "undefined" && Notification.permission === "granted") new Notification("SmartPOS", { body: msg });
        }
        void qc.invalidateQueries({ queryKey: ["owner-live-sales"] });
      })
      .subscribe((status) => setLive(status === "SUBSCRIBED"));
    return () => void supabase.removeChannel(channel);
  }, [qc]);

  const stats = useMemo(() => {
    const rows = sales.data ?? [];
    const done = rows.filter((r) => r.status !== "VOID");
    const total = done.reduce((s, r) => s + Number(r.total), 0);
    const profit = done.reduce((s, r) => s + Number(r.total) - Number(r.cost_total), 0);
    const alerts = rows.filter((r) => r.status !== "COMPLETED");
    return { total, profit, count: done.length, avg: done.length ? total / done.length : 0, alerts };
  }, [sales.data]);

  const showProfit = can("reports.view");

  return (
    <div className="pb-10">
      <PageHeader title="متابعة مباشرة" description="مبيعات اليوم تتحدث لحظيًا من كل الكاشيرات.">
        <Badge variant={live ? "default" : "secondary"} className="gap-1"><Radio className="size-3" />{live ? "مباشر" : "جارٍ الاتصال"}</Badge>
        {typeof Notification !== "undefined" && Notification.permission !== "granted" && (
          <Button size="sm" variant="outline" onClick={() => void Notification.requestPermission()}>
            <Bell className="size-4" /> تفعيل الإشعارات
          </Button>
        )}
      </PageHeader>

      <div className="grid gap-4 px-4 sm:px-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi icon={Wallet} label="مبيعات اليوم" value={money(stats.total, currency)} />
          <Kpi icon={Receipt} label="عدد الفواتير" value={num(stats.count)} />
          {showProfit && <Kpi icon={TrendingUp} label="ربح اليوم" value={money(stats.profit, currency)} />}
          <Kpi icon={AlertTriangle} label="أصناف تحت حد الطلب" value={num(lowStock.data ?? 0)} />
        </div>

        {stats.alerts.length > 0 && (
          <section className="rounded-xl border border-destructive/40 bg-destructive/5 p-4">
            <h2 className="mb-2 flex items-center gap-2 font-bold text-destructive"><AlertTriangle className="size-4" /> إلغاءات ومرتجعات اليوم</h2>
            <ul className="grid gap-1 text-sm">
              {stats.alerts.map((a) => (
                <li key={a.id} className="flex justify-between gap-2">
                  <span dir="ltr">{a.invoice_no}</span>
                  <span>{STATUS[a.status] ?? a.status}</span>
                  <span>{money(a.total, currency)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="rounded-xl border border-border bg-card">
          <h2 className="border-b border-border px-4 py-3 font-bold">آخر الفواتير</h2>
          <ul className="divide-y divide-border">
            {(sales.data ?? []).slice(0, 30).map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="font-semibold" dir="ltr">{s.invoice_no}</p>
                  <p className="text-xs text-muted-foreground">{dateTime(s.created_at)}</p>
                </div>
                {s.status !== "COMPLETED" && <Badge variant="destructive">{STATUS[s.status] ?? s.status}</Badge>}
                <strong className="tabular-nums">{money(s.total, currency)}</strong>
              </li>
            ))}
            {(sales.data ?? []).length === 0 && <li className="px-4 py-10 text-center text-muted-foreground">لا مبيعات اليوم بعد</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value }: { icon: typeof Wallet; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="size-4" />{label}</div>
      <p className="mt-2 text-xl font-bold tabular-nums">{value}</p>
    </div>
  );
}
