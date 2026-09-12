"use client";

import { useEffect, useState } from "react";
import { readGameScores, type StoredGameScore } from "@/lib/games/scores";

export default function RecentGamesPlayed() {
  const [entries, setEntries] = useState<StoredGameScore[]>([]);
  useEffect(() => {
    const refresh = () => setEntries(readGameScores().filter((entry) => entry.metadata?.completed !== false).slice(-8).reverse());
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener("xmf-game-score-recorded", refresh);
    return () => { window.removeEventListener("storage", refresh); window.removeEventListener("xmf-game-score-recorded", refresh); };
  }, []);
  if (!entries.length) return null;
  return <section className="recent-games-played" aria-labelledby="recent-games-title"><div className="section-heading"><p className="kicker">GAME HISTORY</p><h2 id="recent-games-title">RECENT GAMES PLAYED</h2><p>Your latest completed sessions. Personal bests and public leaderboards continue to use the shared score service.</p></div><div className="recent-games-list">{entries.map((entry) => <article key={`${entry.sessionId || entry.createdAt}:${entry.gameId}`}><div><strong>{entry.gameTitle}</strong><small>{new Date(entry.createdAt).toLocaleDateString()} · {entry.sessionSeconds}s</small></div><span>Score: <b>{entry.score.toLocaleString()}</b>{typeof entry.metadata?.wave === "number" ? <small>Round {entry.metadata.wave}</small> : typeof entry.metadata?.level === "number" ? <small>Level {entry.metadata.level}</small> : null}</span></article>)}</div></section>;
}
