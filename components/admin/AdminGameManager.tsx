"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import type { GameItem } from "@/lib/config";

export default function AdminGameManager({ initialGames }: { initialGames: GameItem[] }) {
  const [games, setGames] = useState(initialGames);
  const [status, setStatus] = useState("Game catalog ready.");

  async function update(game: GameItem, patch: Record<string, unknown>) {
    setStatus(`Saving ${game.title}...`);
    const response = await fetch(`/api/admin/games/${game.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) { setStatus(result.error || "Unable to update game."); return; }
    setGames((items) => items.map((item) => item.id === game.id ? { ...item, ...patch, order: Number(patch.displayOrder || item.order) } : item));
    setStatus(`${game.title} saved.`);
  }

  function move(game: GameItem, direction: -1 | 1) {
    const ordered = [...games].sort((a, b) => a.order - b.order);
    const index = ordered.findIndex((item) => item.id === game.id); const target = index + direction;
    if (target < 0 || target >= ordered.length) return;
    const other = ordered[target];
    void Promise.all([update(game, { displayOrder: other.order }), update(other, { displayOrder: game.order })]);
  }

  return (
    <>
      <p className="admin-game-status" role="status">{status}</p>
      <div className="admin-games-table" role="table" aria-label="Game catalog management">
        <div className="admin-games-head" role="row">
          <span>Game</span><span>Category</span><span>Status</span><span>Order</span><span>Actions</span>
        </div>
        {games.sort((a, b) => a.order - b.order).map((game) => (
          <article className="admin-games-row" role="row" key={game.id}>
            <div className="admin-game-identity" role="cell">
              <span className="admin-game-thumb"><Image src={game.thumbnail || `/games/thumbnails/${game.slug}.svg`} alt="" fill sizes="120px" /></span>
              <span><strong>{game.title}</strong><small>{game.difficulty} · Updated {game.thumbnailUpdatedAt ? new Date(game.thumbnailUpdatedAt).toLocaleDateString("en-US") : "from defaults"}</small></span>
            </div>
            <span role="cell">{game.category}</span>
            <span role="cell"><b className={game.enabled && !game.hidden ? "status-on" : "status-off"}>{game.enabled && !game.hidden ? "Visible" : game.hidden ? "Hidden" : "Disabled"}</b>{game.featured ? <small>Featured</small> : null}</span>
            <span role="cell">#{game.order}</span>
            <div className="admin-game-actions" role="cell">
              <Link className="secondary" href={`/admin/games/${game.id}`}>Edit</Link>
              <button className="secondary" type="button" onClick={() => update(game, { enabled: !game.enabled })}>{game.enabled ? "Disable" : "Enable"}</button>
              <button className="secondary" type="button" onClick={() => update(game, { hidden: !game.hidden })}>{game.hidden ? "Show" : "Hide"}</button>
              <button className="secondary" type="button" onClick={() => update(game, { featured: !game.featured })}>{game.featured ? "Unfeature" : "Feature"}</button>
              <button className="secondary compact-icon" type="button" aria-label={`Move ${game.title} earlier`} onClick={() => move(game, -1)}>↑</button>
              <button className="secondary compact-icon" type="button" aria-label={`Move ${game.title} later`} onClick={() => move(game, 1)}>↓</button>
              <Link className="secondary" href={`/games/${game.slug}/play`}>Open Preview</Link>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
