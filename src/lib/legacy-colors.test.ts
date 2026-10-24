import { describe, expect, it } from "vitest";
// @ts-expect-error plain JS build helper
import { legacyColors } from "../../scripts/legacy-colors.mjs";

describe("legacy colors for Windows 7 browsers", () => {
  it("turns oklch tokens into hex", () => {
    expect(legacyColors(":root{--primary:oklch(1 0 0)}")).toContain("--primary:#ffffff");
  });
  it("gives opacity utilities a fallback that works without color-mix", () => {
    const out = legacyColors(
      ":root{--primary:#005dbd}.a{background-color:var(--primary)}@supports (color: color-mix(in lab, red, red)){.a{background-color:color-mix(in oklab,var(--primary) 10%,transparent)}}",
    );
    expect(out).toContain("rgb(var(--primary-rgb) / 0.1)");
    expect(out).not.toContain("color-mix");
    expect(out).toContain("--primary-rgb:0 93 189");
  });
  it("keeps gradients visible when color-mix is unsupported", () => {
    const out = legacyColors(
      ":root{--g:linear-gradient(135deg,var(--p),color-mix(in oklab,var(--p) 86%,var(--s)))}",
    );
    expect(out).toContain("--g:linear-gradient(135deg,var(--p),var(--p))");
  });
});
