import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, ShoppingBag } from "lucide-react";
import { money, num } from "@/lib/format";
import { openDisplayChannel, type DisplayState } from "@/lib/customer-display";

export const Route = createFileRoute("/customer-display")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "شاشة العميل — SmartPOS" },
      { name: "description", content: "شاشة تعرض للعميل الأصناف والإجمالي أثناء البيع." },
      { property: "og:title", content: "شاشة العميل — SmartPOS" },
      { property: "og:description", content: "عرض الفاتورة للعميل لحظيًا." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CustomerDisplay,
});

function CustomerDisplay() {
  const [state, setState] = useState<DisplayState | null>(null);

  useEffect(() => {
    const ch = openDisplayChannel();
    if (!ch) return;
    ch.onmessage = (e: MessageEvent<DisplayState>) => setState(e.data);
    ch.postMessage({ hello: true });
    return () => ch.close();
  }, []);

  const currency = state?.currency ?? "EGP";

  return (
    <main dir="rtl" className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border bg-card px-8 py-5">
        <h1 className="font-display text-3xl font-bold">{state?.store ?? "SmartPOS"}</h1>
        <span className="text-lg text-muted-foreground">أهلًا بك</span>
      </header>

      {state?.done ? (
        <section className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <CheckCircle2 className="size-24 text-primary" />
          <p className="text-3xl font-bold">شكرًا لتسوقك معنا</p>
          <p className="text-2xl">المدفوع: {money(state.done.paid, currency)}</p>
          <p className="text-4xl font-bold text-primary">الباقي: {money(state.done.change, currency)}</p>
        </section>
      ) : !state || state.lines.length === 0 ? (
        <section className="flex flex-1 flex-col items-center justify-center gap-4 text-muted-foreground">
          <ShoppingBag className="size-24" />
          <p className="text-2xl">بانتظار الأصناف…</p>
        </section>
      ) : (
        <section className="grid flex-1 gap-6 p-8 lg:grid-cols-[1fr_380px]">
          <ul className="divide-y divide-border overflow-auto rounded-xl border border-border bg-card">
            {state.lines.map((l, i) => (
              <li key={i} className="flex items-center justify-between gap-4 px-6 py-4 text-xl">
                <span className="min-w-0 truncate font-semibold">{l.name}</span>
                <span className="shrink-0 text-muted-foreground">× {num(l.quantity, 0)}</span>
                <span className="shrink-0 font-bold tabular-nums">{money(l.total, currency)}</span>
              </li>
            ))}
          </ul>
          <aside className="flex flex-col gap-3 self-start rounded-xl border border-border bg-card p-6 text-xl">
            <Row label="الإجمالي الفرعي" value={money(state.subtotal, currency)} />
            {state.discount > 0 && <Row label="الخصم" value={`− ${money(state.discount, currency)}`} />}
            {state.tax > 0 && <Row label="الضريبة" value={money(state.tax, currency)} />}
            <div className="mt-2 border-t border-border pt-4">
              <p className="text-base text-muted-foreground">المطلوب</p>
              <p className="text-5xl font-bold text-primary tabular-nums">{money(state.total, currency)}</p>
            </div>
          </aside>
        </section>
      )}
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <strong className="tabular-nums">{value}</strong>
    </div>
  );
}
