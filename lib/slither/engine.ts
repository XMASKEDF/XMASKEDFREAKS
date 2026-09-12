import { ARENA_HEIGHT, ARENA_WIDTH, BASE_SPEED, DEFAULT_SETTINGS, MAX_FOOD_COUNT, PLAYER_START_MASS } from "./constants";
import { createBotSnakes, respawnBot, updateBotIntent } from "./bots";
import { buildBodyHash, collectFood, detectBodyHit, resolveHeadToHead } from "./collisions";
import { createBoostFood, respawnFood, seedFood, snakeToFood } from "./food";
import { playerRank } from "./leaderboard";
import { clamp, randomBetween } from "./random";
import { levelFromScore, scoreFromSnake } from "./scoring";
import { createSnake, getPalette, growSnake, moveSnake, sanitizePlayerName, snakeOutsideArena, steerSnake } from "./snake";
import { massToLength } from "../games/mechanics.ts";
import { SlitherGameState, SlitherInputState, SlitherSettings, SnakePaletteId, Vector } from "./types";

export function createInitialState(name: string, paletteId: SnakePaletteId, settings: SlitherSettings = DEFAULT_SETTINGS): SlitherGameState {
  const now = performance.now() / 1000;
  const simulationNow = 0;
  const player = createSnake({
    id: "player",
    name: sanitizePlayerName(name),
    palette: getPalette(paletteId),
    position: { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2 },
    direction: -Math.PI / 10,
    isPlayer: true,
    mass: PLAYER_START_MASS,
    now: simulationNow
  });
  player.speed = BASE_SPEED * clamp(settings.mobileSensitivity, 0.82, 1.22);
  return {
    phase: "running",
    elapsedSeconds: 0,
    startedAt: now,
    endedAt: null,
    player,
    bots: createBotSnakes(simulationNow),
    food: seedFood(),
    score: 0,
    level: 1,
    arenaSize: { x: ARENA_WIDTH, y: ARENA_HEIGHT },
    message: "Grow longer. Outlive everyone.",
    lastFrameAt: now,
    peakMass: player.mass
  };
}

function playerDesiredDirection(player: Vector, input: SlitherInputState, currentDirection: number) {
  if (input.pointer) return Math.atan2(input.pointer.y - player.y, input.pointer.x - player.x);
  if (input.keyboardTurn !== 0) return currentDirection + input.keyboardTurn * 0.08;
  return currentDirection;
}

export function updateGame(state: SlitherGameState, input: SlitherInputState, delta: number): SlitherGameState {
  if (state.phase !== "running") return state;
  const now = state.elapsedSeconds + delta;
  const player = { ...state.player, trail: [...state.player.trail], head: { ...state.player.head }, previousHead: { ...state.player.previousHead } };
  const bots = state.bots.map((bot) => ({ ...bot, trail: [...bot.trail], head: { ...bot.head }, previousHead: { ...bot.previousHead } }));
  let food = [...state.food];
  steerSnake(player, playerDesiredDirection(player.head, input, player.direction), delta);
  moveSnake(player, delta, input.boost);
  if (player.boostEmissionAccumulator >= 0.6) {
    food.push(createBoostFood(player, Math.min(0.6, player.boostEmissionAccumulator)));
    player.boostEmissionAccumulator -= 0.6;
  }

  bots.forEach((bot) => {
    if (!bot.alive) return;
    updateBotIntent(bot, player, food, delta, now);
    moveSnake(bot, delta, Math.random() < 0.015 && bot.mass > 18);
  });

  const allSnakes = [player, ...bots];
  allSnakes.forEach((snake) => {
    if (!snake.alive) return;
    const result = collectFood(snake, food);
    food = result.remaining;
    result.eaten.forEach((pellet) => {
      growSnake(snake, pellet.value);
      snake.scoreValue += Math.max(0, pellet.scoreValue - Math.max(1, Math.floor(pellet.value * 10)));
    });
  });

  const bodyHash = buildBodyHash(allSnakes);
  const headDeaths = resolveHeadToHead(allSnakes, now);
  const deathCredits = new Map<string, string>();
  allSnakes.forEach((snake) => {
    if (!snake.alive) return;
    const bodyHit = detectBodyHit(snake, bodyHash, now);
    if (headDeaths.has(snake.id) || bodyHit || snakeOutsideArena(snake)) {
      snake.alive = false;
      if (bodyHit) deathCredits.set(snake.id, bodyHit.snakeId);
    }
  });

  deathCredits.forEach((killerId) => {
    const killer = allSnakes.find((snake) => snake.id === killerId);
    if (killer?.alive) { killer.kills += 1; killer.bonusScore += 100; }
  });

  let message = state.message;
  if (!player.alive && !player.deathProcessed) {
    player.deathProcessed = true;
    food = [...food, ...snakeToFood(player)];
    message = "You were cut off. Final score locked.";
  }

  const nextBots = bots.map((bot) => {
    if (bot.alive) return bot;
    if (bot.deathProcessed) return bot;
    bot.deathProcessed = true;
    food = [...food, ...snakeToFood(bot)];
    return respawnBot(bot, now);
  });

  if (Math.random() < 0.12) {
    food = respawnFood(food, Math.min(MAX_FOOD_COUNT, 96 + Math.floor(player.mass / 3)));
  }

  const score = scoreFromSnake(player);
  const level = levelFromScore(score);
  if (level > state.level) {
    message = `Level ${level}: rival snakes move faster.`;
    nextBots.forEach((bot) => {
      bot.speed += randomBetween(2, 5);
    });
  }

  return {
    ...state,
    phase: player.alive ? "running" : "game-over",
    elapsedSeconds: now,
    endedAt: player.alive ? null : performance.now() / 1000,
    player,
    bots: nextBots,
    food,
    score,
    level,
    message,
    lastFrameAt: performance.now() / 1000,
    peakMass: Math.max(state.peakMass, player.mass)
  };
}

export function snapshotFromState(state: SlitherGameState) {
  const snakes = [state.player, ...state.bots].sort((a, b) => b.mass - a.mass);
  return {
    phase: state.phase,
    elapsedSeconds: state.elapsedSeconds,
    score: state.score,
    level: state.level,
    mass: state.player.mass,
    playerName: state.player.name,
    playerAlive: state.player.alive,
    longestSnake: snakes[0]?.name || state.player.name,
    rank: playerRank(state.player, state.bots),
    foodCount: state.food.length,
    botCount: state.bots.length,
    message: state.message,
    length: massToLength(state.player.mass),
    peakLength: massToLength(state.peakMass),
    kills: state.player.kills
  };
}
