export type BackgroundPerformanceTier = "low" | "medium" | "high" | "ultra";

export type BackgroundViewport = {
  width: number;
  height: number;
  renderWidth: number;
  renderHeight: number;
  pixelRatio: number;
  orientation: "portrait" | "landscape";
  fullscreen: boolean;
  reducedMotion: boolean;
  performanceTier: BackgroundPerformanceTier;
};

export type ResizeManagerOptions = {
  debounceMs: number;
  maximumPixelRatio: number;
  dynamicResolution: boolean;
  mobilePerformanceMode: boolean;
  automaticGpuOptimization: boolean;
};

const DEFAULT_OPTIONS: ResizeManagerOptions = {
  debounceMs: 75,
  maximumPixelRatio: 2,
  dynamicResolution: true,
  mobilePerformanceMode: true,
  automaticGpuOptimization: true
};

function performanceTier(options: ResizeManagerOptions): BackgroundPerformanceTier {
  const memory = Number((navigator as Navigator & { deviceMemory?: number }).deviceMemory || 4);
  const cores = navigator.hardwareConcurrency || 4;
  const mobile = matchMedia("(max-width: 760px), (pointer: coarse)").matches;
  if (options.mobilePerformanceMode && mobile) return memory <= 4 || cores <= 4 ? "low" : "medium";
  if (!options.automaticGpuOptimization) return "high";
  if (memory >= 12 && cores >= 10) return "ultra";
  if (memory >= 8 && cores >= 6) return "high";
  if (memory >= 4 && cores >= 4) return "medium";
  return "low";
}

function tierPixelRatioLimit(tier: BackgroundPerformanceTier) {
  if (tier === "low") return 1;
  if (tier === "medium") return 1.5;
  return 2;
}

export class BackgroundResizeManager {
  private options = DEFAULT_OPTIONS;
  private subscribers = new Set<(viewport: BackgroundViewport) => void>();
  private timer: number | null = null;
  private dprQuery: MediaQueryList | null = null;
  private running = false;

  configure(options: Partial<ResizeManagerOptions>) {
    this.options = { ...this.options, ...options };
    if (this.running) this.schedule(true);
  }

  subscribe(subscriber: (viewport: BackgroundViewport) => void) {
    this.subscribers.add(subscriber);
    if (this.running) subscriber(this.measure());
    return () => this.subscribers.delete(subscriber);
  }

  start() {
    if (this.running) return;
    this.running = true;
    window.addEventListener("resize", this.handleResize, { passive: true });
    window.addEventListener("orientationchange", this.handleImmediate, { passive: true });
    document.addEventListener("fullscreenchange", this.handleImmediate);
    window.visualViewport?.addEventListener("resize", this.handleResize, { passive: true });
    this.watchPixelRatio();
    this.publish();
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    window.removeEventListener("resize", this.handleResize);
    window.removeEventListener("orientationchange", this.handleImmediate);
    document.removeEventListener("fullscreenchange", this.handleImmediate);
    window.visualViewport?.removeEventListener("resize", this.handleResize);
    this.dprQuery?.removeEventListener("change", this.handlePixelRatioChange);
    this.dprQuery = null;
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
  }

  private handleResize = () => this.schedule(false);
  private handleImmediate = () => this.schedule(true);
  private handlePixelRatioChange = () => {
    this.watchPixelRatio();
    this.schedule(true);
  };

  private schedule(immediate: boolean) {
    if (this.timer !== null) window.clearTimeout(this.timer);
    if (immediate) {
      this.timer = null;
      this.publish();
      return;
    }
    this.timer = window.setTimeout(() => {
      this.timer = null;
      this.publish();
    }, this.options.debounceMs);
  }

  private watchPixelRatio() {
    this.dprQuery?.removeEventListener("change", this.handlePixelRatioChange);
    this.dprQuery = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    this.dprQuery.addEventListener("change", this.handlePixelRatioChange);
  }

  private measure(): BackgroundViewport {
    const width = Math.max(1, Math.round(window.visualViewport?.width || window.innerWidth));
    const height = Math.max(1, Math.round(window.visualViewport?.height || window.innerHeight));
    const tier = performanceTier(this.options);
    const configuredLimit = Math.min(3, Math.max(1, this.options.maximumPixelRatio));
    const dynamicLimit = this.options.dynamicResolution ? tierPixelRatioLimit(tier) : configuredLimit;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, configuredLimit, dynamicLimit);
    return {
      width,
      height,
      renderWidth: Math.round(width * pixelRatio),
      renderHeight: Math.round(height * pixelRatio),
      pixelRatio,
      orientation: width >= height ? "landscape" : "portrait",
      fullscreen: Boolean(document.fullscreenElement),
      reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
      performanceTier: tier
    };
  }

  private publish() {
    if (!this.running) return;
    const viewport = this.measure();
    this.subscribers.forEach((subscriber) => subscriber(viewport));
    window.dispatchEvent(new CustomEvent("xmf:background-viewport", { detail: viewport }));
  }
}
