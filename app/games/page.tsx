import GamesPageClient from "@/components/games/GamesPageClient";
import { getGameCatalog, getGamesEnabled, getGlobalBestScores } from "@/lib/games/catalog";

export const dynamic = "force-dynamic";

export default async function GamesPage() {
  const [catalog, globalScores, gamesEnabled] = await Promise.all([getGameCatalog(), getGlobalBestScores(), getGamesEnabled()]);
  const games = catalog.filter((game) => game.enabled && !game.hidden).sort((a, b) => a.order - b.order);

  return <GamesPageClient games={games} globalScores={globalScores} gamesEnabled={gamesEnabled} />;
}
