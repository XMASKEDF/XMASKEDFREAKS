export type RedirectDestination = "live" | "clips4sale" | "fansly";

export type OfflineRedirectBlock = {
  id: string;
  label: string;
  startMinute: number;
  endMinute: number;
  destination: "split" | "clips4sale" | "fansly";
};

export type RedirectDecision = {
  destination: RedirectDestination;
  destinationUrl: string;
  reason: string;
  bucket: number;
  obsLive: boolean;
  chicagoMinute: number;
  matchedBlock?: string;
};

export const redirectTimeZone = "America/Chicago";

export const defaultOfflineRedirectBlocks: OfflineRedirectBlock[] = [
  { id: "morning-offline", label: "Morning offline", startMinute: 0, endMinute: 8 * 60, destination: "split" },
  { id: "midday-offline", label: "Midday offline", startMinute: 11 * 60, endMinute: 13 * 60, destination: "split" },
  { id: "evening-offline", label: "Evening offline", startMinute: 16 * 60, endMinute: 22 * 60, destination: "split" }
];

export function getChicagoMinute(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: redirectTimeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value || 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value || 0);
  return (hour === 24 ? 0 : hour) * 60 + minute;
}

export function parseClockToMinute(value: string) {
  const [hour, minute] = value.split(":").map((part) => Number(part));
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 0;
  return Math.max(0, Math.min(1439, hour * 60 + minute));
}

export function minuteToClock(value: number) {
  const safe = Math.max(0, Math.min(1439, value));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

export function parseOfflineBlocks(value?: string | null) {
  if (!value) return defaultOfflineRedirectBlocks;
  try {
    const parsed = JSON.parse(value) as Array<Partial<OfflineRedirectBlock> & { start?: string; end?: string }>;
    const blocks: OfflineRedirectBlock[] = parsed.map((block, index) => {
      const startMinute = Number.isFinite(block.startMinute) ? Number(block.startMinute) : parseClockToMinute(block.start || "00:00");
      const endMinute = Number.isFinite(block.endMinute) ? Number(block.endMinute) : parseClockToMinute(block.end || "00:00");
      const destination: OfflineRedirectBlock["destination"] = block.destination === "clips4sale" || block.destination === "fansly" ? block.destination : "split";
      return {
        id: block.id || `offline-${index + 1}`,
        label: block.label || `Offline block ${index + 1}`,
        startMinute,
        endMinute,
        destination
      };
    }).filter((block) => block.startMinute !== block.endMinute);
    return blocks.length ? blocks : defaultOfflineRedirectBlocks;
  } catch {
    return defaultOfflineRedirectBlocks;
  }
}

export function isMinuteInBlock(minute: number, block: OfflineRedirectBlock) {
  if (block.startMinute < block.endMinute) {
    return minute >= block.startMinute && minute < block.endMinute;
  }
  return minute >= block.startMinute || minute < block.endMinute;
}

export function deterministicBucket(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0) % 100;
}

export function decideRedirect(input: {
  obsLive: boolean;
  liveUrl: string;
  clipsUrl: string;
  fanslyUrl: string;
  seed: string;
  manualDestination?: "live" | "clips4sale" | "fansly" | "";
  clipsPercent?: number;
  date?: Date;
  offlineBlocks?: OfflineRedirectBlock[];
}): RedirectDecision {
  const chicagoMinute = getChicagoMinute(input.date);
  const bucket = deterministicBucket(input.seed);

  if (input.obsLive) {
    return {
      destination: "live",
      destinationUrl: input.liveUrl,
      reason: "OBS live priority",
      bucket,
      obsLive: true,
      chicagoMinute
    };
  }

  if (input.manualDestination === "live" || input.manualDestination === "clips4sale" || input.manualDestination === "fansly") {
    return {
      destination: input.manualDestination,
      destinationUrl: input.manualDestination === "live" ? input.liveUrl : input.manualDestination === "clips4sale" ? input.clipsUrl : input.fanslyUrl,
      reason: "Manual offline override",
      bucket,
      obsLive: false,
      chicagoMinute
    };
  }

  const matchedBlock = (input.offlineBlocks || defaultOfflineRedirectBlocks).find((block) => isMinuteInBlock(chicagoMinute, block));
  if (matchedBlock?.destination === "clips4sale" || matchedBlock?.destination === "fansly") {
    return {
      destination: matchedBlock.destination,
      destinationUrl: matchedBlock.destination === "clips4sale" ? input.clipsUrl : input.fanslyUrl,
      reason: "Offline block fixed destination",
      bucket,
      obsLive: false,
      chicagoMinute,
      matchedBlock: matchedBlock.id
    };
  }

  const clipsPercent = Math.max(0, Math.min(100, Number(input.clipsPercent ?? 60)));
  const destination = bucket < clipsPercent ? "clips4sale" : "fansly";
  return {
    destination,
    destinationUrl: destination === "clips4sale" ? input.clipsUrl : input.fanslyUrl,
    reason: matchedBlock ? "Offline block deterministic split" : "Offline deterministic split",
    bucket,
    obsLive: false,
    chicagoMinute,
    matchedBlock: matchedBlock?.id
  };
}
