import { readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";

const platform = process.argv[2];
const expected = {
  windows: [".exe"],
  linux: [".AppImage", ".deb"],
  macos: [".dmg"],
};

const requiredExtensions = expected[platform];
if (!requiredExtensions) {
  throw new Error(`Unknown native platform: ${platform ?? "missing"}`);
}

const outputDirectory = "release";
const files = readdirSync(outputDirectory).filter((file) =>
  statSync(join(outputDirectory, file)).isFile(),
);

for (const extension of requiredExtensions) {
  const matches = files.filter((file) => extname(file) === extension || file.endsWith(extension));
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one ${extension} installer in ${outputDirectory}, found ${matches.length}`,
    );
  }

  const file = join(outputDirectory, matches[0]);
  const bytes = statSync(file).size;
  if (bytes < 1_000_000) {
    throw new Error(`${file} is unexpectedly small (${bytes} bytes)`);
  }
  console.log(`Verified ${file} (${bytes} bytes).`);
}
