import { describe, it, expect } from "vitest";
import { getIndustryModule, listIndustryModules, hasIndustryModule, GENERIC_INDUSTRY } from "./registry";

describe("industry registry", () => {
  it("resolves every seeded slug to a module", () => {
    const slugs = [
      "supermarket", "pharmacy", "cafe", "restaurant", "clothing",
      "electronics", "home-goods", "bookstore", "cosmetics", "auto-parts", "general-retail",
    ];
    for (const slug of slugs) {
      const m = getIndustryModule(slug);
      expect(m.slug).toBe(slug);
      expect(hasIndustryModule(slug)).toBe(true);
    }
  });

  it("falls back to the generic module for unknown or empty slugs", () => {
    expect(getIndustryModule("unknown-industry")).toBe(GENERIC_INDUSTRY);
    expect(getIndustryModule(null)).toBe(GENERIC_INDUSTRY);
    expect(getIndustryModule(undefined)).toBe(GENERIC_INDUSTRY);
  });

  it("modules are isolated: each has its own theme and pos mode", () => {
    const pharmacy = getIndustryModule("pharmacy");
    const cafe = getIndustryModule("cafe");
    expect(pharmacy.theme).not.toBe(cafe.theme);
    expect(pharmacy.pos.mode).toBe("retail");
    expect(cafe.pos.mode).toBe("tables");
    // super market sells by weight, pharmacy does not — per-module settings
    expect(getIndustryModule("supermarket").pos.weight).toBe(true);
    expect(pharmacy.pos.weight).toBe(false);
  });

  it("super market default settings demand expiry blocking, clothing does not", () => {
    expect(getIndustryModule("supermarket").defaultSettings.block_expired_sales).toBe(true);
    expect(getIndustryModule("clothing").defaultSettings.block_expired_sales).toBe(false);
  });

  it("every module has a unique slug and a theme color", () => {
    const modules = listIndustryModules();
    const slugs = new Set(modules.map((m) => m.slug));
    expect(slugs.size).toBe(modules.length);
    for (const m of modules) {
      expect(m.theme.primary).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(m.theme.accent).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});
