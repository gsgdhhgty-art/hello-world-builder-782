/**
 * Industry module contract.
 *
 * Every industry is an independent module that may customize: theme, default
 * organization settings, feature list, POS mode and extra navigation sections.
 * The shared core (auth, branches, warehouses, inventory, purchases, reports,
 * audit, offline) is identical for every industry and must NOT be duplicated
 * inside a module — a module only declares what differs.
 */
export interface IndustryMeta {
  /** Stable slug; must match public.industries.slug */
  slug: string;
  /** Arabic display name */
  name: string;
  /** lucide-react icon name */
  icon: string;
  /** Brand colors applied when the organization's theme is not overridden */
  theme: { primary: string; accent: string };
  /** Organization settings applied at bootstrap time (subset of organizations columns) */
  defaultSettings: Record<string, unknown>;
  /** Feature keys the industry exposes (informational; enforced server-side) */
  features: string[];
  /** POS behaviour for this industry */
  pos: {
    /** retail = barcode-first grid; tables = table service; variants = size/color picker; serial = device tracking */
    mode: "retail" | "tables" | "variants" | "serial";
    /** product is sold by weight (scale barcode) */
    weight: boolean;
  };
}

/** Feature keys provided by the shared core to every industry. */
export const SHARED_CORE_FEATURES = [
  "pos",
  "inventory",
  "purchases",
  "suppliers",
  "customers",
  "credit",
  "reports",
  "shifts",
  "expenses",
  "employees",
  "audit",
  "offline",
  "ai_analyst",
] as const;
