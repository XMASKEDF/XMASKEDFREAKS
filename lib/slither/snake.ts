import { ARENA_HEIGHT, ARENA_WIDTH, BASE_SPEED, BASE_TURN_RATE, BOOST_SPEED, PLAYER_MOVEMENT_MULTIPLIER, PLAYER_START_MASS, SNAKE_PALETTES } from "./constants";
import { massToLength, massToRadius } from "../games/mechanics.ts";
import { clamp, normalizeAngle, randomPoint } from "./random";
import { SnakeEntity, SnakePalette, SnakePaletteId, Vector } from "./types";

export function getPalette(id: SnakePaletteId): SnakePalette {
  return SNAKE_PALETTES.find((palette) => palette.id === id) || SNAKE_PALETTES[0];
}

export function sanitizePlayerName(name: string) {
  return name.replace(/[^\p{L}\p{N}_ -]/gu, "").trim().slice(0, 18) || "Player";
}

export function createSnake(options: {
  id: string;
  name: string;
  palette: SnakePalette;
  position?: Vector;
  direction?: number;
  isPlayer?: boolean;
  mass?: number;
  now: number;
}): SnakeEntity {
  const head = options.position || randomPoint(ARENA_WIDTH, ARENA_HEIGHT, 120);
  const direction = options.direction ?? Math.random() * Math.PI * 2;
  const mass = options.mass || PLAYER_START_MASS;
  return {
    id: options.id,
    name: sanitizePlayerName(options.name),
    palette: options.palette,
    head,
    previousHead: { ...head },
    direction,
    desiredDirection: direction,
    speed: BASE_SPEED * (options.isPlayer ? PLAYER_MOVEMENT_MULTIPLIER : 1),
    normalSpeed: BASE_SPEED * (options.isPlayer ? PLAYER_MOVEMENT_MULTIPLIER : 1),
    boostSpeed: BOOST_SPEED * (options.isPlayer ? PLAYER_MOVEMENT_MULTIPLIER : 1),
    turnRate: BASE_TURN_RATE,
    mass,
    targetLength: massToLength(mass) * 3.2,
    trail: Array.from({ length: 28 }, (_, index) => ({
      x: head.x - Math.cos(direction) * index * 4,
      y: head.y - Math.sin(direction) * index * 4
    })),
    alive: true,
    isPlayer: Boolean(options.isPlayer),
    spawnProtectedUntil: options.now + 2.2,
    scoreValue: 0,
    bonusScore: 0,
    kills: 0,
    boosting: false,
    boostEmissionAccumulator: 0,
    deathProcessed: false,
    aiState: "wander"
  };
}

export function steerSnake(snake: SnakeEntity, desiredDirection: number, delta: number) {
  const weightPenalty = clamp((snake.mass - PLAYER_START_MASS) / 160, 0, 0.42);
  const maxTurn = snake.turnRate * (1 - weightPenalty) * delta;
  const diff = normalizeAngle(desiredDirection - snake.direction);
  snake.direction = normalizeAngle(snake.direction + clamp(diff, -maxTurn, maxTurn));
  snake.desiredDirection = desiredDirection;
}

export function moveSnake(snake: SnakeEntity, delta: number, boosting: boolean) {
  const boostAllowed = boosting && snake.mass > 18;
  snake.boosting = boostAllowed;
  const targetSpeed = boostAllowed ? snake.boostSpeed : snake.normalSpeed;
  snake.speed += (targetSpeed - snake.speed) * Math.min(1, delta * 8);
  snake.previousHead = { ...snake.head };
  snake.head = { x: snake.head.x + Math.cos(snake.direction) * snake.speed * delta, y: snake.head.y + Math.sin(snake.direction) * snake.speed * delta };
  snake.trail.unshift({ ...snake.head });
  const maxTrail = Math.max(18, Math.floor(snake.targetLength / 3.2));
  if (snake.trail.length > maxTrail) snake.trail.length = maxTrail;
  if (boostAllowed) {
    const before = snake.mass;
    snake.mass = Math.max(16, snake.mass - delta * 3.4);
    snake.targetLength = Math.max(50, massToLength(snake.mass) * 3.2);
    snake.boostEmissionAccumulator += before - snake.mass;
    return before - snake.mass;
  }
  return 0;
}

export function growSnake(snake: SnakeEntity, value: number) {
  snake.mass += value;
  snake.targetLength = Math.max(snake.targetLength, massToLength(snake.mass) * 3.2);
  snake.scoreValue += Math.max(1, Math.floor(value * 10));
}

export function snakeRadius(snake: SnakeEntity) {
  return massToRadius(snake.mass);
}

export function snakeOutsideArena(snake: SnakeEntity) {
  const radius = snakeRadius(snake);
  return snake.head.x < radius || snake.head.y < radius || snake.head.x > ARENA_WIDTH - radius || snake.head.y > ARENA_HEIGHT - radius;
}
