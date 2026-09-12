import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const baseline = JSON.parse(await readFile(path.join(root, "docs/i18n/hardcoded-baseline.json"), "utf8"));

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(target) : target.endsWith(".tsx") ? [target] : [];
  }));
  return nested.flat();
}

const files = [...await filesBelow(path.join(root, "app")), ...await filesBelow(path.join(root, "components"))]
  .filter((file) => !file.includes(`${path.sep}app${path.sep}admin${path.sep}`) && !file.includes(`${path.sep}components${path.sep}admin${path.sep}`));
const candidates = [];
const patterns = [/>\s*([A-Za-z][^<{>\n]{2,})\s*</g, /(?:aria-label|placeholder|title)="([A-Za-z][^"]{2,})"/g];
for (const file of files) {
  const source = await readFile(file, "utf8");
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      // An arrow function's `=>` is not a JSX opening tag. Without this guard,
      // condensed TypeScript such as `map(() => Promise<T>)` is misreported as UI copy.
      if (pattern === patterns[0] && match.index && source[match.index - 1] === "=") continue;
      candidates.push(`${path.relative(root, file)}:${match[1].trim()}`);
    }
  }
}

const manifest = JSON.parse(await readFile(path.join(root, "public/locales/manifest.json"), "utf8"));
const expected = ["en", "es", "fr", "de", "pt", "ja", "ko", "zh-CN", "ar", "ru"];
const missingLocales = expected.filter((locale) => !manifest.some((item) => item.code === locale && item.enabled));
if (missingLocales.length) throw new Error(`Missing active locales: ${missingLocales.join(", ")}`);

const englishCore = JSON.parse(await readFile(path.join(root, "public/locales/core/en.json"), "utf8"));
const requiredKeys = Object.keys(englishCore).filter((key) => key.startsWith("tipMenu.option.") || ["tipMenu.send", "tipMenu.tokens", "support.messageLabel"].includes(key));
for (const locale of expected) {
  const catalog = JSON.parse(await readFile(path.join(root, `public/locales/core/${locale}.json`), "utf8"));
  const missing = requiredKeys.filter((key) => !catalog[key]);
  if (missing.length) throw new Error(`${locale} is missing required core translations: ${missing.join(", ")}`);
  const wallet = JSON.parse(await readFile(path.join(root, `public/locales/wallet/${locale}.json`), "utf8"));
  const walletRequired = ["wallet.addCoins", "wallet.confirmPackage", "wallet.payReceive", "wallet.refillResume", "wallet.access.unlock", "wallet.access.leave"];
  const missingWallet = walletRequired.filter((key) => !wallet[key]);
  if (missingWallet.length) throw new Error(`${locale} is missing required wallet translations: ${missingWallet.join(", ")}`);
  const games = JSON.parse(await readFile(path.join(root, `public/locales/games/${locale}.json`), "utf8"));
  const gameRequired = ["gamesRoute.title", "gamesRoute.offlineTitle", "gameUi.activate", "gameUi.pacInstructions", "gameUi.spaceInstructions", "gameUi.enterArena", "gameUi.finalScore"];
  const missingGames = gameRequired.filter((key) => !games[key]);
  if (missingGames.length) throw new Error(`${locale} is missing required game translations: ${missingGames.join(", ")}`);
}

if (candidates.length > baseline.candidateCount) {
  throw new Error(`Hardcoded UI candidate count increased from ${baseline.candidateCount} to ${candidates.length}. New visitor-facing text must use i18n keys.`);
}
console.log(`i18n check passed: 10 locales, ${requiredKeys.length} required core keys, wallet/access and game domain coverage, ${candidates.length} legacy text candidates (baseline ${baseline.candidateCount}).`);
