import { ARENA_HEIGHT, ARENA_WIDTH, BASE_SPEED, BOT_COUNT, SNAKE_PALETTES } from "./constants";
import { distance, pickOne, randomPoint } from "./random";
import { createSnake, steerSnake } from "./snake";
import { FoodPellet, SnakeEntity } from "./types";

const BOT_NAMES = ["Vesper", "Kilo", "Static", "Hex", "Pulse", "Rift", "Nyx", "Orbit"];

export function createBotSnakes(now: number) {
  return Array.from({ length: BOT_COUNT }, (_, index) => {
    const bot = createSnake({
      id: `bot-${index}`,
      name: BOT_NAMES[index] || `Bot ${index + 1}`,
      palette: SNAKE_PALETTES[(index + 1) % SNAKE_PALETTES.length],
      position: randomPoint(ARENA_WIDTH, ARENA_HEIGHT, 150),
      direction: Math.random() * Math.PI * 2,
      mass: 20 + Math.random() * 28,
      now
    });
    bot.speed = BASE_SPEED * (0.84 + Math.random() * 0.28);
    return bot;
  });
}

export function updateBotIntent(bot: SnakeEntity, player: SnakeEntity, food: FoodPellet[], delta: number, simulationTime: number) {
  const nearFood = food
    .filter((pellet) => distance(bot.head, pellet.position) < 260)
    .sort((a, b) => distance(bot.head, a.position) - distance(bot.head, b.position))[0];
  const edgePressure =
    bot.head.x < 80 || bot.head.x > ARENA_WIDTH - 80 || bot.head.y < 80 || bot.head.y > ARENA_HEIGHT - 80;
  const playerDistance = distance(bot.head, player.head);
  const personality = Number(bot.id.replace(/\D/g, "")) % 4;
  bot.aiState = edgePressure ? "avoidBoundary" : playerDistance < 110 ? "boostEscape" : personality === 0 && playerDistance < 300 ? "intercept" : nearFood ? "seekFood" : "wander";
  const forwardTarget = { x: bot.head.x + Math.cos(bot.direction) * 240, y: bot.head.y + Math.sin(bot.direction) * 240 };
  const target = edgePressure
    ? { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2 }
    : bot.aiState === "intercept" ? player.head : nearFood?.position || forwardTarget;
  const wobble = Math.sin(simulationTime * 2.4 + bot.mass) * 0.32;
  steerSnake(bot, Math.atan2(target.y - bot.head.y, target.x - bot.head.x) + wobble, delta);
}

export function respawnBot(bot: SnakeEntity, now: number) {
  const next = createSnake({
    id: bot.id,
    name: bot.name,
    palette: pickOne(SNAKE_PALETTES),
    position: randomPoint(ARENA_WIDTH, ARENA_HEIGHT, 150),
    direction: Math.random() * Math.PI * 2,
    mass: 18 + Math.random() * 22,
    now
  });
  next.isPlayer = false;
  return next;
}
