export const FIXED_STEP_SECONDS = 1 / 60;
export const MAX_FRAME_SECONDS = 0.25;
export const PLAYER_MOVEMENT_MULTIPLIER = 1.32;

export type FixedStepClock = {
  previousSeconds: number;
  accumulator: number;
};

export function advanceFixedClock(clock: FixedStepClock, nowSeconds: number, update: (step: number) => void) {
  const delta = Math.min(MAX_FRAME_SECONDS, Math.max(0, nowSeconds - clock.previousSeconds));
  clock.previousSeconds = nowSeconds;
  clock.accumulator += delta;
  let steps = 0;
  while (clock.accumulator >= FIXED_STEP_SECONDS && steps < 15) {
    update(FIXED_STEP_SECONDS);
    clock.accumulator -= FIXED_STEP_SECONDS;
    steps += 1;
  }
  return steps;
}

export function isEditableTarget(target: EventTarget | null) {
  const element = target instanceof HTMLElement ? target : null;
  return Boolean(element?.closest("input, textarea, select, [contenteditable='true']"));
}

export type Rectangle = { x: number; y: number; width: number; height: number };

export function rectanglesOverlap(a: Rectangle, b: Rectangle) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export function circlesOverlap(ax: number, ay: number, ar: number, bx: number, by: number, br: number) {
  const dx = ax - bx;
  const dy = ay - by;
  const radius = ar + br;
  return dx * dx + dy * dy <= radius * radius;
}

export function sweptVerticalProjectileHit(
  x: number,
  previousY: number,
  nextY: number,
  halfWidth: number,
  target: Rectangle
) {
  if (x + halfWidth < target.x || x - halfWidth > target.x + target.width) return false;
  const top = Math.min(previousY, nextY);
  const bottom = Math.max(previousY, nextY);
  return bottom >= target.y && top <= target.y + target.height;
}

export function createScoreLedger() {
  const scored = new Set<string>();
  let score = 0;
  return {
    add(points: number, eventId: string) {
      if (!Number.isFinite(points) || points <= 0 || scored.has(eventId)) return 0;
      scored.add(eventId);
      score += Math.floor(points);
      return Math.floor(points);
    },
    value() { return score; },
    has(eventId: string) { return scored.has(eventId); }
  };
}

export function massToLength(mass: number) {
  return Math.max(18, Math.round(Math.max(0, mass) * 1.8));
}

export function massToRadius(mass: number) {
  return Math.min(14, Math.max(6, 5.5 + Math.max(0, mass) / 24));
}

export function validScorePayload(score: unknown, sessionSeconds: unknown) {
  const numericScore = Math.floor(Number(score));
  const numericDuration = Math.floor(Number(sessionSeconds));
  return Number.isFinite(numericScore)
    && numericScore >= 0
    && numericScore <= 10_000_000
    && Number.isFinite(numericDuration)
    && numericDuration >= 0
    && numericDuration <= 86_400;
}
