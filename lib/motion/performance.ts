export type PerformanceMode = "FULL" | "BALANCED" | "REDUCED";

export const FRAME_BUDGET_MS = 1000 / 60;
export const LONG_FRAME_MS = 50;
const modeCost: Record<PerformanceMode, number> = { FULL: 0, BALANCED: 1, REDUCED: 2 };

export function moreConservativeMode(first: PerformanceMode, second: PerformanceMode): PerformanceMode {
  return modeCost[first] >= modeCost[second] ? first : second;
}

export function selectAdaptiveMode(input: { fps: number; longFrameRate: number; current: PerformanceMode; constrainedDevice?: boolean }): PerformanceMode {
  if (input.constrainedDevice) return "BALANCED";
  if (input.current !== "REDUCED" && (input.fps < 45 || input.longFrameRate >= 12)) return "REDUCED";
  if (input.current === "FULL" && (input.fps < 54 || input.longFrameRate >= 5)) return "BALANCED";
  if (input.current === "REDUCED" && input.fps >= 56 && input.longFrameRate < 3) return "BALANCED";
  if (input.current === "BALANCED" && input.fps >= 58 && input.longFrameRate < 2) return "FULL";
  return input.current;
}

export function clampFrameDelta(milliseconds: number) { return Math.min(100, Math.max(0, milliseconds)); }

