import { serviceCredentials, serviceHeaders } from "@/lib/api-user";
import { emailConfiguration, getEmailProvider } from "@/lib/email/provider";
import { getPaymentProviderReadiness } from "@/lib/payments/provider";
import { defaultCoinPackages, type CoinPackage } from "@/lib/config";
import { geoVisitors, summarizeGeoVisitors } from "@/lib/geo";
import { getObjectStorageProvider } from "@/lib/infrastructure/storage";

export type TheaterAudioSettings = {
  theaterEnabled: boolean;
  audioPriority: "live" | "notification" | "music";
  liveAudioCompression: boolean;
  musicDuckingVolume: number;
};

export type OperationalMusicTrack = {
  id: string;
  mediaId: string | null;
  title: string;
  artist: string;
  durationMinutes: number;
  enabled: boolean;
  order: number;
  status: "approved" | "processing" | "unavailable";
};

export type BackgroundMusicOperationalSettings = {
  enabled: boolean;
  lobbyEnabled: boolean;
  mode: "automatic" | "lobby-only" | "live-background" | "disabled";
  lobbyVolume: number;
  liveDuckingVolume: number;
  stopWhenLive: boolean;
  noticeSeconds: number;
  tracks: OperationalMusicTrack[];
};

export type RedirectRule = {
  id: string;
  name: string;
  enabled: boolean;
  source: string;
  destination: "live" | "clips4sale" | "fansly";
  condition: { start: string; end: string; offlineOnly: boolean };
  priority: number;
};

export type CampaignDefinition = {
  id: string;
  name: string;
  source: string;
  medium: string;
  code: string;
  destination: string;
  enabled: boolean;
};

export type NotificationOperationalSettings = {
  cooldownMinutes: number;
  lastQueuedAt: string | null;
  lastStatus: "idle" | "queued" | "sent" | "failed" | "blocked";
  lastDeliveryState: "QUEUED" | "PROVIDER_ACCEPTED" | "DELIVERED" | "FAILED" | null;
  lastFailure: string | null;
};

export type CoinPolicyOperationalSettings = {
  immutableCoinValueCents: 50;
  disclosure: string;
  requireEveryPurchase: boolean;
  showInPurchase: boolean;
  showInWallet: boolean;
  showInFaq: boolean;
  showInReceipts: boolean;
};

export type DepositScheduleSettings = {
  enabled: boolean;
  intervalHours: 1 | 2 | 4 | 8;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastResult: "never" | "prepared" | "failed" | "provider_pending";
};

export type OperationalState = {
  theaterAudio: TheaterAudioSettings;
  backgroundMusic: BackgroundMusicOperationalSettings;
  redirects: RedirectRule[];
  campaigns: CampaignDefinition[];
  notifications: NotificationOperationalSettings;
  coinPolicy: CoinPolicyOperationalSettings;
  coinPackages: CoinPackage[];
  depositSchedule: DepositScheduleSettings;
  faq: Array<{ id: string; question: string; answer: string; enabled: boolean; order: number }>;
  appeals: Array<{ id: string; subjectRef: string; status: "OPEN" | "REVIEWING" | "APPROVED" | "DENIED" | "CLOSED"; note: string; updatedAt: string }>;
  performance: { retentionDays: number; aggregateOnly: true };
  sandbox: { lastScenario: string | null; lastRunAt: string | null; lastResult: string | null };
};

export const DEFAULT_OPERATIONAL_STATE: OperationalState = {
  theaterAudio: { theaterEnabled: true, audioPriority: "live", liveAudioCompression: true, musicDuckingVolume: 8 },
  backgroundMusic: {
    enabled: true,
    lobbyEnabled: true,
    mode: "automatic",
    lobbyVolume: 32,
    liveDuckingVolume: 8,
    stopWhenLive: false,
    noticeSeconds: 5,
    tracks: []
  },
  redirects: [],
  campaigns: [],
  notifications: { cooldownMinutes: 90, lastQueuedAt: null, lastStatus: "idle", lastDeliveryState: null, lastFailure: null },
  coinPolicy: {
    immutableCoinValueCents: 50,
    disclosure: "Platform Coins can only be used for tipping during live streams and for eligible merchandise available on this website. Coins cannot be exchanged for cash and cannot be transferred outside the platform.",
    requireEveryPurchase: false,
    showInPurchase: true,
    showInWallet: true,
    showInFaq: true,
    showInReceipts: true
  },
  coinPackages: defaultCoinPackages,
  depositSchedule: { enabled: false, intervalHours: 8, lastRunAt: null, nextRunAt: null, lastResult: "never" },
  faq: [],
  appeals: [],
  performance: { retentionDays: 30, aggregateOnly: true },
  sandbox: { lastScenario: null, lastRunAt: null, lastResult: null }
};

function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, Math.floor(number))) : fallback;
}

function boundedText(value: unknown, fallback: string, maximum: number) {
  const text = String(value ?? fallback).trim();
  return (text || fallback).slice(0, maximum);
}

function normalizedCoinPackages(value: unknown) {
  const source = Array.isArray(value) && value.length ? value : defaultCoinPackages;
  return source.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const input = item as Record<string, unknown>;
    const amount = Math.max(1, Math.min(1000, Number(input.amount) || defaultCoinPackages[index % defaultCoinPackages.length].amount));
    const baseCoins = Math.max(1, Math.min(2000, Math.round(amount * 2)));
    return [{
      id: boundedText(input.id, `package-${index + 1}`, 80),
      name: boundedText(input.name, `Package ${index + 1}`, 100),
      label: boundedText(input.label, `$${amount} Package`, 120),
      description: boundedText(input.description, "Platform Coin package", 240),
      amount,
      baseCoins,
      bonusCoins: boundedInteger(input.bonusCoins, 0, 0, 300),
      bonusPercent: boundedInteger(input.bonusPercent, 0, 0, 15),
      badge: boundedText(input.badge, "", 24),
      highlighted: input.highlighted === true,
      enabled: input.enabled !== false,
      order: boundedInteger(input.order, index + 1, 1, 50)
    } satisfies CoinPackage];
  }).sort((a, b) => a.order - b.order || a.amount - b.amount).slice(0, 12);
}

function safeDestination(value: unknown): RedirectRule["destination"] | null {
  return value === "live" || value === "clips4sale" || value === "fansly" ? value : null;
}

export function validateRedirectDestination(value: unknown) {
  const destination = String(value || "").trim();
  if (!destination || /^javascript:/i.test(destination) || /^data:/i.test(destination) || /^vbscript:/i.test(destination)) return { ok: false as const, error: "Redirect destinations must use an approved destination." };
  if (destination.startsWith("/") && !destination.startsWith("//")) return { ok: true as const, destination };
  try {
    const parsed = new URL(destination);
    if (parsed.protocol !== "https:") return { ok: false as const, error: "External redirect destinations must use HTTPS." };
    const allowed = ["fansly.com", "www.fansly.com", "clips4sale.com", "www.clips4sale.com"];
    if (!allowed.includes(parsed.hostname.toLowerCase())) return { ok: false as const, error: "External redirect host is not approved." };
    return { ok: true as const, destination: parsed.toString() };
  } catch {
    return { ok: false as const, error: "Redirect destination is invalid." };
  }
}

export function normalizeOperationalState(value: unknown): OperationalState {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const theater = source.theaterAudio && typeof source.theaterAudio === "object" ? source.theaterAudio as Record<string, unknown> : {};
  const music = source.backgroundMusic && typeof source.backgroundMusic === "object" ? source.backgroundMusic as Record<string, unknown> : {};
  const notifications = source.notifications && typeof source.notifications === "object" ? source.notifications as Record<string, unknown> : {};
  const coinPolicy = source.coinPolicy && typeof source.coinPolicy === "object" ? source.coinPolicy as Record<string, unknown> : {};
  const schedule = source.depositSchedule && typeof source.depositSchedule === "object" ? source.depositSchedule as Record<string, unknown> : {};
  const performance = source.performance && typeof source.performance === "object" ? source.performance as Record<string, unknown> : {};
  const sandbox = source.sandbox && typeof source.sandbox === "object" ? source.sandbox as Record<string, unknown> : {};
  const rawTracks = Array.isArray(music.tracks) ? music.tracks : [];
  const tracks = rawTracks.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const track = item as Record<string, unknown>;
    const status: OperationalMusicTrack["status"] = track.status === "processing" || track.status === "unavailable" ? track.status : "approved";
    return [{
      id: boundedText(track.id, `track-${index + 1}`, 80),
      mediaId: track.mediaId ? boundedText(track.mediaId, "", 120) : null,
      title: boundedText(track.title, `Track ${index + 1}`, 100),
      artist: boundedText(track.artist, "XMASKEDFREAKS", 100),
      durationMinutes: boundedInteger(track.durationMinutes, 10, 1, 60),
      enabled: track.enabled !== false,
      order: boundedInteger(track.order, index + 1, 1, 1000),
      status
    }];
  }).sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
  return {
    theaterAudio: {
      theaterEnabled: theater.theaterEnabled !== false,
      audioPriority: theater.audioPriority === "notification" || theater.audioPriority === "music" ? theater.audioPriority : "live",
      liveAudioCompression: theater.liveAudioCompression !== false,
      musicDuckingVolume: boundedInteger(theater.musicDuckingVolume, 8, 0, 30)
    },
    backgroundMusic: {
      enabled: music.enabled !== false,
      lobbyEnabled: music.lobbyEnabled !== false,
      mode: music.mode === "lobby-only" || music.mode === "live-background" || music.mode === "disabled" ? music.mode : "automatic",
      lobbyVolume: boundedInteger(music.lobbyVolume, 32, 0, 100),
      liveDuckingVolume: boundedInteger(music.liveDuckingVolume, 8, 0, 30),
      stopWhenLive: music.stopWhenLive === true,
      noticeSeconds: boundedInteger(music.noticeSeconds, 5, 2, 15),
      tracks
    },
    redirects: Array.isArray(source.redirects) ? source.redirects.flatMap((item, index) => {
      if (!item || typeof item !== "object") return [];
      const rule = item as Record<string, unknown>;
      const destination = safeDestination(rule.destination);
      if (!destination) return [];
      const condition = rule.condition && typeof rule.condition === "object" ? rule.condition as Record<string, unknown> : {};
      return [{
        id: boundedText(rule.id, `redirect-${index + 1}`, 80),
        name: boundedText(rule.name, `Redirect ${index + 1}`, 120),
        enabled: rule.enabled !== false,
        source: boundedText(rule.source, "/go", 160),
        destination,
        condition: { start: boundedText(condition.start, "00:00", 5), end: boundedText(condition.end, "23:59", 5), offlineOnly: condition.offlineOnly !== false },
        priority: boundedInteger(rule.priority, index + 1, 1, 1000)
      }];
    }).sort((a, b) => a.priority - b.priority) : [],
    campaigns: Array.isArray(source.campaigns) ? source.campaigns.flatMap((item, index) => {
      if (!item || typeof item !== "object") return [];
      const campaign = item as Record<string, unknown>;
      return [{ id: boundedText(campaign.id, `campaign-${index + 1}`, 80), name: boundedText(campaign.name, `Campaign ${index + 1}`, 120), source: boundedText(campaign.source, "direct", 80), medium: boundedText(campaign.medium, "campaign", 80), code: boundedText(campaign.code, `campaign-${index + 1}`, 80), destination: boundedText(campaign.destination, "/", 160), enabled: campaign.enabled !== false }];
    }) : [],
    notifications: {
      cooldownMinutes: boundedInteger(notifications.cooldownMinutes, 90, 5, 10080),
      lastQueuedAt: typeof notifications.lastQueuedAt === "string" ? notifications.lastQueuedAt : null,
      lastStatus: notifications.lastStatus === "queued" || notifications.lastStatus === "sent" || notifications.lastStatus === "failed" || notifications.lastStatus === "blocked" ? notifications.lastStatus : "idle",
      lastDeliveryState: notifications.lastDeliveryState === "QUEUED" || notifications.lastDeliveryState === "PROVIDER_ACCEPTED" || notifications.lastDeliveryState === "DELIVERED" || notifications.lastDeliveryState === "FAILED" ? notifications.lastDeliveryState : null,
      lastFailure: typeof notifications.lastFailure === "string" ? notifications.lastFailure.slice(0, 240) : null
    },
    coinPolicy: {
      immutableCoinValueCents: 50,
      disclosure: boundedText(coinPolicy.disclosure, DEFAULT_OPERATIONAL_STATE.coinPolicy.disclosure, 1000),
      requireEveryPurchase: coinPolicy.requireEveryPurchase === true,
      showInPurchase: coinPolicy.showInPurchase !== false,
      showInWallet: coinPolicy.showInWallet !== false,
      showInFaq: coinPolicy.showInFaq !== false,
      showInReceipts: coinPolicy.showInReceipts !== false
    },
    coinPackages: normalizedCoinPackages(source.coinPackages),
    depositSchedule: {
      enabled: schedule.enabled === true,
      intervalHours: [1, 2, 4, 8].includes(Number(schedule.intervalHours)) ? Number(schedule.intervalHours) as DepositScheduleSettings["intervalHours"] : 8,
      lastRunAt: typeof schedule.lastRunAt === "string" ? schedule.lastRunAt : null,
      nextRunAt: typeof schedule.nextRunAt === "string" ? schedule.nextRunAt : null,
      lastResult: schedule.lastResult === "prepared" || schedule.lastResult === "failed" || schedule.lastResult === "provider_pending" ? schedule.lastResult : "never"
    },
    faq: Array.isArray(source.faq) ? source.faq.flatMap((item, index) => {
      if (!item || typeof item !== "object") return [];
      const faq = item as Record<string, unknown>;
      return [{ id: boundedText(faq.id, `faq-${index + 1}`, 80), question: boundedText(faq.question, "", 240), answer: boundedText(faq.answer, "", 2000), enabled: faq.enabled !== false, order: boundedInteger(faq.order, index + 1, 1, 1000) }];
    }).filter((item) => item.question && item.answer).sort((a, b) => a.order - b.order) : [],
    appeals: Array.isArray(source.appeals) ? source.appeals.flatMap((item, index) => {
      if (!item || typeof item !== "object") return [];
      const appeal = item as Record<string, unknown>;
      const status = ["OPEN", "REVIEWING", "APPROVED", "DENIED", "CLOSED"].includes(String(appeal.status)) ? String(appeal.status) as OperationalState["appeals"][number]["status"] : "OPEN";
      return [{ id: boundedText(appeal.id, `appeal-${index + 1}`, 80), subjectRef: boundedText(appeal.subjectRef, "unknown", 200), status, note: boundedText(appeal.note, "", 1000), updatedAt: boundedText(appeal.updatedAt, new Date(0).toISOString(), 40) }];
    }) : [],
    performance: { retentionDays: boundedInteger(performance.retentionDays, 30, 7, 365), aggregateOnly: true },
    sandbox: { lastScenario: typeof sandbox.lastScenario === "string" ? sandbox.lastScenario.slice(0, 80) : null, lastRunAt: typeof sandbox.lastRunAt === "string" ? sandbox.lastRunAt : null, lastResult: typeof sandbox.lastResult === "string" ? sandbox.lastResult.slice(0, 240) : null }
  };
}

export async function readOperationalState() {
  const service = serviceCredentials();
  if (!service) return { state: DEFAULT_OPERATIONAL_STATE, persisted: false };
  const response = await fetch(`${service.url}/rest/v1/admin_operational_state?state_key=eq.platform&select=payload&limit=1`, { cache: "no-store", headers: serviceHeaders(service) }).catch(() => null);
  if (!response?.ok) return { state: DEFAULT_OPERATIONAL_STATE, persisted: false };
  const rows = await response.json().catch(() => []) as Array<{ payload?: unknown }>;
  return { state: normalizeOperationalState(rows[0]?.payload), persisted: Boolean(rows.length) };
}

export async function writeOperationalState(state: OperationalState, adminId: string | null, eventType: string, eventPayload: Record<string, unknown>) {
  const service = serviceCredentials();
  if (!service) return { persisted: false, state };
  const payload = normalizeOperationalState(state);
  const saved = await fetch(`${service.url}/rest/v1/admin_operational_state?on_conflict=state_key`, {
    method: "POST",
    headers: serviceHeaders(service, "resolution=merge-duplicates,return=minimal"),
    body: JSON.stringify({ state_key: "platform", payload, updated_by: adminId, updated_at: new Date().toISOString() })
  }).catch(() => null);
  if (!saved?.ok) return { persisted: false, state: payload };
  await fetch(`${service.url}/rest/v1/admin_operational_events`, {
    method: "POST",
    headers: serviceHeaders(service, "return=minimal"),
    body: JSON.stringify({ event_type: eventType, payload: eventPayload, created_by: adminId })
  }).catch(() => undefined);
  return { persisted: true, state: payload };
}

export async function getOperationalReadiness() {
  const email = emailConfiguration();
  const emailHealth = await getEmailProvider().health();
  const ccbill = await getPaymentProviderReadiness("ccbill");
  const segpay = await getPaymentProviderReadiness("segpay");
  const storageProvider = getObjectStorageProvider();
  const storageHealth = await storageProvider.health();
  const obsConfigured = Boolean(process.env.OBS_STATUS_ENDPOINT || process.env.OBS_LIVE || process.env.OBS_STREAM_ACTIVE);
  const { state, persisted } = await readOperationalState();
  const workerRuns = await readRecentDepositWorkerRuns();
  const latestWorkerRun = workerRuns[0] || null;
  const geo = summarizeGeoVisitors(geoVisitors).map((item) => ({ countryCode: item.countryCode, country: item.country, timeZone: item.timeZone, activeVisitors: item.activeVisitors, uniqueVisitors: item.uniqueVisitors, returningVisitors: item.returningVisitors }));
  const emailConfigurationStatus = email.apiConfigured && email.senderConfigured ? "PRESENT" : "MISSING";
  return {
    state,
    persisted,
    stream: { status: process.env.OBS_LIVE === "true" || process.env.OBS_STREAM_ACTIVE === "true" ? "LIVE" : process.env.OBS_LIVE === "false" && process.env.OBS_STREAM_ACTIVE === "false" ? "OFFLINE" : "UNKNOWN", diagnosticsConfigured: obsConfigured },
    providers: {
      resend: { provider: "RESEND", status: emailHealth.status, mode: email.mode, software: "READY", configuration: emailConfigurationStatus, providerStatus: emailHealth.status === "HEALTHY" ? "CONNECTED" : "AWAITING APPROVAL", test: "NOT RUN", capabilities: ["TRANSACTIONAL_EMAIL", "READ_ONLY_HEALTH_PROBE"], senderConfigured: email.senderConfigured, detail: emailHealth.detail },
      ccbill: { provider: "CCBILL", status: ccbill.status, software: ccbill.software, configuration: ccbill.configuration, providerStatus: ccbill.providerStatus, test: ccbill.test, capabilities: ccbill.capabilities, detail: ccbill.detail },
      segpay: { provider: "SEGPAY", status: segpay.status, software: segpay.software, configuration: segpay.configuration, providerStatus: segpay.providerStatus, test: segpay.test, capabilities: segpay.capabilities, detail: segpay.detail }
    },
    storageCdn: {
      provider: storageProvider.kind,
      status: storageProvider.kind === "LOCAL" && String(process.env.XMF_ENVIRONMENT || process.env.APP_ENV || "LOCAL").toUpperCase() === "PRODUCTION" ? "NOT CONFIGURED" : storageHealth.status,
      software: "READY",
      configuration: storageProvider.kind === "LOCAL" ? "MISSING" : "PRESENT",
      providerStatus: storageProvider.kind === "LOCAL" ? "AWAITING APPROVAL" : storageHealth.status === "HEALTHY" ? "CONNECTED" : "ACTION REQUIRED",
      test: "NOT RUN",
      capabilities: ["PUBLIC_MEDIA", "PRIVATE_MEDIA", "SIGNED_DOWNLOADS"],
      detail: storageProvider.kind === "LOCAL" ? "Local storage is development-only. Configure an approved public/private storage and CDN provider before Production." : storageHealth.detail
    },
    payoutWorker: {
      provider: "INTERNAL_DEPOSIT_WORKER",
      status: latestWorkerRun ? String(latestWorkerRun.status) : serviceCredentials() ? "NOT RUN" : "NOT CONFIGURED",
      software: "READY",
      configuration: serviceCredentials() ? "PRESENT" : "MISSING",
      providerStatus: "AWAITING APPROVAL",
      test: "NOT RUN",
      capabilities: ["DURABLE_SCHEDULE", "LEDGER_AGGREGATION", "IDEMPOTENT_PREPARATION"],
      detail: latestWorkerRun ? `Last run ${String(latestWorkerRun.status)}; bank settlement remains disabled.` : "The worker can prepare an internal payout record, but it never submits a bank settlement.",
      lastRunAt: latestWorkerRun ? String(latestWorkerRun.completed_at || latestWorkerRun.started_at || latestWorkerRun.scheduled_at || "") : null
    },
    depositRuns: workerRuns,
    geo,
    coinPackages: state.coinPackages,
    support: { status: serviceCredentials() ? "CONNECTED" : "UNVERIFIED", casesAvailable: Boolean(serviceCredentials()) },
    moderation: { status: "MANUAL ADMIN DECISION", appeals: state.appeals.length },
    performance: { retentionDays: state.performance.retentionDays, aggregateOnly: true, source: "existing reliability and client motion telemetry" },
    sandbox: { active: true, lastScenario: state.sandbox.lastScenario, lastRunAt: state.sandbox.lastRunAt, result: state.sandbox.lastResult }
  };
}

async function readRecentDepositWorkerRuns() {
  const service = serviceCredentials();
  if (!service) return [] as Array<Record<string, unknown>>;
  const response = await fetch(`${service.url}/rest/v1/admin_deposit_worker_runs?select=run_key,status,scheduled_at,started_at,completed_at,duration_ms,attempt_count,records_processed,eligible_amount_minor,payout_request_id,result,failure_reason,provider_action_required&order=scheduled_at.desc&limit=20`, { cache: "no-store", headers: serviceHeaders(service) }).catch(() => null);
  return response?.ok ? await response.json().catch(() => []) as Array<Record<string, unknown>> : [];
}

export async function getPublicLiveOperationalSettings() {
  const { state } = await readOperationalState();
  return {
    theaterAudio: state.theaterAudio,
    backgroundMusic: {
      ...state.backgroundMusic,
      tracks: state.backgroundMusic.tracks.filter((track) => track.enabled && track.status === "approved").map((track) => ({ ...track, src: "" }))
    },
    coinPackages: state.coinPackages.filter((item) => item.enabled).sort((left, right) => left.order - right.order)
  };
}

export async function getOperationalCoinPackage(packageId: string) {
  const { state } = await readOperationalState();
  return state.coinPackages.find((item) => item.id === packageId && item.enabled) || null;
}
