export const GAME_KEYS = new Set([
  "arrowup",
  "arrowdown",
  "arrowleft",
  "arrowright",
  "w",
  "a",
  "s",
  "d",
  "p",
  "r",
  "escape",
  " "
]);

export type ArcadeMovementIntent = {
  horizontal: -1 | 0 | 1;
  vertical: -1 | 0 | 1;
};

/** Resolve held keys once per game tick so opposing keys cancel cleanly. */
export function getArcadeMovementIntent(keys: ReadonlySet<string>): ArcadeMovementIntent {
  const horizontal = (keys.has("arrowright") || keys.has("d") ? 1 : 0) - (keys.has("arrowleft") || keys.has("a") ? 1 : 0);
  const vertical = (keys.has("arrowdown") || keys.has("s") ? 1 : 0) - (keys.has("arrowup") || keys.has("w") ? 1 : 0);
  return {
    horizontal: Math.max(-1, Math.min(1, horizontal)) as -1 | 0 | 1,
    vertical: Math.max(-1, Math.min(1, vertical)) as -1 | 0 | 1
  };
}
