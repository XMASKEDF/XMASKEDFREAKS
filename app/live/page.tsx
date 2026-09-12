import type { Metadata } from "next";
import LiveRoom from "@/components/LiveRoom";
import { getGamesEnabled } from "@/lib/games/catalog";
import { getLivePlaybackRuntime } from "@/lib/infrastructure/live-playback";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Live | XMASKEDFREAKS", description: "The XMASKEDFREAKS live room." };
export default async function LivePage() {
  const [gamesEnabled, playback] = await Promise.all([getGamesEnabled(), getLivePlaybackRuntime()]);
  return <LiveRoom gamesEnabled={gamesEnabled} playbackSource={playback.source} playbackConfigured={playback.configured} />;
}
