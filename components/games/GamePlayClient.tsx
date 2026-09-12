"use client";

import dynamic from "next/dynamic";
import type { GameItem } from "@/lib/config";
import GamePlayShell from "./GamePlayShell";
import type { GameRuntimeProps } from "./types";
import { GamesBoundary } from "./GamesErrorBoundary";
import { useI18n } from "@/components/I18nProvider";
import { loadGameModule } from "@/lib/games/recovery";

function RuntimeLoading() { const { t } = useI18n(); return <div className="game-load-state" role="status">{t("gamesRecovery.loading")}</div>; }
const SpaceInvaderGame = dynamic(() => loadGameModule(() => import("./space/SpaceInvaderGame")), { ssr: false, loading: RuntimeLoading });
const PacMaskGame = dynamic(() => loadGameModule(() => import("./pacmask/PacMaskGame")), { ssr: false, loading: RuntimeLoading });
const SlitherRuntime = dynamic(() => loadGameModule(() => import("./slither/SlitherRuntime")), { ssr: false, loading: RuntimeLoading });

export default function GamePlayClient({ game, globalBest, leaderboardScores }: { game: GameItem; globalBest: number; leaderboardScores: number[] }) {
  function renderRuntime(props: GameRuntimeProps) {
    if (game.kind === "space") return <SpaceInvaderGame {...props} />;
    if (game.kind === "pacman") return <PacMaskGame {...props} />;
    return <SlitherRuntime {...props} />;
  }

  return <GamesBoundary componentName="GameRuntime" gameId={game.id}><GamePlayShell game={game} globalBest={globalBest} leaderboardScores={leaderboardScores}>{renderRuntime}</GamePlayShell></GamesBoundary>;
}
