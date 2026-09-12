"use client";

import Link from "next/link";
import StoreHeader from "@/components/store/StoreHeader";
import { useI18n } from "@/components/I18nProvider";
import GameCard from "@/components/games/GameCard";
import { GamesBoundary } from "@/components/games/GamesErrorBoundary";
import type { GameItem } from "@/lib/config";
import RecentGamesPlayed from "@/components/games/RecentGamesPlayed";

export default function GamesCatalogPage({ games, globalScores, gamesEnabled }: { games: GameItem[]; globalScores: Record<string, number>; gamesEnabled: boolean }) {
  const { t } = useI18n();
  return <main className="games-route">
    <StoreHeader />
    <section className="games-command-hero"><p className="kicker">{t("gamesRoute.kicker")}</p><h1>{t("gamesRoute.title")}</h1><p>{t("gamesRoute.copy")}</p></section>
    {gamesEnabled ? <><RecentGamesPlayed /><section className="game-library games-route-grid" aria-label={t("gamesRoute.available")}>{games.map((game) => <GamesBoundary componentName="GameCard" gameId={game.id} compact key={game.id}><GameCard game={game} personalBest={0} globalBest={globalScores[game.id] || 0} /></GamesBoundary>)}</section></> : <section className="games-unavailable" role="status" aria-live="polite"><p className="kicker">{t("gamesRoute.offlineKicker")}</p><h2>{t("gamesRoute.offlineTitle")}</h2><p>{t("gamesRoute.offlineCopy")}</p><Link className="primary" href="/#live">{t("gamesRoute.returnLive")}</Link></section>}
  </main>;
}
