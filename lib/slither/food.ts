import { ARENA_HEIGHT, ARENA_WIDTH, INITIAL_FOOD_COUNT, MAX_FOOD_COUNT } from "./constants";
import { pickOne, randomBetween, randomPoint } from "./random";
import { FoodPellet, SnakeEntity, Vector } from "./types";

const FOOD_COLORS = ["#7dff9b", "#a855f7", "#62ddff", "#e4b45d", "#ff4f8b", "#ffffff"];

export function createFoodPellet(id: string, position: Vector = randomPoint(ARENA_WIDTH, ARENA_HEIGHT, 24), value?: number, source: FoodPellet["source"] = "ambient"): FoodPellet {
  const nextValue = value ?? randomBetween(0.8, 3.2);
  return {
    id,
    position,
    value: nextValue,
    scoreValue: Math.max(1, Math.floor(nextValue * 10)),
    radius: 1.8 + nextValue,
    color: pickOne(FOOD_COLORS),
    source,
    alive: true,
    spawnTime: Date.now() / 1000
  };
}

export function seedFood(count = INITIAL_FOOD_COUNT) {
  return Array.from({ length: count }, (_, index) => createFoodPellet(`food-${index}`));
}

export function respawnFood(food: FoodPellet[], count = MAX_FOOD_COUNT) {
  const next = [...food];
  while (next.length < count) {
    next.push(createFoodPellet(`food-${Date.now()}-${next.length}-${Math.random().toString(36).slice(2, 6)}`));
  }
  return next;
}

export function snakeToFood(snake: SnakeEntity) {
  const step = Math.max(3, Math.floor(snake.trail.length / 18));
  return snake.trail
    .filter((_, index) => index % step === 0)
    .slice(0, 22)
    .map((point, index) => createFoodPellet(`drop-${snake.id}-${Date.now()}-${index}`, { x: point.x + (index % 3 - 1) * 4, y: point.y + ((index + 1) % 3 - 1) * 4 }, Math.max(1.5, snake.mass / 18), "defeated-snake"));
}

export function createBoostFood(snake: SnakeEntity, value: number) {
  const tail = snake.trail[snake.trail.length - 1] || snake.head;
  return createFoodPellet(`boost-${snake.id}-${Date.now()}-${snake.trail.length}`, { ...tail }, Math.max(0.4, value), "boosted-tail");
}
