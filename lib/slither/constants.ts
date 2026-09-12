import type { SnakePalette } from "./types.ts";

export const ARENA_WIDTH = 1260;
export const ARENA_HEIGHT = 880;
export const CANVAS_WIDTH = 286;
export const CANVAS_HEIGHT = 140;
export const INITIAL_FOOD_COUNT = 95;
export const MAX_FOOD_COUNT = 140;
export const BOT_COUNT = 7;
export const BASE_SPEED = 126;
export const BOOST_SPEED = 188;
export const PLAYER_MOVEMENT_MULTIPLIER = 1.32;
export const BASE_TURN_RATE = 3.35;
export const PLAYER_START_MASS = 28;

export const SNAKE_PALETTES: SnakePalette[] = [
  { id: "xmf-green", label: "XMF Green", primary: "#7dff9b", secondary: "#1f9d55", glow: "rgba(125, 255, 155, 0.72)" },
  { id: "violet-pulse", label: "Violet Pulse", primary: "#a855f7", secondary: "#62ddff", glow: "rgba(168, 85, 247, 0.7)" },
  { id: "crimson-heat", label: "Crimson Heat", primary: "#ff4f8b", secondary: "#ffb84d", glow: "rgba(255, 79, 139, 0.68)" },
  { id: "electric-blue", label: "Electric Blue", primary: "#62ddff", secondary: "#4f7cff", glow: "rgba(98, 221, 255, 0.7)" },
  { id: "gold-rush", label: "Gold Rush", primary: "#e4b45d", secondary: "#fff4b8", glow: "rgba(228, 180, 93, 0.7)" },
  { id: "arctic-white", label: "Arctic White", primary: "#ffffff", secondary: "#bfffe0", glow: "rgba(255, 255, 255, 0.68)" },
  { id: "sunset-gradient", label: "Sunset Gradient", primary: "#ffb84d", secondary: "#a855f7", glow: "rgba(255, 184, 77, 0.68)" }
];

export const DEFAULT_SETTINGS = {
  sound: false,
  reducedGlow: false,
  cameraZoom: 1,
  mobileSensitivity: 1
};
