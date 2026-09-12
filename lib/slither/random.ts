import type { Vector } from "./types.ts";

export function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

export function randomPoint(width: number, height: number, padding = 48): Vector {
  return {
    x: randomBetween(padding, width - padding),
    y: randomBetween(padding, height - padding)
  };
}

export function pickOne<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function distance(a: Vector, b: Vector) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function normalizeAngle(angle: number) {
  let next = angle;
  while (next > Math.PI) next -= Math.PI * 2;
  while (next < -Math.PI) next += Math.PI * 2;
  return next;
}
