import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const distDir = process.env.NEXT_DIST_DIR || ".next-production";
const manifestPath = path.join(root, distDir, "app-build-manifest.json");

await access(manifestPath).catch(() => {
  throw new Error(`Style build check could not find ${manifestPath}.`);
});

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const layoutAssets = manifest.pages?.["/layout"] || [];
const cssAssets = layoutAssets.filter((asset) => asset.startsWith("static/css/") && asset.endsWith(".css"));

if (!cssAssets.length) {
  throw new Error("The root layout generated no global CSS chunk.");
}

for (const asset of cssAssets) {
  const assetPath = path.join(root, distDir, asset);
  const details = await stat(assetPath).catch(() => null);
  if (!details || details.size === 0) throw new Error(`Generated CSS chunk is missing or empty: ${asset}`);
  const css = await readFile(assetPath, "utf8");
  if (!css.includes("--green") || !css.includes("background:#000")) {
    throw new Error(`Generated CSS chunk is missing XMASKEDFREAKS root style markers: ${asset}`);
  }
}

console.log(`Style build check passed: ${cssAssets.join(", ")}`);
