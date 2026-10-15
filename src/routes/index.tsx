import { useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  BarChart3,
  Boxes,
  Building2,
  Clock,
  Receipt,
  ScanBarcode,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { CASHIER_APP } from "@/lib/app-mode";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SmartPOS — نظام نقاط البيع للمتاجر والبقالات" },
      {
        name: "description",
        content:
          "أنشئ متجرك في دقيقة: كاشير سريع بالباركود، مخزون لحظي لكل مستودع، ورديات وخزنة، مشتريات، تقارير أرباح وصلاحيات موظفين دقيقة.",
      },
      { property: "og:title", content: "SmartPOS — نظام نقاط البيع للمتاجر والبقالات" },
      {
        property: "og:description",
        content: "كاشير سريع، مخزون لحظي، ورديات وتقارير أرباح لكل فرع.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  {
    icon: ScanBarcode,
    title: "كاشير سريع",
    body: "بحث بالباركود أو الاسم، سلة فورية، وطرق دفع متعددة.",
  },
  { icon: Boxes, title: "مخزون لحظي", body: "خصم تلقائي عند البيع، حركات مخزون، وتنبيه حد الطلب." },
  {
    icon: Building2,
    title: "فروع ومستودعات",
    body: "هيكل مؤسسة كامل: فروع، مستودعات، وأجهزة كاشير.",
  },
  {
    icon: Users,
    title: "موظفون وصلاحيات",
    body: "أدوار جاهزة وأدوار مخصصة بصلاحيات دقيقة لكل إجراء.",
  },
  { icon: Clock, title: "ورديات وخزنة", body: "فتح وإغلاق الوردية مع النقدية المتوقعة والفرق." },
  {
    icon: Receipt,
    title: "فواتير ومرتجعات",
    body: "أرقام فواتير متسلسلة، مرتجعات جزئية، وإرجاع للمخزون.",
  },
  {
    icon: BarChart3,
    title: "تقارير وأرباح",
    body: "مبيعات يومية، أفضل المنتجات، هوامش الربح والمصروفات.",
  },
  {
    icon: ShieldCheck,
    title: "أمان حقيقي",
    body: "عزل كامل لبيانات كل مؤسسة، والأسعار تُحسب في الخادم.",
  },
];

function Landing() {
  const { session, profile, loading } = useAuth();
  const navigate = useNavigate();
  const signedIn = Boolean(session && !loading);

  useEffect(() => {
    if (CASHIER_APP && !loading) {
      navigate({ to: session ? "/pos" : "/auth", replace: true });
      return;
    }
    if (!loading && session && profile?.role === "CASHIER") {
      navigate({ to: "/pos", replace: true });
    }
  }, [loading, session, profile?.role, navigate]);

  return (
    <main className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2 text-lg font-extrabold">
          <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
            ك
          </span>
          SmartPOS
        </div>
        {signedIn ? (
          <Button asChild>
            <Link to={profile?.role === "CASHIER" ? "/pos" : "/dashboard"}>الدخول للنظام</Link>
          </Button>
        ) : (
          <Button asChild>
            <Link to="/auth">تسجيل الدخول</Link>
          </Button>
        )}
      </header>

      <section className="mx-auto max-w-6xl px-6 pb-16 pt-10 text-center">
        <h1 className="mx-auto max-w-3xl text-4xl font-extrabold leading-tight md:text-5xl">
          نظام نقاط بيع كامل لمتجرك — من الكاشير حتى تقارير الأرباح
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
          مخصص للبقالات والسوبرماركت ومتاجر التجزئة. يعمل على الحاسب واللوحي، بفروع متعددة وصلاحيات
          دقيقة لكل موظف.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button size="lg" asChild>
            <Link to="/auth">ابدأ الآن مجانًا</Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link to="/auth">لدي حساب بالفعل</Link>
          </Button>
        </div>
      </section>

      <section className="border-t bg-card/40 py-16">
        <div className="mx-auto grid max-w-6xl gap-6 px-6 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border bg-card p-5 shadow-sm">
              <f.icon className="mb-3 size-6 text-primary" />
              <h2 className="font-bold">{f.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="py-10 text-center text-sm text-muted-foreground">
        SmartPOS — منصة نقاط بيع سحابية.
      </footer>
    </main>
  );
}
