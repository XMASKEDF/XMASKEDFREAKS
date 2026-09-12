export function leaderboardPosition(score: number, orderedScores: number[]) {
  return 1 + orderedScores.filter((entry) => entry > score).length;
}
