import type { IndustryMeta } from "./types";
import { supermarket } from "./modules/supermarket";
import { pharmacy } from "./modules/pharmacy";
import { cafe } from "./modules/cafe";
import { restaurant } from "./modules/restaurant";
import { clothing } from "./modules/clothing";
import { electronics } from "./modules/electronics";
import { homeGoods } from "./modules/home-goods";
import { bookstore } from "./modules/bookstore";
import { cosmetics } from "./modules/cosmetics";
import { autoParts } from "./modules/auto-parts";
import { generalRetail } from "./modules/general-retail";

/**
 * Static registry of industry modules. Each module is fully independent:
 * it owns its theme, defaults, features and POS mode. Adding or editing a
 * module never touches another module — the registry only maps slugs.
 */
const MODULES: IndustryMeta[] = [
  supermarket,
  pharmacy,
  cafe,
  restaurant,
  clothing,
  electronics,
  homeGoods,
  bookstore,
  cosmetics,
  autoParts,
  generalRetail,
];

const BY_SLUG: ReadonlyMap<string, IndustryMeta> = new Map(
  MODULES.map((m) => [m.slug, m]),
);

/** Fallback module used when the database has an industry the code doesn't know yet. */
export const GENERIC_INDUSTRY: IndustryMeta = {
  slug: "general",
  name: "نشاط عام",
  icon: "store",
  theme: { primary: "#0E7490", accent: "#F59E0B" },
  defaultSettings: {},
  features: [],
  pos: { mode: "retail", weight: false },
};

export function listIndustryModules(): IndustryMeta[] {
  return MODULES;
}

/** Resolve a module by slug. Unknown slugs get the generic fallback instead of crashing. */
export function getIndustryModule(slug: string | null | undefined): IndustryMeta {
  if (!slug) return GENERIC_INDUSTRY;
  return BY_SLUG.get(slug) ?? GENERIC_INDUSTRY;
}

export function hasIndustryModule(slug: string): boolean {
  return BY_SLUG.has(slug);
}
