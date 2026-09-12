import type { GameAssetOverride, GameAssetPack, GameRenderableAsset, ResolvedGameAssetPack } from "./types";

class GameAssetManager {
  private images = new Map<string, Promise<HTMLImageElement | null>>();
  private sprites = new Map<string, Promise<GameRenderableAsset | null>>();
  private audio = new Map<string, HTMLAudioElement>();

  resolveUrl(pack: ResolvedGameAssetPack | GameAssetPack, slotId: string) {
    const override = "overrides" in pack ? pack.overrides.find((item) => item.slotId === slotId) : undefined;
    return override?.url || pack.slots.find((slot) => slot.id === slotId)?.defaultUrl || null;
  }

  loadImage(url: string | null) {
    if (!url || typeof window === "undefined") return Promise.resolve(null);
    const cached = this.images.get(url);
    if (cached) return cached;
    const pending = new Promise<HTMLImageElement | null>((resolve) => {
      const image = new window.Image();
      image.decoding = "async";
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = url;
    });
    this.images.set(url, pending);
    return pending;
  }

  loadSlot(pack: ResolvedGameAssetPack | GameAssetPack, slotId: string): Promise<GameRenderableAsset | null> {
    const overrideUrl = this.resolveUrl(pack, slotId);
    const slot = pack.slots.find((item) => item.id === slotId);
    if (overrideUrl) return this.loadImage(overrideUrl);
    if (!slot?.atlas || typeof window === "undefined") return Promise.resolve(null);
    const { atlas } = slot;
    const key = `${atlas.url}:${atlas.x}:${atlas.y}:${atlas.width}:${atlas.height}:${atlas.chromaThreshold || 0}`;
    const cached = this.sprites.get(key);
    if (cached) return cached;
    const pending = this.loadImage(atlas.url).then((source) => {
      if (!source) return null;
      const canvas = document.createElement("canvas");
      canvas.width = atlas.width;
      canvas.height = atlas.height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return null;
      context.drawImage(source, atlas.x, atlas.y, atlas.width, atlas.height, 0, 0, atlas.width, atlas.height);
      const threshold = atlas.chromaThreshold ?? 12;
      if (threshold > 0) {
        const image = context.getImageData(0, 0, canvas.width, canvas.height);
        for (let index = 0; index < image.data.length; index += 4) {
          const red = image.data[index]; const green = image.data[index + 1]; const blue = image.data[index + 2];
          if (red <= threshold && green <= threshold && blue <= threshold) image.data[index + 3] = 0;
        }
        context.putImageData(image, 0, 0);
      }
      return canvas;
    });
    this.sprites.set(key, pending);
    return pending;
  }

  preload(pack: ResolvedGameAssetPack) {
    return Promise.all(pack.slots.filter((slot) => slot.kind === "image").map((slot) => this.loadSlot(pack, slot.id)));
  }

  getAudio(url: string | null) {
    if (!url || typeof window === "undefined") return null;
    const existing = this.audio.get(url);
    if (existing) return existing;
    const element = new Audio(url);
    element.preload = "metadata";
    element.volume = 0.12;
    this.audio.set(url, element);
    return element;
  }

  clear(url?: string) {
    if (url) {
      this.images.delete(url);
      this.audio.delete(url);
      return;
    }
    this.images.clear();
    this.sprites.clear();
    this.audio.clear();
  }
}

export const gameAssetManager = new GameAssetManager();

export function mergeAssetOverrides(pack: GameAssetPack, overrides: GameAssetOverride[]): ResolvedGameAssetPack {
  return { ...pack, overrides };
}
