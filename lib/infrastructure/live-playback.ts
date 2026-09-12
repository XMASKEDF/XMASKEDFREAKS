import "server-only";

import { getStreamingProvider, resolveStreamingPlaybackUrl } from "./provider-runtime";

export type LivePlaybackRuntime = {
  configured: boolean;
  available: boolean;
  provider: "cloudflare-stream" | "none";
  state: "OFFLINE" | "CONNECTING" | "LIVE" | "DEGRADED" | "FAILED";
  source: string | null;
  checkedAt: string;
};

export async function getLivePlaybackRuntime(): Promise<LivePlaybackRuntime> {
  const configured = Boolean(
    process.env.STREAM_HEALTH_URL
      && process.env.STREAM_PLAYBACK_BASE_URL
      && process.env.CLOUDFLARE_STREAM_LIVE_INPUT_UID
  );
  const checkedAt = new Date().toISOString();

  if (!configured) return { configured: false, available: false, provider: "none", state: "OFFLINE", source: null, checkedAt };

  const provider = getStreamingProvider();
  if (!provider) return { configured: true, available: false, provider: "cloudflare-stream", state: "FAILED", source: null, checkedAt };

  const health = await provider.health();
  const source = health.state === "LIVE" ? await provider.playbackUrl("AUTO") : null;
  if (process.env.NODE_ENV !== "production") {
    console.info("[live playback]", {
      provider: "cloudflare-stream",
      health: health.state,
      playbackSourceResolved: Boolean(source),
      playbackSourcePathType: source ? resolveStreamingPlaybackUrl(process.env.STREAM_PLAYBACK_BASE_URL || "", "AUTO").pathType : "none"
    });
  }
  return { configured: true, available: Boolean(source), provider: "cloudflare-stream", state: health.state, source, checkedAt: health.checkedAt };
}
