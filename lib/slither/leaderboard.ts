import { SnakeEntity, SlitherScoreEntry } from "./types";

export type SlitherRankEntry = {
  id: string;
  name: string;
  length: number;
  score: number;
  isPlayer: boolean;
};

export function rankSnakes(player: SnakeEntity, bots: SnakeEntity[]): SlitherRankEntry[] {
  return [player, ...bots]
    .filter((snake) => snake.alive)
    .map((snake) => ({
      id: snake.id,
      name: snake.name,
      length: Math.round(snake.mass),
      score: snake.scoreValue,
      isPlayer: snake.isPlayer
    }))
    .sort((a, b) => b.length - a.length);
}

export function playerRank(player: SnakeEntity, bots: SnakeEntity[]) {
  const ranked = rankSnakes(player, bots);
  const index = ranked.findIndex((entry) => entry.isPlayer);
  return index === -1 ? ranked.length : index + 1;
}

export function mergeLeaderboardScores(local: SlitherScoreEntry[], personalBest: number, publicBest: number) {
  return [
    ...local,
    personalBest > 0 ? { name: "Personal best", score: personalBest } : null,
    publicBest > 0 ? { name: "Public best", score: publicBest } : null
  ]
    .filter(Boolean)
    .sort((a, b) => (b?.score || 0) - (a?.score || 0))
    .slice(0, 5) as SlitherScoreEntry[];
}
