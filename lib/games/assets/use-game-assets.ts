"use client";

import { useEffect, useMemo, useState } from "react";
import { gameAssetManager, mergeAssetOverrides } from "./asset-manager";
import { getGameAssetPack } from "./registry";
import type { GameAssetOverride, ResolvedGameAssetPack } from "./types";

export function useGameAssets(gameSlug: string) {
  const base = useMemo(() => getGameAssetPack(gameSlug), [gameSlug]);
  const [overrides, setOverrides] = useState<GameAssetOverride[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch("/games/asset-registry.json", { signal: controller.signal }).then((response) => response.ok ? response.json() : { assets: [] }),
      fetch(`/api/games/assets/${gameSlug}`, { signal: controller.signal }).then((response) => response.ok ? response.json() : { assets: [] })
    ])
      .then(([local, remote]) => {
        const localAssets = Array.isArray(local.assets) ? local.assets.filter((asset: { gameSlug?: string }) => asset.gameSlug === gameSlug).map((asset: { slotId: string; url: string; source?: string }) => ({ slotId: asset.slotId, url: asset.url, mimeType: "image/*", fileName: asset.source || asset.slotId, updatedAt: local.generatedAt || "build" })) : [];
        const remoteAssets = Array.isArray(remote.assets) ? remote.assets : [];
        const remoteSlots = new Set(remoteAssets.map((asset: GameAssetOverride) => asset.slotId));
        setOverrides([...localAssets.filter((asset: GameAssetOverride) => !remoteSlots.has(asset.slotId)), ...remoteAssets]);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [gameSlug]);

  const pack = useMemo<ResolvedGameAssetPack | null>(() => base ? mergeAssetOverrides(base, overrides) : null, [base, overrides]);
  useEffect(() => { if (pack) void gameAssetManager.preload(pack); }, [pack]);
  return pack;
}
