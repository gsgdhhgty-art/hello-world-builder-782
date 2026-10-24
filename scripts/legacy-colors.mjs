// Makes the generated CSS readable by Chrome/Edge 109 (the last versions on Windows 7/8),
// which ignore oklch()/oklab() and color-mix(). Without this every page renders black & white there.
import postcss from "postcss";

const SUPPORTS_MIX = "(color: color-mix(in lab, red, red))";

function oklabToRgb(L, A, B, alpha) {
  const l_ = L + 0.3963377774 * A + 0.2158037573 * B;
  const m_ = L - 0.1055613458 * A - 0.0638541728 * B;
  const s_ = L - 0.0894841775 * A - 1.291485548 * B;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  const [r, g, b] = lin.map((x) => {
    const c = Math.max(0, Math.min(1, x));
    const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
    return Math.round(v * 255);
  });
  if (alpha === undefined || alpha >= 1) {
    return "#" + [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("");
  }
  return `rgba(${r}, ${g}, ${b}, ${+alpha.toFixed(3)})`;
}

const num = (t, pctScale = 1) =>
  t.endsWith("%") ? (parseFloat(t) / 100) * pctScale : t === "none" ? 0 : parseFloat(t);

/** Converts oklch()/oklab() literals (without var()) to hex/rgba. */
export function convertLiterals(value) {
  return value.replace(/\b(oklch|oklab)\(([^()]*)\)/g, (match, fn, body) => {
    if (body.includes("var(")) return match;
    const [main, a] = body.split("/");
    const p = main.trim().split(/[\s,]+/);
    const L = num(p[0]);
    const alpha = a === undefined ? undefined : num(a.trim());
    if (fn === "oklch") {
      const C = num(p[1], 0.4);
      const H = (num(p[2]) * Math.PI) / 180;
      return oklabToRgb(L, C * Math.cos(H), C * Math.sin(H), alpha);
    }
    return oklabToRgb(L, num(p[1], 0.4), num(p[2], 0.4), alpha);
  });
}

function hexToTriplet(hex) {
  let h = hex.slice(1);
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  if (h.length !== 6) return null;
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(" ");
}

/** Splits top-level comma arguments of a function body. */
function splitArgs(body) {
  const out = [];
  let depth = 0, cur = "";
  for (const ch of body) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** Rewrites every color-mix(...) in a value with fn(args) (innermost first). */
function mapColorMix(value, fn) {
  let idx = value.indexOf("color-mix(");
  while (idx !== -1) {
    let depth = 0, end = -1;
    for (let i = idx + 9; i < value.length; i++) {
      if (value[i] === "(") depth++;
      else if (value[i] === ")" && --depth === 0) {
        end = i;
        break;
      }
    }
    if (end === -1) return value;
    const inner = mapColorMix(value.slice(idx + 10, end), fn);
    const replaced = fn(splitArgs(inner));
    const full = `color-mix(${inner})`;
    value = value.slice(0, idx) + (replaced ?? full) + value.slice(end + 1);
    idx = value.indexOf("color-mix(", idx + (replaced ?? full).length);
  }
  return value;
}

function parseStop(arg) {
  const m = arg.match(/^(.*?)\s*(\d+(?:\.\d+)?)%$/);
  return m ? { color: m[1].trim(), pct: parseFloat(m[2]) } : { color: arg, pct: null };
}

export function legacyColors(css) {
  const root = postcss.parse(css);

  // 1. literal oklch/oklab -> hex/rgba
  root.walkDecls((d) => {
    if (/okl(ch|ab)\(/.test(d.value)) d.value = convertLiterals(d.value);
  });

  // 2. rgb triplets for color variables so alpha mixes work without color-mix
  const rgbVars = new Set();
  root.walkDecls(/^--/, (d) => {
    if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(d.value.trim())) rgbVars.add(d.prop);
  });
  let grew = true;
  while (grew) {
    grew = false;
    root.walkDecls(/^--/, (d) => {
      const m = d.value.trim().match(/^var\((--[\w-]+)\)$/);
      if (m && rgbVars.has(m[1]) && !rgbVars.has(d.prop)) {
        rgbVars.add(d.prop);
        grew = true;
      }
    });
  }
  root.walkDecls(/^--/, (d) => {
    if (!rgbVars.has(d.prop) || d.prop.endsWith("-rgb")) return;
    const v = d.value.trim();
    const value = v.startsWith("#") ? hexToTriplet(v) : v.replace(/\)$/, "-rgb)");
    if (value) d.cloneAfter({ prop: `${d.prop}-rgb`, value });
  });

  const colorToRgb = (color, pct) => {
    const a = +(pct / 100).toFixed(3);
    const v = color.match(/^var\((--[\w-]+)\)$/);
    if (v && rgbVars.has(v[1])) return `rgb(var(${v[1]}-rgb) / ${a})`;
    const hex = color.match(/^#[0-9a-f]{3}([0-9a-f]{3})?$/i);
    if (hex) return `rgb(${hexToTriplet(color)} / ${a})`;
    return null;
  };

  // 3. color-mix(in X, C N%, transparent) -> rgb(... / N%), equivalent everywhere
  root.walkDecls((d) => {
    if (!d.value.includes("color-mix(")) return;
    d.value = mapColorMix(d.value, (args) => {
      if (args.length !== 3) return null;
      const a = parseStop(args[1]);
      const b = parseStop(args[2]);
      if (b.color === "transparent" && a.pct !== null) return colorToRgb(a.color, a.pct);
      if (a.color === "transparent" && b.pct !== null) return colorToRgb(b.color, b.pct);
      return null;
    });
  });

  // 4. @supports(color-mix) blocks that no longer need color-mix: unwrap so old browsers use them
  root.walkAtRules("supports", (at) => {
    if (!at.params.replace(/\s/g, "").includes("color:color-mix(inlab,red,red)")) return;
    if (at.toString().slice(at.params.length).includes("color-mix(")) return;
    at.replaceWith(at.nodes ?? []);
  });

  // 5. remaining color-mix (two real colors): old browsers get the first color,
  //    browsers that support color-mix keep the exact mix via @supports
  root.walkDecls((d) => {
    if (!d.value.includes("color-mix(")) return;
    const rule = d.parent;
    if (!rule || rule.type !== "rule") return;
    let inSupports = false;
    for (let p = rule.parent; p; p = p.parent) {
      if (p.type === "atrule" && p.name === "supports" && p.params.includes("color-mix")) inSupports = true;
    }
    if (inSupports) return;
    const original = d.value;
    d.value = mapColorMix(original, (args) => parseStop(args[1] ?? "").color || null);
    const modern = postcss.atRule({ name: "supports", params: SUPPORTS_MIX });
    modern.append(postcss.rule({ selector: rule.selector }).append({ prop: d.prop, value: original }));
    rule.after(modern);
  });

  return root.toString();
}

/** Vite plugin: applies legacyColors to every emitted CSS file. */
export function legacyColorsPlugin() {
  return {
    name: "smartpos-legacy-colors",
    apply: "build",
    enforce: "post",
    generateBundle(_opts, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type === "asset" && file.fileName.endsWith(".css")) {
          file.source = legacyColors(String(file.source));
        }
      }
    },
  };
}
