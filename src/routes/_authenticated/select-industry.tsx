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
import { Button } from "@/components/ui/button";
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
          اختر النشاط المرتبط بمؤسستك.
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
              <Button variant="ghost"
                key={industry.slug}
                type="button"
                onClick={() =>
                  navigate({ to: "/onboarding", search: { industry: industry.slug } })
                }
                className="group h-auto items-stretch whitespace-normal p-0 text-start"
              >
                <Card className="h-full overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-lg">
                  <div className="h-32 overflow-hidden bg-muted">
                    <img src={getIndustryPresentation(industry.slug).art} alt={industry.name}
                      loading="lazy" width={480} height={320} className="h-full w-full object-cover" />
                  </div>
                  <CardHeader className="gap-3">
                    <span className="grid size-9 place-items-center rounded-lg bg-secondary text-secondary-foreground"><Icon className="size-5" /></span>
                    <CardTitle className="text-base leading-snug">{industry.name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="line-clamp-3">{industry.description}</CardDescription>
                  </CardContent>
                </Card>
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
}
