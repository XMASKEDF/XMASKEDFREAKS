"use client";

import { memo, type Ref } from "react";
import type { StreamPlaybackEventHandlers } from "@/hooks/useStreamPlaybackStatus";

type LiveVideoSurfaceProps = {
  videoRef: Ref<HTMLVideoElement>;
  muted: boolean;
  videoEvents: StreamPlaybackEventHandlers;
  onPlaying: () => void;
};

function LiveVideoSurface({ videoRef, muted, videoEvents, onPlaying }: LiveVideoSurfaceProps) {
  return (
    <video
      ref={videoRef}
      playsInline
      muted={muted}
      autoPlay
      preload="none"
      onLoadStart={videoEvents.onLoadStart}
      onLoadedMetadata={videoEvents.onLoadedMetadata}
      onCanPlay={videoEvents.onCanPlay}
      onPlay={videoEvents.onPlay}
      onPlaying={onPlaying}
      onWaiting={videoEvents.onWaiting}
      onStalled={videoEvents.onStalled}
      onSeeking={videoEvents.onSeeking}
      onPause={videoEvents.onPause}
      onEnded={videoEvents.onEnded}
      onError={videoEvents.onError}
      onEmptied={videoEvents.onEmptied}
      onAbort={videoEvents.onAbort}
    />
  );
}

export default memo(LiveVideoSurface);
