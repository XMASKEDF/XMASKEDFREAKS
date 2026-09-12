export const GAME_RECOVERY_DELAYS = [500, 1000, 2000] as const;

export function isRecoverableGameError(error: unknown) {
  const message = error instanceof Error ? `${error.name} ${error.message}` : String(error || "");
  return !/permission denied|unauthorized|forbidden|invalid purchase|security violation/i.test(message);
}

export function gameErrorType(error: unknown) {
  const message = error instanceof Error ? `${error.name} ${error.message}` : String(error || "");
  if (/chunk|dynamic import|loading css chunk|module/i.test(message)) return "module-load";
  if (/network|fetch|timeout|offline/i.test(message)) return "network";
  if (/hydration|server-rendered html/i.test(message)) return "hydration";
  if (/asset|texture|image|audio/i.test(message)) return "asset";
  if (/background|matrix|webgl|canvas/i.test(message)) return "background";
  return "render";
}

export async function loadGameModule<T>(loader: () => Promise<T>, attempts = 3, timeoutMs = 10_000): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      let timer = 0;
      try {
        return await Promise.race([loader(), new Promise<never>((_, reject) => { timer = window.setTimeout(() => reject(new Error("Game module import timeout")), timeoutMs); })]);
      } finally {
        if (timer) window.clearTimeout(timer);
      }
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) await new Promise((resolve) => window.setTimeout(resolve, GAME_RECOVERY_DELAYS[attempt]));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Game module failed to load");
}

type ErrorReportInput = {
  error: Error;
  componentStack?: string;
  retryCount: number;
  gameId?: string | null;
  componentName: string;
  recoveryAction?: string;
};

function browserSummary(userAgent: string) {
  if (/edg/i.test(userAgent)) return "Edge";
  if (/chrome|crios/i.test(userAgent)) return "Chrome";
  if (/safari/i.test(userAgent)) return "Safari";
  if (/firefox|fxios/i.test(userAgent)) return "Firefox";
  return "Unknown";
}

function osSummary(userAgent: string) {
  if (/iphone|ipad|ios/i.test(userAgent)) return "iOS/iPadOS";
  if (/android/i.test(userAgent)) return "Android";
  if (/mac os/i.test(userAgent)) return "macOS";
  if (/windows/i.test(userAgent)) return "Windows";
  if (/linux/i.test(userAgent)) return "Linux";
  return "Unknown";
}

export async function reportGameError(input: ErrorReportInput) {
  if (typeof window === "undefined") return;
  const memory = (performance as Performance & { memory?: { usedJSHeapSize?: number; jsHeapSizeLimit?: number } }).memory;
  const matrix = document.querySelector<HTMLCanvasElement>(".background-engine-canvas");
  const payload = {
    timestamp: new Date().toISOString(),
    browser: browserSummary(navigator.userAgent),
    os: osSummary(navigator.userAgent),
    device: matchMedia("(pointer: coarse)").matches ? "touch" : "desktop",
    route: `${location.pathname}${location.search}`,
    gameSelected: input.gameId || null,
    errorMessage: input.error.message.slice(0, 1000),
    errorType: gameErrorType(input.error),
    componentStack: (input.componentStack || "").slice(0, 6000),
    retryCount: input.retryCount,
    memory: memory ? { used: memory.usedJSHeapSize || null, limit: memory.jsHeapSizeLimit || null } : null,
    performance: { now: Math.round(performance.now()), navigation: performance.getEntriesByType("navigation")[0]?.duration || null },
    componentName: input.componentName,
    backgroundState: document.querySelector(".background-engine")?.getAttribute("data-tier") || "unavailable",
    matrixState: matrix ? { present: true, fps: matrix.dataset.fps || null, frameMs: matrix.dataset.frameMs || null } : { present: false },
    adminStatus: "client-inaccessible",
    authenticationStatus: Object.keys(localStorage).some((key) => key.startsWith("sb-") && key.endsWith("-auth-token")) ? "session-present" : "guest-or-unknown",
    recoveryAction: input.recoveryAction || "automatic-retry"
  };
  if (process.env.NODE_ENV !== "production") console.error("[Games recovery]", payload, input.error);
  await fetch("/api/games/errors", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), keepalive: true }).catch(() => undefined);
}
