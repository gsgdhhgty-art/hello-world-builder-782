import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Book,
  Coffee,
  Home,
  Pill,
  ScanBarcode,
  Shirt,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Store,
  Utensils,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { listIndustries, type IndustryRow } from "@/lib/industries.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getIndustryPresentation } from "@/industries/presentation";

export const Route = createFileRoute("/_authenticated/select-industry")({
  head: () => ({
    meta: [
      { title: "اختر نشاطك — SmartPOS" },
      { name: "description", content: "اختر نشاط تجارتك لتهيئة SmartPOS بمنتجات وقوائم وضوابط مناسبة لقطاعك." },
      { property: "og:title", content: "اختر نشاطك — SmartPOS" },
      { property: "og:description", content: "منصة إدارة نقاط البيع متعددة الأنشطة: سوبر ماركت، صيدلية، كافيه، مطعم وغيرها." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SelectIndustry,
});

const ICONS: Record<string, LucideIcon> = {
  "shopping-cart": ShoppingCart,
  pill: Pill,
  coffee: Coffee,
  utensils: Utensils,
  shirt: Shirt,
  smartphone: Smartphone,
  home: Home,
  book: Book,
  sparkles: Sparkles,
  wrench: Wrench,
  store: Store,
};

function SelectIndustry() {
  const navigate = useNavigate();
  const fetchIndustries = useServerFn(listIndustries);
  const industriesQuery = useQuery({
    queryKey: ["industries"],
    staleTime: 300_000,
    queryFn: () => fetchIndustries(),
  });
  const industries: IndustryRow[] = industriesQuery.data ?? [];

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-4 py-10">
      <div className="mb-8 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl gradient-primary text-xl font-black text-primary-foreground shadow-md">
          <ScanBarcode className="size-6" />
        </span>
        <h1 className="mt-4 text-3xl font-black">ما هو نشاط تجارتك؟</h1>
        <p className="mt-2 text-muted-foreground">
          اختر نشاطك وسنجهّز النظام بالضوابط المناسبة: وحدات القياس، الصلاحيات، الضرائب، ومحتويات الواجهة.
        </p>
      </div>

      {industriesQuery.isLoading ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-36 animate-pulse rounded-xl border bg-muted" />
          ))}
        </div>
      ) : industries.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            لا توجد أنشطة متاحة حاليًا، تواصل مع إدارة المنصة.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {industries.map((industry) => {
            const Icon = ICONS[industry.icon] ?? Store;
            return (
              <button
                key={industry.slug}
                type="button"
                onClick={() =>
                  navigate({ to: "/onboarding", search: { industry: industry.slug } })
                }
                className="group text-start"
              >
                <Card className="h-full overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-lg">
                  <div
                    className="grid h-32 place-items-center"
                    style={{ background: `linear-gradient(135deg, ${industry.theme.primary ?? "#0E7490"}22, ${industry.theme.accent ?? "#F59E0B"}33)` }}
                  >
                    <img
                      src={getIndustryPresentation(industry.slug).art}
                      alt={industry.name}
                      loading="lazy"
                      width={128}
                      height={128}
                      className="h-28 w-28 object-contain drop-shadow-xl transition-transform group-hover:scale-105"
                    />
                  </div>
                  <CardHeader className="gap-3">
                    <span
                      className="grid size-11 place-items-center rounded-xl text-primary-foreground shadow-sm"
                      style={{ backgroundColor: industry.theme.primary ?? "#0E7490" }}
                    >
                      <Icon className="size-5" />
                    </span>
                    <CardTitle className="text-base leading-snug">{industry.name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="line-clamp-3">{industry.description}</CardDescription>
                  </CardContent>
                </Card>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
