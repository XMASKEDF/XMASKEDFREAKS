import type { SnakeEntity } from "./types";

export function scoreFromSnake(player: SnakeEntity) {
  return Math.max(0, player.scoreValue + player.bonusScore);
}

export function levelFromScore(score: number) {
  return Math.max(1, Math.floor(score / 450) + 1);
}
