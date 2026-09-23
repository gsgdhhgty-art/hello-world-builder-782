import { existsSync, readFileSync } from "node:fs";

const obsoletePath = "src/hooks/use-mobile.tsx";
const currentPath = "src/hooks/use-mobile.ts";

if (existsSync(obsoletePath)) {
  throw new Error(`${obsoletePath} must not exist; keep the hook in ${currentPath}`);
}

const source = readFileSync(currentPath, "utf8");
if (!source.includes('from "react"')) {
  throw new Error(`${currentPath} must import React hooks directly`);
}

console.log("Mobile hook source is canonical.");