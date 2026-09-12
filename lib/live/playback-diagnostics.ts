export const LIVE_PLAYBACK_DIAGNOSTICS_STORAGE_KEY = "xmf-live-playback-diagnostics";

export type PlaybackMode = "native-hls" | "hls-js" | "unsupported" | "unknown";

export type LivePlaybackDiagnosticSnapshot = {
  version: 1;
  updatedAt: number;
  lifecycle: {
    playerStarts: number;
    playerStops: number;
    activeHlsInstances: number;
    peakHlsInstances: number;
    hlsCreated: number;
    hlsDestroyed: number;
    sourceAssignments: number;
    sourceResets: number;
    mediaAttached: number;
    sourceLoads: number;
    hlsRecoveries: number;
    lastPlaybackMode: PlaybackMode;
    lastSourceHash: string | null;
  };
  playback: {
    lastEvent: string | null;
    lastEventAt: number | null;
    startupMs: number | null;
    rebufferCount: number;
    stallCount: number;
    fatalErrorCount: number;
    lastError: string | null;
    bufferAheadSeconds: number | null;
    droppedFrames: number | null;
    totalFrames: number | null;
    videoWidth: number | null;
    videoHeight: number | null;
    currentTime: number | null;
    readyState: number | null;
    paused: boolean | null;
  };
  network: {
    totalRequests: number;
    failedRequests: number;
    averageLatencyMs: number | null;
    recentRequests: Array<{ path: string; ok: boolean; latencyMs: number; at: number }>;
  };
  render: {
    streamStatusEvents: number;
    lastStreamStatus: string | null;
    lastStreamStatusAt: number | null;
  };
  timer: {
    samples: number;
    averageDriftMs: number | null;
    maxDriftMs: number | null;
  };
  matrix: {
    samples: number;
    averageFps: number | null;
    averageFrameMs: number | null;
    lastFps: number | null;
    lastFrameMs: number | null;
  };
};

const MAX_RECENT_REQUESTS = 40;

function sourceHash(source: string) {
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `src-${(hash >>> 0).toString(16)}`;
}

function emptySnapshot(): LivePlaybackDiagnosticSnapshot {
  return {
    version: 1,
    updatedAt: Date.now(),
    lifecycle: {
      playerStarts: 0,
      playerStops: 0,
      activeHlsInstances: 0,
      peakHlsInstances: 0,
      hlsCreated: 0,
      hlsDestroyed: 0,
      sourceAssignments: 0,
      sourceResets: 0,
      mediaAttached: 0,
      sourceLoads: 0,
      hlsRecoveries: 0,
      lastPlaybackMode: "unknown",
      lastSourceHash: null
    },
    playback: {
      lastEvent: null,
      lastEventAt: null,
      startupMs: null,
      rebufferCount: 0,
      stallCount: 0,
      fatalErrorCount: 0,
      lastError: null,
      bufferAheadSeconds: null,
      droppedFrames: null,
      totalFrames: null,
      videoWidth: null,
      videoHeight: null,
      currentTime: null,
      readyState: null,
      paused: null
    },
    network: { totalRequests: 0, failedRequests: 0, averageLatencyMs: null, recentRequests: [] },
    render: { streamStatusEvents: 0, lastStreamStatus: null, lastStreamStatusAt: null },
    timer: { samples: 0, averageDriftMs: null, maxDriftMs: null },
    matrix: { samples: 0, averageFps: null, averageFrameMs: null, lastFps: null, lastFrameMs: null }
  };
}

export class LivePlaybackDiagnostics {
  private snapshot = emptySnapshot();
  private startupStartedAt: number | null = null;
  private latencyTotal = 0;
  private timerDriftTotal = 0;
  private matrixFpsTotal = 0;
  private matrixFrameMsTotal = 0;

  reset() {
    this.snapshot = emptySnapshot();
    this.startupStartedAt = null;
    this.latencyTotal = 0;
    this.timerDriftTotal = 0;
    this.matrixFpsTotal = 0;
    this.matrixFrameMsTotal = 0;
  }

  startPlayer() {
    this.snapshot.lifecycle.playerStarts += 1;
    this.startupStartedAt = Date.now();
    this.touch();
  }

  stopPlayer() {
    this.snapshot.lifecycle.playerStops += 1;
    this.touch();
  }

  createHls() {
    this.snapshot.lifecycle.hlsCreated += 1;
    this.snapshot.lifecycle.activeHlsInstances += 1;
    this.snapshot.lifecycle.peakHlsInstances = Math.max(this.snapshot.lifecycle.peakHlsInstances, this.snapshot.lifecycle.activeHlsInstances);
    this.touch();
  }

  destroyHls() {
    this.snapshot.lifecycle.hlsDestroyed += 1;
    this.snapshot.lifecycle.activeHlsInstances = Math.max(0, this.snapshot.lifecycle.activeHlsInstances - 1);
    this.touch();
  }

  assignSource(source: string, mode: PlaybackMode) {
    const nextHash = sourceHash(source);
    if (this.snapshot.lifecycle.lastSourceHash && this.snapshot.lifecycle.lastSourceHash !== nextHash) this.snapshot.lifecycle.sourceResets += 1;
    this.snapshot.lifecycle.sourceAssignments += 1;
    this.snapshot.lifecycle.lastSourceHash = nextHash;
    this.snapshot.lifecycle.lastPlaybackMode = mode;
    this.touch();
  }

  mediaAttached() {
    this.snapshot.lifecycle.mediaAttached += 1;
    this.touch();
  }

  sourceLoaded() {
    this.snapshot.lifecycle.sourceLoads += 1;
    this.touch();
  }

  recovery() {
    this.snapshot.lifecycle.hlsRecoveries += 1;
    this.touch();
  }

  hlsError(type: string, fatal: boolean) {
    this.snapshot.playback.lastError = `${type}${fatal ? ":fatal" : ":recoverable"}`;
    if (fatal) this.snapshot.playback.fatalErrorCount += 1;
    this.touch();
  }

  videoEvent(event: string) {
    const now = Date.now();
    this.snapshot.playback.lastEvent = event;
    this.snapshot.playback.lastEventAt = now;
    if (event === "waiting" || event === "stalled" || event === "seeking") {
      this.snapshot.playback.stallCount += 1;
      if (event !== "seeking") this.snapshot.playback.rebufferCount += 1;
    }
    if (event === "playing" && this.startupStartedAt !== null && this.snapshot.playback.startupMs === null) {
      this.snapshot.playback.startupMs = Math.max(0, now - this.startupStartedAt);
    }
    this.touch();
  }

  videoSample(sample: {
    bufferAheadSeconds: number;
    droppedFrames: number | null;
    totalFrames: number | null;
    videoWidth: number;
    videoHeight: number;
    currentTime: number;
    readyState: number;
    paused: boolean;
  }) {
    this.snapshot.playback.bufferAheadSeconds = sample.bufferAheadSeconds;
    this.snapshot.playback.droppedFrames = sample.droppedFrames;
    this.snapshot.playback.totalFrames = sample.totalFrames;
    this.snapshot.playback.videoWidth = sample.videoWidth;
    this.snapshot.playback.videoHeight = sample.videoHeight;
    this.snapshot.playback.currentTime = sample.currentTime;
    this.snapshot.playback.readyState = sample.readyState;
    this.snapshot.playback.paused = sample.paused;
    this.touch();
  }

  apiRequest(path: string, latencyMs: number, ok: boolean) {
    const request = { path: path.split("?")[0], ok, latencyMs: Math.max(0, Math.round(latencyMs)), at: Date.now() };
    this.snapshot.network.totalRequests += 1;
    if (!ok) this.snapshot.network.failedRequests += 1;
    this.latencyTotal += request.latencyMs;
    this.snapshot.network.averageLatencyMs = Math.round(this.latencyTotal / this.snapshot.network.totalRequests);
    this.snapshot.network.recentRequests = [...this.snapshot.network.recentRequests, request].slice(-MAX_RECENT_REQUESTS);
    this.touch();
  }

  streamStatus(status: string) {
    this.snapshot.render.streamStatusEvents += 1;
    this.snapshot.render.lastStreamStatus = status;
    this.snapshot.render.lastStreamStatusAt = Date.now();
    this.touch();
  }

  timerSample(driftMs: number) {
    const drift = Math.abs(Math.round(driftMs));
    this.snapshot.timer.samples += 1;
    this.timerDriftTotal += drift;
    this.snapshot.timer.averageDriftMs = Math.round(this.timerDriftTotal / this.snapshot.timer.samples);
    this.snapshot.timer.maxDriftMs = Math.max(this.snapshot.timer.maxDriftMs || 0, drift);
    this.touch();
  }

  matrixSample(fps: number, frameMs: number) {
    this.snapshot.matrix.samples += 1;
    this.matrixFpsTotal += fps;
    this.matrixFrameMsTotal += frameMs;
    this.snapshot.matrix.averageFps = Math.round(this.matrixFpsTotal / this.snapshot.matrix.samples);
    this.snapshot.matrix.averageFrameMs = Number((this.matrixFrameMsTotal / this.snapshot.matrix.samples).toFixed(2));
    this.snapshot.matrix.lastFps = fps;
    this.snapshot.matrix.lastFrameMs = Number(frameMs.toFixed(2));
    this.touch();
  }

  getSnapshot(): LivePlaybackDiagnosticSnapshot {
    return {
      ...this.snapshot,
      lifecycle: { ...this.snapshot.lifecycle },
      playback: { ...this.snapshot.playback },
      network: { ...this.snapshot.network, recentRequests: [...this.snapshot.network.recentRequests] },
      render: { ...this.snapshot.render },
      timer: { ...this.snapshot.timer },
      matrix: { ...this.snapshot.matrix }
    };
  }

  private touch() {
    this.snapshot.updatedAt = Date.now();
  }
}

let diagnostics: LivePlaybackDiagnostics | null = null;

export function getLivePlaybackDiagnostics() {
  if (!diagnostics) diagnostics = new LivePlaybackDiagnostics();
  return diagnostics;
}
