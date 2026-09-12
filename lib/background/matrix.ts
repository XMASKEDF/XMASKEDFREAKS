export const MATRIX_PRESET_KEY = "matrix-slim-gray-interactive";

export type MatrixQuality = "low" | "medium" | "high" | "ultra";
export type MatrixQuickPreset = "minimal" | "calm" | "dynamic" | "high-density" | "cinematic" | "live-mode";

export type MatrixSlimSettings = {
  enabled: boolean;
  quickPreset: MatrixQuickPreset;
  streamCount: number;
  density: number;
  minimumStreamLength: number;
  maximumStreamLength: number;
  minimumSpeed: number;
  maximumSpeed: number;
  characterSize: number;
  characterChangeRate: number;
  trailLength: number;
  streamOpacity: number;
  brightness: number;
  depthVariation: number;
  randomness: number;
  mouseRepelEnabled: boolean;
  repelRadius: number;
  repelStrength: number;
  returnSpeed: number;
  clickPulseEnabled: boolean;
  clickPulseRadius: number;
  clickPulseStrength: number;
  scrollReactivityEnabled: boolean;
  scrollSpeedMultiplier: number;
  hoverClearingEnabled: boolean;
  idleCalmEnabled: boolean;
  idleDelay: number;
  idleIntensity: number;
  backgroundColor: string;
  deepGrayColor: string;
  darkGrayColor: string;
  mediumGrayColor: string;
  lightGrayColor: string;
  leadingColor: string;
  globalOpacity: number;
  fadeDistance: number;
  contrast: number;
  glowStrength: number;
  blurAmount: number;
  overlayOpacity: number;
  quality: MatrixQuality;
  maximumFps: number;
  pixelRatioLimit: number;
  dynamicResolution: boolean;
  mobileDensityScale: number;
  pauseWhenHidden: boolean;
  lowPowerFallback: boolean;
  reducedMotionBehavior: "static" | "paused";
  liveIntensity: number;
};

export const DEFAULT_MATRIX_SLIM_SETTINGS: MatrixSlimSettings = {
  enabled: true,
  quickPreset: "calm",
  streamCount: 48,
  density: 0.78,
  minimumStreamLength: 5,
  maximumStreamLength: 22,
  minimumSpeed: 24,
  maximumSpeed: 70,
  characterSize: 14,
  characterChangeRate: 420,
  trailLength: 0.82,
  streamOpacity: 0.76,
  brightness: 0.98,
  depthVariation: 0.7,
  randomness: 0.76,
  mouseRepelEnabled: true,
  repelRadius: 170,
  repelStrength: 16,
  returnSpeed: 480,
  clickPulseEnabled: true,
  clickPulseRadius: 150,
  clickPulseStrength: 14,
  scrollReactivityEnabled: true,
  scrollSpeedMultiplier: 1.16,
  hoverClearingEnabled: false,
  idleCalmEnabled: true,
  idleDelay: 8,
  idleIntensity: 0.58,
  backgroundColor: "#000000",
  deepGrayColor: "#1A1A1A",
  darkGrayColor: "#333333",
  mediumGrayColor: "#666666",
  lightGrayColor: "#BFBFBF",
  leadingColor: "#DCDCDC",
  globalOpacity: 0.8,
  fadeDistance: 0.9,
  contrast: 1,
  glowStrength: 0.09,
  blurAmount: 0,
  overlayOpacity: 0.12,
  quality: "high",
  maximumFps: 60,
  pixelRatioLimit: 2,
  dynamicResolution: true,
  mobileDensityScale: 0.58,
  pauseWhenHidden: true,
  lowPowerFallback: true,
  reducedMotionBehavior: "static",
  liveIntensity: 0.3
};

export const MATRIX_QUICK_PRESETS: Record<MatrixQuickPreset, Partial<MatrixSlimSettings>> = {
  minimal: { streamCount: 28, density: 0.54, minimumSpeed: 18, maximumSpeed: 44, brightness: 0.74, clickPulseEnabled: false, mouseRepelEnabled: false },
  calm: { streamCount: 44, density: 0.72, minimumSpeed: 20, maximumSpeed: 58, brightness: 0.89, mouseRepelEnabled: true, clickPulseEnabled: false },
  dynamic: { streamCount: 52, density: 0.82, minimumSpeed: 28, maximumSpeed: 78, brightness: 1, mouseRepelEnabled: true, clickPulseEnabled: true },
  "high-density": { streamCount: 72, density: 1, minimumSpeed: 26, maximumSpeed: 74, brightness: 0.94, mobileDensityScale: 0.42 },
  cinematic: { streamCount: 50, density: 0.74, minimumStreamLength: 10, maximumStreamLength: 28, minimumSpeed: 16, maximumSpeed: 48, depthVariation: 0.92, brightness: 0.91 },
  "live-mode": { streamCount: 34, density: 0.58, minimumSpeed: 14, maximumSpeed: 42, brightness: 0.58, streamOpacity: 0.56, clickPulseEnabled: false, liveIntensity: 0.24 }
};

const GRAY_COLORS = new Set(["#000000", "#1A1A1A", "#333333", "#666666", "#BFBFBF", "#DCDCDC", "#E6E6E6"]);
const number = (value: unknown, fallback: number, minimum: number, maximum: number) => { const parsed = Number(value); return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback; };
const color = (value: unknown, fallback: string) => GRAY_COLORS.has(String(value).toUpperCase()) ? String(value).toUpperCase() : fallback;

export function sanitizeMatrixSettings(value: unknown): MatrixSlimSettings {
  const input = value && typeof value === "object" ? value as Partial<MatrixSlimSettings> : {};
  const quickPreset = Object.hasOwn(MATRIX_QUICK_PRESETS, String(input.quickPreset)) ? input.quickPreset as MatrixQuickPreset : DEFAULT_MATRIX_SLIM_SETTINGS.quickPreset;
  const quality = ["low", "medium", "high", "ultra"].includes(String(input.quality)) ? input.quality as MatrixQuality : DEFAULT_MATRIX_SLIM_SETTINGS.quality;
  return {
    ...DEFAULT_MATRIX_SLIM_SETTINGS,
    ...input,
    enabled: input.enabled === true,
    quickPreset,
    streamCount: Math.round(number(input.streamCount, 48, 12, 120)), density: number(input.density, 0.78, 0.2, 1.4),
    minimumStreamLength: Math.round(number(input.minimumStreamLength, 5, 3, 30)), maximumStreamLength: Math.round(number(input.maximumStreamLength, 22, 5, 48)),
    minimumSpeed: number(input.minimumSpeed, 24, 4, 120), maximumSpeed: number(input.maximumSpeed, 70, 10, 180), characterSize: number(input.characterSize, 14, 8, 28),
    characterChangeRate: number(input.characterChangeRate, 420, 100, 2000), trailLength: number(input.trailLength, 0.82, 0.2, 1), streamOpacity: number(input.streamOpacity, 0.76, 0.05, 1), brightness: number(input.brightness, 0.98, 0.1, 1), depthVariation: number(input.depthVariation, 0.7, 0, 1), randomness: number(input.randomness, 0.76, 0, 1),
    mouseRepelEnabled: input.mouseRepelEnabled !== false, repelRadius: number(input.repelRadius, 170, 80, 260), repelStrength: number(input.repelStrength, 16, 0, 32), returnSpeed: number(input.returnSpeed, 480, 200, 1000),
    clickPulseEnabled: input.clickPulseEnabled !== false, clickPulseRadius: number(input.clickPulseRadius, 150, 60, 260), clickPulseStrength: number(input.clickPulseStrength, 14, 0, 30), scrollReactivityEnabled: input.scrollReactivityEnabled !== false, scrollSpeedMultiplier: number(input.scrollSpeedMultiplier, 1.16, 1, 1.25), hoverClearingEnabled: input.hoverClearingEnabled === true,
    idleCalmEnabled: input.idleCalmEnabled !== false, idleDelay: number(input.idleDelay, 8, 5, 30), idleIntensity: number(input.idleIntensity, 0.58, 0.25, 1),
    backgroundColor: color(input.backgroundColor, "#000000"), deepGrayColor: color(input.deepGrayColor, "#1A1A1A"), darkGrayColor: color(input.darkGrayColor, "#333333"), mediumGrayColor: color(input.mediumGrayColor, "#666666"), lightGrayColor: color(input.lightGrayColor, "#BFBFBF"), leadingColor: color(input.leadingColor, "#DCDCDC"),
    globalOpacity: number(input.globalOpacity, 0.8, 0, 1), fadeDistance: number(input.fadeDistance, 0.9, 0.2, 1), contrast: number(input.contrast, 1, 0.5, 1.5), glowStrength: number(input.glowStrength, 0.09, 0, 0.25), blurAmount: number(input.blurAmount, 0, 0, 2), overlayOpacity: number(input.overlayOpacity, 0.12, 0, 0.8),
    quality, maximumFps: Math.round(number(input.maximumFps, 60, 24, 60)), pixelRatioLimit: number(input.pixelRatioLimit, 2, 1, 2), dynamicResolution: input.dynamicResolution !== false, mobileDensityScale: number(input.mobileDensityScale, 0.58, 0.25, 1), pauseWhenHidden: input.pauseWhenHidden !== false, lowPowerFallback: input.lowPowerFallback !== false, reducedMotionBehavior: input.reducedMotionBehavior === "paused" ? "paused" : "static", liveIntensity: number(input.liveIntensity, 0.3, 0, 0.4)
  };
}
