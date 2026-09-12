export function gameMixLevel(configuredVolume: number, liveVolume: number, liveMuted: boolean) {
  const configured = Math.min(0.25, Math.max(0, configuredVolume));
  const live = Math.min(1, Math.max(0, liveVolume));
  return configured * (liveMuted ? 1 : live);
}
