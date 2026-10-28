import supermarket from "@/assets/industries/realistic-supermarket.webp";
import pharmacy from "@/assets/industries/realistic-pharmacy.webp";
import cafe from "@/assets/industries/realistic-cafe.webp";
import restaurant from "@/assets/industries/realistic-restaurant.webp";
import clothing from "@/assets/industries/realistic-clothing.webp";
import electronics from "@/assets/industries/realistic-electronics.webp";
import homeGoods from "@/assets/industries/realistic-home-goods.webp";
import bookstore from "@/assets/industries/realistic-bookstore.webp";
import cosmetics from "@/assets/industries/realistic-cosmetics.webp";
import autoParts from "@/assets/industries/realistic-auto-parts.webp";
import generalRetail from "@/assets/industries/realistic-general-retail.webp";

/**
 * Visual identity per industry (realistic photography + headline). Kept apart from the
 * module contract so server code never bundles image assets.
 */
export interface IndustryPresentation {
  art: string;
  headline: string;
  tagline: string;
  /** Which operational board the workspace shows. */
  board: "tables" | "expiry" | "fresh" | "catalog";
}

const MAP: Record<string, IndustryPresentation> = {
  supermarket: {
    art: supermarket,
    headline: "تشغيل سوبر ماركت سريع",
    tagline: "باركود وميزان، صلاحيات الأصناف الطازجة، وإعادة الطلب قبل نفاد الرفوف.",
    board: "fresh",
  },
  pharmacy: {
    art: pharmacy,
    headline: "صيدلية تحت السيطرة",
    tagline: "متابعة تواريخ الانتهاء يوميًا، منع بيع المنتهي، ونواقص الأدوية قبل أن يطلبها المريض.",
    board: "expiry",
  },
  cafe: {
    art: cafe,
    headline: "بار القهوة والطاولات",
    tagline: "طلبات الطاولات والتيك أواي تصل للبار فورًا، ثم تتحول لفاتورة بضغطة.",
    board: "tables",
  },
  restaurant: {
    art: restaurant,
    headline: "صالة ومطبخ متصلان",
    tagline: "خريطة الطاولات، شاشة المطبخ بالأولوية والوقت، وتحصيل الحساب من الكاشير.",
    board: "tables",
  },
  clothing: {
    art: clothing,
    headline: "بوتيك منظم",
    tagline: "أداء الموديلات والأقسام، وأصناف قاربت على النفاد لإعادة الطلب في الموسم.",
    board: "catalog",
  },
  electronics: {
    art: electronics,
    headline: "معرض إلكترونيات",
    tagline: "قيمة المخزون العالية تحت المراقبة، والأكثر مبيعًا، والأصناف الراكدة.",
    board: "catalog",
  },
  "home-goods": {
    art: homeGoods,
    headline: "أدوات منزلية",
    tagline: "الأقسام الأكثر حركة وأصناف تحتاج إعادة طلب من المورد.",
    board: "catalog",
  },
  bookstore: {
    art: bookstore,
    headline: "مكتبة وأدوات مكتبية",
    tagline: "مواسم الدراسة، الأكثر طلبًا، والنواقص قبل بداية الموسم.",
    board: "catalog",
  },
  cosmetics: {
    art: cosmetics,
    headline: "عطور ومستحضرات",
    tagline: "صلاحية المستحضرات، العلامات الأكثر مبيعًا، وتنبيهات النفاد.",
    board: "expiry",
  },
  "auto-parts": {
    art: autoParts,
    headline: "قطع غيار",
    tagline: "قيمة المخزون، الأصناف السريعة، والقطع التي يجب طلبها من المورد.",
    board: "catalog",
  },
  "general-retail": {
    art: generalRetail,
    headline: "متجر تجزئة",
    tagline: "مبيعات اليوم، الأكثر طلبًا، والنواقص في مكان واحد.",
    board: "catalog",
  },
};

export function getIndustryPresentation(slug: string | null | undefined): IndustryPresentation {
  return (slug ? MAP[slug] : undefined) ?? (MAP["general-retail"] as IndustryPresentation);
}
