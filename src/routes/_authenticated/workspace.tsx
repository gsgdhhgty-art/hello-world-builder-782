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
      <section className="relative isolate min-h-56 overflow-hidden bg-industry text-industry-foreground">
        <img src={p.art} alt={info?.name ?? "النشاط التجاري"} width={1200} height={800} className="absolute inset-0 -z-20 size-full object-cover" />
        <div className="absolute inset-0 -z-10 bg-foreground/70" aria-hidden />
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
          <span className="text-sm font-semibold">{info?.name ?? "SmartPOS"}</span>
          <h1 className="mt-2 text-3xl font-bold">{p.headline}</h1>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button asChild><Link to="/pos"><ScanBarcode className="size-4" /> فتح الكاشير</Link></Button>
            <Button asChild variant="secondary"><Link to="/products">المنتجات</Link></Button>
          </div>
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
