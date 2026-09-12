import { cp, mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const sourceRoot = path.resolve(projectRoot, "../../Codex");
const publicRoot = path.join(projectRoot, "public/games");
const supported = new Set([".png", ".jpg", ".jpeg", ".webp", ".avif", ".gif", ".mp3", ".m4a", ".aac", ".wav", ".ogg"]);
const games = {
  "Space Invader Sweep": { slug: "space-invader-sweep", folder: "space-invader" },
  "Pac-Mask Chase": { slug: "pac-mask-chase", folder: "pac-mask" },
  Slither: { slug: "slither", folder: "slither" }
};
const aliases = {
  "space-invader-sweep": [["player-ship", /player|hero|ship/i], ["enemy-scout", /enemy|invader|scout/i], ["projectile-player", /player.*(bolt|shot|projectile)|laser/i], ["projectile-enemy", /enemy.*(bolt|shot|projectile)/i], ["shield", /shield/i], ["background-primary", /background|arena|nebula|space/i], ["ambient-loop", /ambient|music|loop/i]],
  "pac-mask-chase": [["player-mask", /player|pac|hero|mask/i], ["enemy-ghost", /enemy|ghost/i], ["maze-wall", /maze|wall|tile/i], ["pellet-power", /power.*pellet|pellet.*power/i], ["background-primary", /background|arena|lab|temple/i], ["ambient-loop", /ambient|music|loop/i]],
  slither: [["snake-head", /snake.*head|head/i], ["snake-eyes", /snake.*eyes|eyes/i], ["snake-body", /snake.*body|body|segment/i], ["snake-tail", /snake.*tail|tail/i], ["food-rare", /rare.*food|food.*rare|orb/i], ["boost-effect", /boost|trail/i], ["background-primary", /background|arena|matrix|swamp/i], ["ambient-loop", /ambient|music|loop/i]]
};

function safeName(name) {
  const extension = path.extname(name).toLowerCase();
  const stem = path.basename(name, extension).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "asset";
  return `${stem}${extension}`;
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else if (supported.has(path.extname(entry.name).toLowerCase())) files.push(full);
  }
  return files;
}

const registry = { generatedAt: new Date().toISOString(), assets: [] };
for (const [sourceName, game] of Object.entries(games)) {
  const source = path.join(sourceRoot, sourceName);
  for (const file of await walk(source)) {
    const relative = path.relative(source, file);
    const category = path.dirname(relative).split(path.sep)[0].toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const fileName = safeName(path.basename(file));
    const destinationDirectory = path.join(publicRoot, game.folder, category);
    await mkdir(destinationDirectory, { recursive: true });
    await cp(file, path.join(destinationDirectory, fileName));
    const slot = aliases[game.slug].find(([, pattern]) => pattern.test(path.basename(file)))?.[0] || `${category}-${path.basename(file, path.extname(file)).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    registry.assets.push({ gameSlug: game.slug, slotId: slot, url: `/games/${game.folder}/${category}/${fileName}`, source: relative, pack: "codex-master" });
  }
}
await mkdir(publicRoot, { recursive: true });
await writeFile(path.join(publicRoot, "asset-registry.json"), `${JSON.stringify(registry, null, 2)}\n`);
console.log(`Game asset registry contains ${registry.assets.length} Codex asset(s).`);
