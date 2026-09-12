import { distance } from "./random";
import { snakeRadius } from "./snake";
import { SpatialHash } from "./spatial-hash";
import { FoodPellet, SnakeEntity } from "./types";

export type BodySegment = {
  snakeId: string;
  snakeMass: number;
  index: number;
};

export function collectFood(snake: SnakeEntity, food: FoodPellet[]) {
  const radius = snakeRadius(snake) + 4;
  const hash = new SpatialHash<FoodPellet>(38);
  food.forEach((pellet) => { if (pellet.alive) hash.insert(pellet.position, pellet); });
  const nearbyIds = new Set(hash.nearby(snake.head, radius + 12).map((entry) => entry.item.id));
  const eaten: FoodPellet[] = [];
  const remaining = food.filter((pellet) => {
    if (pellet.alive && nearbyIds.has(pellet.id) && distance(snake.head, pellet.position) <= radius + pellet.radius) {
      pellet.alive = false;
      eaten.push(pellet);
      return false;
    }
    return true;
  });
  return { eaten, remaining };
}

export function buildBodyHash(snakes: SnakeEntity[]) {
  const hash = new SpatialHash<BodySegment>(34);
  snakes.forEach((snake) => {
    snake.trail.forEach((point, index) => {
      if (index < 7 || !snake.alive) return;
      hash.insert(point, { snakeId: snake.id, snakeMass: snake.mass, index });
    });
  });
  return hash;
}

export function detectBodyHit(snake: SnakeEntity, bodyHash: SpatialHash<BodySegment>, now: number) {
  if (now < snake.spawnProtectedUntil) return null;
  const radius = snakeRadius(snake);
  return bodyHash.nearby(snake.head, radius + 8).find((entry) => {
    if (entry.item.snakeId === snake.id) return false;
    return distance(snake.head, entry.point) < radius + Math.max(4, entry.item.snakeMass / 36);
  })?.item || null;
}

export function resolveHeadToHead(snakes: SnakeEntity[], now: number) {
  const deaths = new Set<string>();
  for (let i = 0; i < snakes.length; i += 1) {
    for (let j = i + 1; j < snakes.length; j += 1) {
      const a = snakes[i];
      const b = snakes[j];
      if (!a.alive || !b.alive || now < a.spawnProtectedUntil || now < b.spawnProtectedUntil) continue;
      const hitRange = snakeRadius(a) + snakeRadius(b) - 1;
      if (distance(a.head, b.head) > hitRange) continue;
      const massGap = Math.abs(a.mass - b.mass);
      // Deterministic head-to-head rule: larger snake survives unless mass is nearly tied.
      if (massGap < 4) {
        deaths.add(a.id);
        deaths.add(b.id);
      } else {
        deaths.add(a.mass > b.mass ? b.id : a.id);
      }
    }
  }
  return deaths;
}
