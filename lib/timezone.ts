export const platformTimeZone = "America/Chicago";
export const timeZoneStorageKey = "xmf-time-zone";
export const timeZoneCookieName = "xmf_time_zone";

export type StreamWindow = {
  id: string;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  crossesMidnight?: boolean;
};

export const streamWindows: StreamWindow[] = [
  { id: "morning", startHour: 8, startMinute: 0, endHour: 11, endMinute: 0 },
  { id: "afternoon", startHour: 13, startMinute: 0, endHour: 16, endMinute: 0 },
  { id: "overnight", startHour: 22, startMinute: 0, endHour: 6, endMinute: 0, crossesMidnight: true }
];

export const commonTimeZones = [
  "America/Chicago",
  "America/New_York",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Toronto",
  "America/Mexico_City",
  "America/Bogota",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Africa/Lagos",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Tokyo",
  "Asia/Manila",
  "Australia/Sydney"
];

const regionTimeZoneFallbacks: Record<string, string> = {
  US: "America/Chicago",
  CA: "America/Toronto",
  MX: "America/Mexico_City",
  BR: "America/Sao_Paulo",
  CO: "America/Bogota",
  GB: "Europe/London",
  FR: "Europe/Paris",
  DE: "Europe/Berlin",
  ES: "Europe/Madrid",
  NG: "Africa/Lagos",
  ZA: "Africa/Johannesburg",
  AE: "Asia/Dubai",
  IN: "Asia/Kolkata",
  TH: "Asia/Bangkok",
  JP: "Asia/Tokyo",
  PH: "Asia/Manila",
  AU: "Australia/Sydney"
};

function isValidTimeZone(value?: string | null) {
  if (!value) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function detectPreferredTimeZone() {
  if (typeof window === "undefined") {
    return { timeZone: platformTimeZone, detected: false };
  }
  const saved = window.localStorage.getItem(timeZoneStorageKey);
  if (isValidTimeZone(saved)) return { timeZone: saved as string, detected: true };
  try {
    const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (isValidTimeZone(browserZone)) return { timeZone: browserZone, detected: true };
    const region = navigator.language?.split("-")[1]?.toUpperCase();
    const regionalFallback = region ? regionTimeZoneFallbacks[region] : "";
    if (isValidTimeZone(regionalFallback)) return { timeZone: regionalFallback, detected: true };
  } catch {
    return { timeZone: platformTimeZone, detected: false };
  }
  return { timeZone: platformTimeZone, detected: false };
}

export function rememberTimeZone(timeZone: string) {
  if (typeof window === "undefined" || !isValidTimeZone(timeZone)) return;
  window.localStorage.setItem(timeZoneStorageKey, timeZone);
  document.cookie = `${timeZoneCookieName}=${encodeURIComponent(timeZone)}; path=/; max-age=31536000; SameSite=Lax`;
}

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(date);
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0);
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour") === 24 ? 0 : read("hour"),
    minute: read("minute"),
    second: read("second")
  };
}

function platformDateFor(hour: number, minute: number, addDays = 0) {
  const now = new Date();
  const platformNow = zonedParts(now, platformTimeZone);
  const utcGuess = Date.UTC(platformNow.year, platformNow.month - 1, platformNow.day + addDays, hour, minute, 0);
  const guessedDate = new Date(utcGuess);
  const guessedParts = zonedParts(guessedDate, platformTimeZone);
  const offsetMinutes = ((guessedParts.hour - hour) * 60) + (guessedParts.minute - minute);
  return new Date(utcGuess - offsetMinutes * 60 * 1000);
}

export function formatTimeInZone(date: Date, timeZone: string, locale = "en") {
  const parts = new Intl.DateTimeFormat(locale, {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  }).formatToParts(date);
  const read = (type: string) => parts.find((part) => part.type === type)?.value || "";
  const dayPeriod = read("dayPeriod");
  return [
    `${read("hour")}:${read("minute")}`,
    dayPeriod,
    read("timeZoneName")
  ].filter(Boolean).join(" ");
}

export function formatDateTimeInZone(date: Date, timeZone: string, locale = "en") {
  const parts = new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  }).formatToParts(date);
  const read = (type: string) => parts.find((part) => part.type === type)?.value || "";
  const dayPeriod = read("dayPeriod");
  const time = [
    `${read("hour")}:${read("minute")}`,
    dayPeriod,
    read("timeZoneName")
  ].filter(Boolean).join(" ");
  return `${read("weekday")}, ${read("month")} ${read("day")} at ${time}`;
}

export function formatStreamWindow(window: StreamWindow, visitorTimeZone: string, locale = "en") {
  const start = platformDateFor(window.startHour, window.startMinute);
  const end = platformDateFor(window.endHour, window.endMinute, window.crossesMidnight ? 1 : 0);
  return {
    id: window.id,
    local: `${formatTimeInZone(start, visitorTimeZone, locale)} - ${formatTimeInZone(end, visitorTimeZone, locale)}`,
    platform: `${formatTimeInZone(start, platformTimeZone, locale)} - ${formatTimeInZone(end, platformTimeZone, locale)}`
  };
}

export function nextStreamStart(visitorTimeZone: string, locale = "en") {
  const now = Date.now();
  const candidates = streamWindows.flatMap((window) => [0, 1].map((day) => platformDateFor(window.startHour, window.startMinute, day)));
  const next = candidates.filter((date) => date.getTime() > now).sort((a, b) => a.getTime() - b.getTime())[0] || candidates[0];
  return {
    local: formatDateTimeInZone(next, visitorTimeZone, locale),
    platform: formatDateTimeInZone(next, platformTimeZone, locale)
  };
}
