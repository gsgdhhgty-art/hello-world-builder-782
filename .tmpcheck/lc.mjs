import { legacyColors } from "../scripts/legacy-colors.mjs";
import fs from "fs";
const out = legacyColors(fs.readFileSync(".tmpcheck/dev.css","utf8"));
fs.writeFileSync(".tmpcheck/out.css", out);
console.log("okl", (out.match(/okl(ch|ab)\(/g)||[]).length, "mix", (out.match(/color-mix\(/g)||[]).length);
