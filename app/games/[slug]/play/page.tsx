import { notFound } from "next/navigation";
import type { Metadata } from "next";
import GamePlayClient from "@/components/games/GamePlayClient";
import { getGameBySlug, getGameLeaderboardScores } from "@/lib/games/catalog";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const game = await getGameBySlug(params.slug);
  return { title: game ? `${game.title} | XMASKEDFREAKS` : "Game | XMASKEDFREAKS" };
}

export default async function GamePlayPage({ params }: { params: { slug: string } }) {
  const game = await getGameBySlug(params.slug);
  if (!game) notFound();
  const leaderboardScores = await getGameLeaderboardScores(game.id);
  return <GamePlayClient game={game} globalBest={leaderboardScores[0] || 0} leaderboardScores={leaderboardScores} />;
}
