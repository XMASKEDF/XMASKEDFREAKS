import { mediaCredentials, mediaHeaders } from "@/lib/media/server";
import { DEFAULT_MATRIX_SLIM_SETTINGS, sanitizeMatrixSettings, type MatrixSlimSettings } from "@/lib/background/matrix";

export type SiteBackgroundSettings = {
  enabled: boolean;
  backgroundType: "static" | "video" | "canvas" | "webgl";
  matrixSlim: MatrixSlimSettings;
  desktopMediaId: string | null;
  desktopUrl: string;
  mobileMediaId: string | null;
  mobileUrl: string;
  fallbackMediaId: string | null;
  fallbackUrl: string;
  videoUrl: string;
  opacity: number;
  overlay: string;
  scope: "global" | "live" | "games" | "admin" | "landing";
  focalPointX: number;
  focalPointY: number;
  responsiveScaling: boolean;
  maximumPixelRatio: number;
  resizeDebounceMs: number;
  particleDensityScaling: boolean;
  maintainAspectRatio: boolean;
  dynamicResolution: boolean;
  mobilePerformanceMode: boolean;
  automaticGpuOptimization: boolean;
};

export const DEFAULT_SITE_BACKGROUND: SiteBackgroundSettings = {
  enabled: true,
  backgroundType: "canvas",
  matrixSlim: DEFAULT_MATRIX_SLIM_SETTINGS,
  desktopMediaId: null,
  desktopUrl: "",
  mobileMediaId: null,
  mobileUrl: "",
  fallbackMediaId: null,
  fallbackUrl: "",
  videoUrl: "",
  opacity: 0.2,
  overlay: "rgba(0,0,0,0.78)",
  scope: "global",
  focalPointX: 0.5,
  focalPointY: 0.5,
  responsiveScaling: true,
  maximumPixelRatio: 2,
  resizeDebounceMs: 75,
  particleDensityScaling: true,
  maintainAspectRatio: true,
  dynamicResolution: true,
  mobilePerformanceMode: true,
  automaticGpuOptimization: true
};

function bounded(value: unknown, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

export async function getSiteBackgroundSettings(): Promise<SiteBackgroundSettings> {
  const service = mediaCredentials();
  if (!service) return DEFAULT_SITE_BACKGROUND;
  const response = await fetch(`${service.url}/rest/v1/site_background_settings?id=eq.default&select=*&limit=1`, { cache: "no-store", headers: mediaHeaders(service) }).catch(() => null);
  if (!response?.ok) return DEFAULT_SITE_BACKGROUND;
  const rows = await response.json();
  const row = rows[0];
  if (!row) return DEFAULT_SITE_BACKGROUND;
  const backgroundType = ["static", "video", "canvas", "webgl"].includes(row.background_type) ? row.background_type : "static";
  const scope = ["global", "live", "games", "admin", "landing"].includes(row.scope) ? row.scope : "global";
  return {
    enabled: row.enabled === true,
    backgroundType,
    matrixSlim: sanitizeMatrixSettings(row.matrix_slim_settings),
    desktopMediaId: row.desktop_media_id || null,
    desktopUrl: row.desktop_url || "",
    mobileMediaId: row.mobile_media_id || null,
    mobileUrl: row.mobile_url || "",
    fallbackMediaId: row.fallback_media_id || null,
    fallbackUrl: row.fallback_url || "",
    videoUrl: row.video_url || "",
    opacity: bounded(row.opacity, 0.28, 0, 1),
    overlay: String(row.overlay || "rgba(0,0,0,0.72)"),
    scope,
    focalPointX: bounded(row.focal_point_x, 0.5, 0, 1),
    focalPointY: bounded(row.focal_point_y, 0.5, 0, 1),
    responsiveScaling: row.responsive_scaling !== false,
    maximumPixelRatio: bounded(row.maximum_pixel_ratio, 2, 1, 3),
    resizeDebounceMs: bounded(row.resize_debounce_ms, 75, 50, 250),
    particleDensityScaling: row.particle_density_scaling !== false,
    maintainAspectRatio: row.maintain_aspect_ratio !== false,
    dynamicResolution: row.dynamic_resolution !== false,
    mobilePerformanceMode: row.mobile_performance_mode !== false,
    automaticGpuOptimization: row.automatic_gpu_optimization !== false
  };
}
