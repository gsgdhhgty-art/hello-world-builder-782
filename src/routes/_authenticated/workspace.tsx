import { createFileRoute, Link } from "@tanstack/react-router";
import { ScanBarcode } from "lucide-react";
import { useIndustry, industryStyle } from "@/hooks/useIndustry";
import { getIndustryPresentation } from "@/industries/presentation";
import { TablesBoard } from "@/components/industry/TablesBoard";
import { CatalogBoard, ExpiryBoard, FreshBoard } from "@/components/industry/StockBoards";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/workspace")({
  head: () => ({
    meta: [
      { title: "مساحة النشاط — SmartPOS" },
      { name: "description", content: "لوحة تشغيل مخصصة لنشاطك: طاولات ومطبخ، صلاحيات، أصناف بالوزن وإعادة الطلب." },
      { property: "og:title", content: "مساحة النشاط — SmartPOS" },
      { property: "og:description", content: "أدوات تشغيل خاصة بكل نشاط تجاري داخل SmartPOS." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Workspace,
});

function Workspace() {
  const industry = useIndustry();
  const info = industry.data;
  const p = getIndustryPresentation(info?.slug);

  return (
    <div style={industryStyle(info?.theme)} className="pb-10">
      <section className="relative mx-4 mt-6 overflow-hidden rounded-3xl bg-industry text-industry-foreground sm:mx-6">
        <div className="absolute -left-20 -top-24 size-72 rounded-full bg-industry-accent/30 blur-3xl" aria-hidden />
        <div className="relative grid items-center gap-4 p-6 sm:p-8 md:grid-cols-[1fr_320px]">
          <div>
            <span className="inline-block rounded-full bg-industry-foreground/15 px-3 py-1 text-xs font-bold">
              {info?.name ?? "…"}
            </span>
            <h1 className="mt-3 text-3xl font-black sm:text-4xl">{p.headline}</h1>
            <p className="mt-2 max-w-xl text-sm font-medium opacity-90 sm:text-base">{p.tagline}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button asChild className="bg-industry-foreground text-industry hover:bg-industry-foreground/90">
                <Link to="/pos">
                  <ScanBarcode className="size-4" /> فتح الكاشير
                </Link>
              </Button>
              <Button asChild variant="outline" className="border-industry-foreground/40 bg-transparent text-industry-foreground hover:bg-industry-foreground/10">
                <Link to="/products">المنتجات</Link>
              </Button>
            </div>
          </div>
          <img src={p.art} alt={p.headline} width={320} height={320} className="mx-auto w-56 drop-shadow-2xl md:w-full" />
        </div>
      </section>

      <div className="mt-6 px-4 sm:px-6">
        {industry.isLoading ? (
          <div className="h-64 animate-pulse rounded-2xl bg-muted" />
        ) : p.board === "tables" ? (
          <TablesBoard />
        ) : p.board === "expiry" ? (
          <ExpiryBoard />
        ) : p.board === "fresh" ? (
          <FreshBoard />
        ) : (
          <CatalogBoard />
        )}
      </div>
    </div>
  );
}
