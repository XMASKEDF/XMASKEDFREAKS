"use client";

import Image from "next/image";
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { gameAssetManager } from "@/lib/games/assets/asset-manager";
import { GAME_ASSET_PACKS } from "@/lib/games/assets/registry";
import type { GameAssetOverride, GameAssetPack, GameAssetSlot } from "@/lib/games/assets/types";

type Pending = { file: File; url: string };

function AssetSlotPreview({ pack, slot, source }: { pack: GameAssetPack; slot: GameAssetSlot; source?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (source || slot.kind !== "image") return;
    let active = true;
    void gameAssetManager.loadSlot(pack, slot.id).then((asset) => {
      const canvas = canvasRef.current;
      if (!active || !asset || !canvas) return;
      const width = asset instanceof HTMLImageElement ? asset.naturalWidth : asset.width;
      const height = asset instanceof HTMLImageElement ? asset.naturalHeight : asset.height;
      canvas.width = Math.max(1, width); canvas.height = Math.max(1, height);
      canvas.getContext("2d")?.drawImage(asset, 0, 0);
    });
    return () => { active = false; };
  }, [pack, slot, source]);
  if (source) return <Image src={source} alt={`${slot.label} preview`} fill sizes="(max-width: 520px) 100vw, (max-width: 1100px) 50vw, 33vw" unoptimized />;
  if (slot.kind === "image" && slot.atlas) return <canvas ref={canvasRef} aria-label={`${slot.label} premium atlas preview`} />;
  return <span>{slot.kind === "audio" ? "AUDIO" : "PROCEDURAL DEFAULT"}</span>;
}

export default function GameAssetManager() {
  const packs = Object.values(GAME_ASSET_PACKS);
  const [gameSlug, setGameSlug] = useState(packs[0].gameSlug);
  const [assets, setAssets] = useState<GameAssetOverride[]>([]);
  const [pending, setPending] = useState<Record<string, Pending>>({});
  const pendingRef = useRef<Record<string, Pending>>({});
  const [status, setStatus] = useState("Select a slot to replace artwork without changing gameplay.");
  const pack = useMemo(() => GAME_ASSET_PACKS[gameSlug], [gameSlug]);

  useEffect(() => {
    fetch(`/api/games/assets/${gameSlug}`).then((response) => response.json()).then((result) => setAssets(result.assets || [])).catch(() => setAssets([]));
  }, [gameSlug]);
  useEffect(() => { pendingRef.current = pending; }, [pending]);
  useEffect(() => () => { Object.values(pendingRef.current).forEach((item) => URL.revokeObjectURL(item.url)); }, []);

  function choose(slotId: string, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    setPending((current) => {
      if (current[slotId]) URL.revokeObjectURL(current[slotId].url);
      return { ...current, [slotId]: { file, url: URL.createObjectURL(file) } };
    });
    setStatus(`${file.name} is ready to preview. Publish when approved.`);
  }

  async function publish(slotId: string) {
    const item = pending[slotId]; if (!item) return;
    setStatus("Validating and publishing asset...");
    const form = new FormData(); form.set("gameSlug", gameSlug); form.set("slotId", slotId); form.set("asset", item.file);
    const response = await fetch("/api/admin/games/assets", { method: "POST", body: form }); const result = await response.json();
    if (!response.ok) { setStatus(result.error || "Unable to publish asset."); return; }
    setAssets((current) => [...current.filter((asset) => asset.slotId !== slotId), result.asset]);
    URL.revokeObjectURL(item.url); setPending((current) => { const next = { ...current }; delete next[slotId]; return next; });
    setStatus("Asset published. New game sessions will use it automatically.");
  }

  async function restore(slotId: string) {
    if (!window.confirm("Restore the procedural project default for this slot?")) return;
    const form = new FormData(); form.set("operation", "restore"); form.set("gameSlug", gameSlug); form.set("slotId", slotId);
    const response = await fetch("/api/admin/games/assets", { method: "POST", body: form }); const result = await response.json();
    if (!response.ok) { setStatus(result.error || "Unable to restore asset."); return; }
    setAssets((current) => current.filter((asset) => asset.slotId !== slotId)); setStatus("Project default restored.");
  }

  return <section className="game-asset-manager">
    <header><div><p className="kicker">ADMIN · Games · Assets</p><h2>Premium Asset Pipeline</h2><p>Published art hot-swaps into the renderer. Physics, scoring, collision, and controls remain unchanged.</p></div><label>Game<select value={gameSlug} onChange={(event) => setGameSlug(event.target.value)}>{packs.map((item) => <option value={item.gameSlug} key={item.gameSlug}>{item.label}</option>)}</select></label></header>
    <div className="asset-pack-summary"><span><small>Pack</small><strong>{pack.label}</strong></span><span><small>Environment</small><strong>{pack.environments.find((item) => item.id === pack.activeEnvironment)?.label}</strong></span><span><small>Registered slots</small><strong>{pack.slots.length}</strong></span><span><small>Custom assets</small><strong>{assets.length}</strong></span></div>
    <p className="admin-game-status" role="status">{status}</p>
    <div className="asset-slot-grid">{pack.slots.map((slot) => {
      const active = assets.find((asset) => asset.slotId === slot.id); const preview = pending[slot.id];
      return <article className="asset-slot-card" key={slot.id}><div className="asset-slot-preview"><AssetSlotPreview pack={pack} slot={slot} source={preview?.url || active?.url} /></div><div><p className="kicker">{slot.category}</p><h3>{slot.label}</h3><p>{slot.description}</p><small>{active ? `Published: ${active.fileName}` : slot.atlas ? "Premium entity atlas active" : "Using project fallback"}</small></div><label className="thumbnail-upload-label">Choose replacement<input type="file" accept={slot.accept} onChange={(event) => choose(slot.id, event)} /></label><div className="thumbnail-action-row"><button type="button" className="primary" disabled={!preview} onClick={() => publish(slot.id)}>Publish</button><button type="button" className="secondary" disabled={!active} onClick={() => restore(slot.id)}>Restore Default</button></div></article>;
    })}</div>
  </section>;
}
