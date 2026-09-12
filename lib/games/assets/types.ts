export type GameAssetKind = "image" | "audio";

export type GameAssetCategory =
  | "backgrounds"
  | "player"
  | "enemies"
  | "projectiles"
  | "powerups"
  | "maze"
  | "food"
  | "ui"
  | "effects"
  | "audio";

export type GameAssetSlot = {
  id: string;
  label: string;
  category: GameAssetCategory;
  kind: GameAssetKind;
  defaultUrl?: string;
  atlas?: {
    url: string;
    x: number;
    y: number;
    width: number;
    height: number;
    chromaThreshold?: number;
  };
  accept: string;
  description: string;
};

export type GameRenderableAsset = HTMLImageElement | HTMLCanvasElement;

export type GameEnvironment = {
  id: string;
  label: string;
  background: [string, string, string];
  accent: string;
  secondary: string;
  fog: string;
  particleDensity: number;
  gridOpacity: number;
  glow: number;
};

export type GameAssetPack = {
  id: string;
  gameSlug: string;
  label: string;
  version: number;
  activeEnvironment: string;
  environments: GameEnvironment[];
  slots: GameAssetSlot[];
};

export type GameAssetOverride = {
  slotId: string;
  url: string;
  mimeType: string;
  fileName: string;
  updatedAt: string;
};

export type ResolvedGameAssetPack = GameAssetPack & {
  overrides: GameAssetOverride[];
};
