"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { GamesBoundary } from "@/components/games/GamesErrorBoundary";
import GamesCatalogPage from "@/components/games/GamesCatalogPage";
import type { GameItem } from "@/lib/config";

function DevelopmentFaultInjector() {
  const search = useSearchParams();
  const fault = search.get("xmfGameFault");
  const [failure, setFailure] = useState<string | null>(null);
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (fault === "render") setFailure("Intentional Games recovery render test");
    if (fault === "render-once") {
      const key = "xmf-game-fault-rendered";
      if (!sessionStorage.getItem(key)) { sessionStorage.setItem(key, "1"); setFailure("Intentional one-time Games recovery test"); }
    }
  }, [fault]);
  if (failure) throw new Error(failure);
  return null;
}

export default function GamesPageClient({ games, globalScores, gamesEnabled }: { games: GameItem[]; globalScores: Record<string, number>; gamesEnabled: boolean }) {
  return <GamesBoundary componentName="GamesCatalog"><DevelopmentFaultInjector /><GamesCatalogPage games={games} globalScores={globalScores} gamesEnabled={gamesEnabled} /></GamesBoundary>;
}
