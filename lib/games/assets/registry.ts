import type { GameAssetPack } from "./types";

const image = "image/png,image/jpeg,image/webp,image/avif,image/gif";
const audio = "audio/mpeg,audio/mp4,audio/aac,audio/wav,audio/ogg";
const premiumAtlas = "/games/atlas/premium-arcade-entities.png";
const sprite = (x: number, y: number, width: number, height: number, chromaThreshold = 12) => ({ url: premiumAtlas, x, y, width, height, chromaThreshold });

export const GAME_ASSET_PACKS: Record<string, GameAssetPack> = {
  "space-invader-sweep": {
    id: "space-core",
    gameSlug: "space-invader-sweep",
    label: "Deep-space assault",
    version: 1,
    activeEnvironment: "nebula-frontier",
    environments: [
      { id: "nebula-frontier", label: "Nebula Frontier", background: ["#02030a", "#07152a", "#160b2e"], accent: "#52c7ff", secondary: "#ff4fba", fog: "rgba(92,76,255,.12)", particleDensity: 72, gridOpacity: 0.045, glow: 18 },
      { id: "asteroid-belt", label: "Asteroid Belt", background: ["#030303", "#17110b", "#26110b"], accent: "#ffad4f", secondary: "#ff4f70", fog: "rgba(255,117,48,.1)", particleDensity: 54, gridOpacity: 0.025, glow: 16 }
    ],
    slots: [
      { id: "background-primary", label: "Arena background", category: "backgrounds", kind: "image", atlas: sprite(1297, 45, 220, 160, 0), accept: image, description: "Full-arena art rendered beneath parallax layers." },
      { id: "player-ship", label: "Player ship", category: "player", kind: "image", atlas: sprite(16, 68, 112, 188), accept: image, description: "Transparent ship artwork centered on the player collider." },
      { id: "enemy-scout", label: "Enemy scout", category: "enemies", kind: "image", atlas: sprite(515, 35, 72, 60), accept: image, description: "Green scout artwork for the front formation." },
      { id: "enemy-striker", label: "Enemy striker", category: "enemies", kind: "image", atlas: sprite(515, 92, 72, 62), accept: image, description: "Violet striker artwork for the middle formation." },
      { id: "enemy-raider", label: "Enemy raider", category: "enemies", kind: "image", atlas: sprite(515, 145, 72, 66), accept: image, description: "Red raider artwork for the rear formation." },
      { id: "enemy-boss", label: "Enemy boss", category: "enemies", kind: "image", atlas: sprite(510, 202, 125, 64), accept: image, description: "Heavy enemy artwork reserved for advanced waves." },
      { id: "shield", label: "Shield", category: "powerups", kind: "image", atlas: sprite(1085, 56, 75, 90), accept: image, description: "Destructible shield surface." },
      { id: "projectile-player", label: "Player projectile", category: "projectiles", kind: "image", atlas: sprite(870, 52, 46, 120), accept: image, description: "Player weapon bolt." },
      { id: "projectile-enemy", label: "Enemy projectile", category: "projectiles", kind: "image", atlas: sprite(920, 55, 48, 118), accept: image, description: "Enemy weapon bolt." },
      { id: "explosion", label: "Explosion", category: "effects", kind: "image", atlas: sprite(858, 175, 88, 82), accept: image, description: "Animated impact burst layer." },
      { id: "ambient-loop", label: "Ambient loop", category: "audio", kind: "audio", accept: audio, description: "Low-priority game ambience; muted by default." }
    ]
  },
  "pac-mask-chase": {
    id: "pac-mask-core",
    gameSlug: "pac-mask-chase",
    label: "Cyber maze",
    version: 1,
    activeEnvironment: "cyber-maze",
    environments: [
      { id: "cyber-maze", label: "Cyber Maze", background: ["#020106", "#0b0621", "#12082d"], accent: "#a667ff", secondary: "#ff3ea5", fog: "rgba(92,55,255,.1)", particleDensity: 34, gridOpacity: 0.035, glow: 14 },
      { id: "underground-lab", label: "Underground Lab", background: ["#020504", "#071611", "#0d241b"], accent: "#7dff9b", secondary: "#52c7ff", fog: "rgba(56,255,164,.08)", particleDensity: 28, gridOpacity: 0.05, glow: 12 }
    ],
    slots: [
      { id: "background-primary", label: "Maze background", category: "backgrounds", kind: "image", accept: image, description: "Atmospheric art beneath the maze." },
      { id: "maze-wall", label: "Maze wall tile", category: "maze", kind: "image", atlas: sprite(1032, 423, 88, 118), accept: image, description: "Repeatable wall texture." },
      { id: "player-mask", label: "Player character", category: "player", kind: "image", atlas: sprite(18, 447, 88, 112), accept: image, description: "Front-facing masked character artwork." },
      { id: "enemy-ghost-red", label: "Red enemy", category: "enemies", kind: "image", atlas: sprite(386, 443, 76, 112), accept: image, description: "Aggressive red enemy personality." },
      { id: "enemy-ghost-pink", label: "Pink enemy", category: "enemies", kind: "image", atlas: sprite(462, 443, 75, 112), accept: image, description: "Ambush pink enemy personality." },
      { id: "enemy-ghost-blue", label: "Blue enemy", category: "enemies", kind: "image", atlas: sprite(538, 443, 77, 112), accept: image, description: "Scatter blue enemy personality." },
      { id: "enemy-ghost-orange", label: "Orange enemy", category: "enemies", kind: "image", atlas: sprite(614, 443, 77, 112), accept: image, description: "Wandering orange enemy personality." },
      { id: "pellet-power", label: "Power pellet", category: "food", kind: "image", atlas: sprite(742, 444, 65, 84), accept: image, description: "Power-state collectible." },
      { id: "portal", label: "Portal", category: "effects", kind: "image", atlas: sprite(948, 437, 68, 106), accept: image, description: "Animated maze portal effect." },
      { id: "ambient-loop", label: "Ambient loop", category: "audio", kind: "audio", accept: audio, description: "Low-priority maze ambience; muted by default." }
    ]
  },
  slither: {
    id: "slither-core",
    gameSlug: "slither",
    label: "Dark-matter arena",
    version: 1,
    activeEnvironment: "dark-matter",
    environments: [
      { id: "dark-matter", label: "Dark Matter", background: ["#010402", "#04120a", "#071b10"], accent: "#7dff9b", secondary: "#52c7ff", fog: "rgba(29,255,112,.08)", particleDensity: 42, gridOpacity: 0.06, glow: 16 },
      { id: "digital-matrix", label: "Digital Matrix", background: ["#010304", "#03151a", "#071f27"], accent: "#4ce7ff", secondary: "#b65cff", fog: "rgba(76,231,255,.08)", particleDensity: 48, gridOpacity: 0.07, glow: 17 }
    ],
    slots: [
      { id: "background-primary", label: "Arena background", category: "backgrounds", kind: "image", atlas: sprite(1261, 727, 126, 98, 0), accept: image, description: "Large seamless arena texture." },
      { id: "snake-head", label: "Snake head", category: "player", kind: "image", atlas: sprite(12, 738, 82, 145), accept: image, description: "Green armored head skin aligned to travel direction." },
      { id: "snake-head-red", label: "Red snake head", category: "player", kind: "image", atlas: sprite(84, 738, 82, 145), accept: image, description: "Red armored head skin." },
      { id: "snake-head-blue", label: "Blue snake head", category: "player", kind: "image", atlas: sprite(156, 738, 82, 145), accept: image, description: "Blue armored head skin." },
      { id: "snake-head-purple", label: "Purple snake head", category: "player", kind: "image", atlas: sprite(228, 738, 82, 145), accept: image, description: "Purple armored head skin." },
      { id: "snake-head-gold", label: "Gold snake head", category: "player", kind: "image", atlas: sprite(300, 738, 82, 145), accept: image, description: "Gold armored head skin." },
      { id: "snake-head-black", label: "Black snake head", category: "player", kind: "image", atlas: sprite(372, 738, 82, 145), accept: image, description: "Black armored head skin." },
      { id: "snake-eyes", label: "Snake eyes", category: "player", kind: "image", accept: image, description: "Transparent animated eye layer drawn above the head." },
      { id: "snake-body", label: "Snake body", category: "player", kind: "image", atlas: sprite(484, 731, 67, 155), accept: image, description: "Repeatable green armored body segment." },
      { id: "snake-body-red", label: "Red snake body", category: "player", kind: "image", atlas: sprite(548, 731, 66, 155), accept: image, description: "Repeatable red armored body segment." },
      { id: "snake-body-blue", label: "Blue snake body", category: "player", kind: "image", atlas: sprite(611, 731, 66, 155), accept: image, description: "Repeatable blue armored body segment." },
      { id: "snake-body-purple", label: "Purple snake body", category: "player", kind: "image", atlas: sprite(674, 731, 66, 155), accept: image, description: "Repeatable purple armored body segment." },
      { id: "snake-body-black", label: "Black snake body", category: "player", kind: "image", atlas: sprite(737, 731, 65, 155), accept: image, description: "Repeatable black armored body segment." },
      { id: "snake-tail", label: "Snake tail", category: "player", kind: "image", atlas: sprite(484, 731, 67, 155), accept: image, description: "Tapered armored tail skin." },
      { id: "food-rare", label: "Rare energy orb", category: "food", kind: "image", atlas: sprite(808, 740, 42, 45), accept: image, description: "Premium food artwork for higher-value pellets." },
      { id: "boost-effect", label: "Boost trail", category: "effects", kind: "image", atlas: sprite(1048, 724, 205, 76), accept: image, description: "Transparent boost particle texture." },
      { id: "ambient-loop", label: "Ambient loop", category: "audio", kind: "audio", accept: audio, description: "Low-priority arena ambience; muted by default." }
    ]
  }
};

export function getGameAssetPack(slug: string) {
  return GAME_ASSET_PACKS[slug] || null;
}
