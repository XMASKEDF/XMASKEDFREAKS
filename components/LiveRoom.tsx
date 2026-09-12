"use client";

import Image from "next/image";
import { CSSProperties, ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import BrandLogo from "@/components/BrandLogo";
import PublicNavigation from "@/components/PublicNavigation";
import { useI18n } from "@/components/I18nProvider";
import { useStreamPlaybackStatus } from "@/hooks/useStreamPlaybackStatus";
import { useLiveDeliverySession } from "@/hooks/useLiveDeliverySession";
import { useLiveViewerPresence } from "@/hooks/useLiveViewerPresence";
import { useLiveViewingCredit } from "@/hooks/useLiveViewingCredit";
import LiveVideoSurface from "@/components/LiveVideoSurface";
import {
  appConfig,
  defaultCoinPackages,
  defaultCostProviders,
  defaultRedirectOfflineBlocks,
  defaultGames,
  defaultTips,
  defaultVideoProviderConfig,
  GameItem,
  CostProvider,
  CoinPackage,
  RedirectOfflineBlock,
  quoteCoinPackage,
  getProviderLabel,
  resolveVideoSource,
  TipItem,
  VideoProvider,
  VideoProviderConfig
} from "@/lib/config";
import { canStartProtectedLivePlayback } from "@/lib/contribution-policy";
import { HOURLY_RATE_COINS } from "@/lib/live/viewing-credit";
import {
  fallbackMessages,
  formatCurrency,
  formatLanguageLabel,
  formatNumber,
  getLocaleLabel,
  languageOptions,
  normalizeLocale,
  type LocaleCode
} from "@/lib/i18n";
import {
  commonTimeZones,
  detectPreferredTimeZone,
  formatStreamWindow,
  nextStreamStart,
  platformTimeZone,
  rememberTimeZone,
  streamWindows
} from "@/lib/timezone";
import { maskRecoveryCode, shouldRequireTwoFactor } from "@/lib/auth-policy";
import { calculateNextDepositAt, depositScheduleOptions, DepositFrequency, formatDepositScheduleLabel } from "@/lib/deposit-schedule";
import {
  formatGeoClock,
  geoDateFilters,
  geoReportCadence,
  geoTrafficSources,
  geoVisitors,
  referralConversionFilters,
  referralDateFilters,
  referralEvents,
  referralSourceTypes,
  summarizeReferrals,
  summarizeGeoVisitors
} from "@/lib/geo";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import SupportWidget from "@/components/SupportWidget";
import FaqSection from "@/components/FaqSection";
import { usePrivacyConsent } from "@/components/privacy/PrivacyConsentManager";
import TipMenu from "@/components/TipMenu";
import RefillResumeModal, { type RefillResumeReason } from "@/components/RefillResumeModal";
import LiveCoinPurchaseOverlay from "@/components/LiveCoinPurchaseOverlay";
import QuickLiveTipModal from "@/components/QuickLiveTipModal";
import LiveCommentFeed from "@/components/live/LiveCommentFeed";
import { DEFAULT_TIP_MENU_SETTINGS, DEFAULT_TIP_OPTIONS, type TipMenuSettings, type TipOption } from "@/lib/tips";
import { tipPhraseKey } from "@/lib/tips";

function cleanName(value: string) {
  return (value || "Masked_guest").replace(/[^a-z0-9_]/gi, "").trim().slice(0, 20) || "Masked_guest";
}

function formatTimer(seconds: number) {
  const hours = Math.floor(seconds / 3600).toString().padStart(2, "0");
  const minutes = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
  const secs = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}:${secs}`;
}

function deterministicBucket(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0) % 100;
}

const requiredGateCheckKeys = ["age.check1", "age.check2", "age.check3"];
const defaultCoinUsageDisclosure = "Platform coins are digital credits used inside XMASKEDFREAKS for eligible features such as tipping, supported platform activities, and approved digital items or merchandise when available. Coins cannot be exchanged for cash, withdrawn, or transferred outside the platform.";

const prohibitedWords = ["racial slur", "threat", "harass"];

const supportAgents = [
  { id: "atlas", name: "Atlas", avatar: "A", color: "#5ee7ff", role: "Backend and API engineer", saying: "I’m tracing the request path now.", hours: "Every day, 24/7 diagnostics", capabilities: "APIs, server logic, queues, scheduled jobs, database connections, auth flows, service failures", tools: "API logs, queue health, job retry checks, database connection tests, auth flow traces", autoResponse: "Inspect evidence, isolate the failing service, test the safest request-path explanation", escalation: "Escalate cross-system failures or risky database/security changes to Claude", status: "Tracing API, queue, database, and auth health." },
  { id: "pixel", name: "Pixel", avatar: "P", color: "#ff8fd6", role: "Frontend and interface engineer", saying: "I found the point where the experience breaks.", hours: "Every day, visual QA", capabilities: "Layout, responsiveness, accessibility, browser errors, visual bugs, user interaction", tools: "Console checks, responsive previews, accessibility checks, interaction tests, UI regression notes", autoResponse: "Confirm the visible break, test across screen sizes, recommend a low-risk UI repair", escalation: "Escalate when visual issues depend on backend, payments, auth, or live services", status: "Reviewing layout, mobile behavior, and interaction quality." },
  { id: "ledger", name: "Ledger", avatar: "L", color: "#9dff72", role: "Payments and wallet specialist", saying: "I’m reconciling the transaction before changing anything.", hours: "Every day, payment watch", capabilities: "Payment status, wallet balances, duplicate events, processor webhooks, refunds, financial logs", tools: "Webhook logs, transaction references, wallet ledger checks, duplicate-event detection, refund review packets", autoResponse: "Reconcile records before any recommendation and never expose full card data", escalation: "Require admin approval for refunds, payouts, balance corrections, or risk threshold changes", status: "Reconciling wallet, webhook, and transaction health." },
  { id: "echo", name: "Echo", avatar: "E", color: "#ffe45e", role: "Live interaction and audio specialist", saying: "I’m checking the live signal from source to viewer.", hours: "Every day, live room watch", capabilities: "OBS, stream status, chat delivery, notification timing, audio priority, real-time events", tools: "OBS status checks, realtime event logs, chat delivery tests, notification timing, audio priority diagnostics", autoResponse: "Check source signal, event timing, and viewer delivery before recommending changes", escalation: "Escalate source/provider failures or realtime outages to Claude with Nova and Atlas", status: "Checking OBS, chat, notifications, and audio priority." },
  { id: "nova", name: "Nova", avatar: "N", color: "#b088ff", role: "Playback and technical support specialist", saying: "I’m testing the viewer’s path across device and browser conditions.", hours: "Every day, 24/7", capabilities: "Visitor-facing buffering, resolution, device compatibility, browser behavior, login trouble, page loading, and playback recovery", tools: "Device checks, browser compatibility notes, playback recovery tests, provider fallback checks", autoResponse: "Guide refresh, jump live, bandwidth and browser checks", escalation: "Escalate persistent playback failures or provider outages to Claude with Echo and Pixel", status: "Watching playback health and browser support notes." },
  { id: "route", name: "Route", avatar: "R", color: "#f6a85f", role: "Navigation, redirect, campaign, and attribution specialist", saying: "I’m following the visitor path from entry to destination.", hours: "Every day, traffic watch", capabilities: "Redirects, campaign parameters, referral data, destination rules, conversion paths", tools: "Redirect logs, campaign parameters, referral analytics, destination-rule tests, conversion path checks", autoResponse: "Trace entry source, route decision, destination, and conversion outcome", escalation: "Escalate if payment, auth, security, or live-state priority changes the route", status: "Auditing redirect, referral, and conversion paths." },
  { id: "riley", name: "Riley", avatar: "R", color: "#73d2ff", role: "Customer billing and wallet support specialist", saying: "I’ll keep this calm and verify the details first.", hours: "Every day, 8 AM-11 PM", capabilities: "Customer-facing deposit help, saved-payment questions, masked card references, wallet support", tools: "Support history, masked payment references, wallet status summaries, admin escalation packets", autoResponse: "Collect receipt email, amount, transaction time, and explain next steps clearly", escalation: "Escalate verified financial issues to Ledger; escalate refunds or duplicate charges to admin", status: "Checking customer wallet questions and billing support queues." },
  { id: "sage", name: "Sage", avatar: "S", color: "#ff6b7a", role: "Moderation, account safety, and policy specialist", saying: "I’m checking the behavior against the platform rules and safety history.", hours: "Every day, 24/7", capabilities: "Bans, appeals, abuse patterns, prohibited language, account risk", tools: "Moderation logs, appeal records, prohibited phrase rules, account risk history, ban-duration controls", autoResponse: "Compare behavior to policy and safety history before enforcement recommendations", escalation: "Require admin approval for permanent bans, account ownership, or policy changes", status: "Reviewing account and moderation queues." },
  { id: "todd", name: "Todd", avatar: "T", color: "#ffd166", role: "Game and interactive experience specialist", saying: "I’m testing the game loop and player difficulty.", hours: "Every day, during live room games", capabilities: "Game health, leaderboards, controls, difficulty balancing, embedded interaction", tools: "Game loop checks, input tests, leaderboard logs, difficulty metrics, muted-audio validation", autoResponse: "Troubleshoot broken games without interrupting the stream", escalation: "Escalate repeated game errors, leaderboard issues, or cross-page event problems to Claude", status: "Running game QA checks and leaderboard scans." },
  { id: "maya", name: "Maya", avatar: "M", color: "#7dff9b", role: "Quiet introduction, language, tipping, and customer guidance assistant", saying: "I’ll help only where it keeps the live experience smooth.", hours: "Every day, 24/7 quiet mode", capabilities: "Website basics, wallet overview, tipping guidance, language-aware help, soft onboarding", tools: "FAQ answers, language preference, tip guidance, support routing, notification copy", autoResponse: "Quiet, helpful, concise, language-aware", escalation: "Escalate billing, access, safety, or unresolved issues through Claude while Maya keeps the conversation", status: "Greeting visitors and routing support quietly." }
];

const visitorSupportAgentIds = ["maya", "riley", "nova", "sage"];
const hiddenSpecialistAgentIds = ["atlas", "pixel", "ledger", "echo", "route", "todd"];
const visitorSupportAgents = supportAgents.filter((agent) => visitorSupportAgentIds.includes(agent.id));
const hiddenSpecialistAgents = supportAgents.filter((agent) => hiddenSpecialistAgentIds.includes(agent.id));
const greenCoinSrc = "/branding/green-coin.png";

function CoinIcon({ className = "coin-icon" }: { className?: string }) {
  return <Image className={className} src={greenCoinSrc} alt="" aria-hidden="true" width={64} height={64} />;
}

function CoinValue({ value, language, label = "coins" }: { value: number; language: LocaleCode; label?: string }) {
  return (
    <span className="coin-value">
      <CoinIcon />
      <span>{formatNumber(value, language)} {label}</span>
    </span>
  );
}

type LiveRoomProps = {
  sandbox?: boolean;
  gamesEnabled?: boolean;
  playbackSource?: string | null;
  playbackConfigured?: boolean;
};

type ScoreEntry = {
  gameId: string;
  gameTitle: string;
  displayName: string;
  score: number;
  sessionSeconds: number;
  createdAt: string;
};

type GameSession = {
  plays: number;
  totalSeconds: number;
  totalScore: number;
};

type MusicTrack = {
  id: string;
  mediaId?: string | null;
  title: string;
  artist: string;
  src: string;
  durationMinutes: number;
  enabled: boolean;
  order: number;
  type: "audio" | "mp4-audio" | "demo";
};

type BackgroundMusicSettings = {
  enabled: boolean;
  mode: "automatic" | "lobby-only" | "live-background" | "disabled";
  playlistName: string;
  preshowPlaylistName: string;
  shuffle: boolean;
  repeat: boolean;
  crossfadeSeconds: number;
  lobbyVolume: number;
  liveDuckingVolume: number;
  preLiveStartMinutes: number;
  postLiveBehavior: "resume" | "post-show" | "stop";
  stopWhenLive: boolean;
  noticeSeconds: number;
  cacheMinutes: number;
  tracks: MusicTrack[];
};

type AccessSettings = {
  accessWindowMinutes: number;
  minimumPayment: number;
  coinEquivalent: number;
  checkoutTimerSeconds: number;
  blurStrength: number;
  unlockDurationMinutes: number;
  clipsRedirectPercent: number;
  fanslyRedirectPercent: number;
  clipsUrl: string;
  fanslyUrl: string;
  retryLimit: number;
  notificationText: string;
};

type SecurityEvent = {
  ipAddress: string;
  country: string;
  browser: string;
  userAgent: string;
  endpoint: string;
  reason: string;
  action: "blocked" | "throttled" | "logged";
  score: number;
  requestRate: number;
  createdAt: string;
};

type RewardEvent = {
  id: string;
  name: string;
  amount: number;
  coins?: number;
  label: string;
  emoji: string;
  animation?: string;
  color?: string;
  durationSeconds?: number;
  sound?: string;
  createdAt: string;
};

type ModerationLog = {
  id: string;
  displayName: string;
  reason: string;
  enforcement: string;
  appealStatus: string;
  deviceSignal: string;
  messagePreview: string;
  permanent: boolean;
  expiresAt: string | null;
  createdAt: string;
};

const banDurationOptions = [
  { label: "1 Hour", hours: 1 },
  { label: "6 Hours", hours: 6 },
  { label: "12 Hours", hours: 12 },
  { label: "24 Hours", hours: 24 },
  { label: "48 Hours", hours: 48 },
  { label: "7 Days", hours: 168 },
  { label: "30 Days", hours: 720 },
  { label: "Indefinitely", hours: null }
] as const;

type WalletTransaction = {
  id: string;
  type: "deposit" | "tip" | "refund" | "adjustment";
  amount: number;
  baseCoins: number;
  bonusCoins: number;
  totalCoins: number;
  reference: string;
  status: string;
  note: string;
  createdAt: string;
};

type CoinPolicySettings = {
  disclosure: string;
  requireEveryPurchase: boolean;
  showInPurchase: boolean;
  showInWallet: boolean;
  showInFaq: boolean;
  showInReceipts: boolean;
  merchandiseEnabled: boolean;
  eligibleMerchandise: string;
};

type CoinPolicyLog = {
  type: string;
  detail: string;
  user: string;
  createdAt: string;
};

type SecurityRule = {
  type: string;
  value: string;
  reason: string;
};

const defaultSecurityEvents: SecurityEvent[] = [
  { ipAddress: "203.0.113.42", country: "US", browser: "Chrome", userAgent: "Mozilla/5.0", endpoint: "/api/auth/login", reason: "Excessive login attempts", action: "throttled", score: 62, requestRate: 112, createdAt: "2 min ago" },
  { ipAddress: "198.51.100.14", country: "NL", browser: "Unknown", userAgent: "curl/8.0", endpoint: "/api/support", reason: "Bot user agent", action: "blocked", score: 88, requestRate: 194, createdAt: "5 min ago" },
  { ipAddress: "192.0.2.88", country: "BR", browser: "Firefox", userAgent: "Mozilla/5.0", endpoint: "/#clips", reason: "Rapid page requests", action: "throttled", score: 51, requestRate: 96, createdAt: "9 min ago" },
  { ipAddress: "203.0.113.77", country: "DE", browser: "Python", userAgent: "python-requests", endpoint: "/api/referrals", reason: "Automated scraping behavior", action: "blocked", score: 91, requestRate: 231, createdAt: "14 min ago" }
];

const defaultBackgroundMusic: BackgroundMusicSettings = {
  enabled: true,
  mode: "automatic",
  playlistName: "Midnight Lobby",
  preshowPlaylistName: "Pre-show pulse",
  shuffle: false,
  repeat: true,
  crossfadeSeconds: 4,
  lobbyVolume: 32,
  liveDuckingVolume: 8,
  preLiveStartMinutes: 20,
  postLiveBehavior: "resume",
  stopWhenLive: false,
  noticeSeconds: 5,
  cacheMinutes: 60,
  tracks: [
    { id: "lobby-1", title: "Velvet Signal", artist: "XMASKEDFREAKS", src: "", durationMinutes: 18, enabled: true, order: 1, type: "demo" },
    { id: "lobby-2", title: "Green Room Pulse", artist: "XMASKEDFREAKS", src: "", durationMinutes: 22, enabled: true, order: 2, type: "demo" },
    { id: "lobby-3", title: "After Dark Hold", artist: "XMASKEDFREAKS", src: "", durationMinutes: 20, enabled: true, order: 3, type: "demo" }
  ]
};

export default function LiveRoom({ sandbox = false, gamesEnabled = true, playbackSource = null, playbackConfigured }: LiveRoomProps) {
  const { locale: language, setLocale, t } = useI18n();
  const { consent, ready: consentReady } = usePrivacyConsent();
  const scoresLoadedRef = useRef(false);
  const coinPolicyReadyRef = useRef(false);
  const tipSessionRef = useRef(`tip-session-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lobbyAudioRef = useRef<HTMLAudioElement | null>(null);
  const lobbyNoticeTimerRef = useRef<number | null>(null);
  const rewardChannelRef = useRef<BroadcastChannel | null>(null);
  const coinPolicyActorRef = useRef("Guest");
  const liveAudioEnhancerRef = useRef<{
    ready: boolean;
    video?: HTMLVideoElement;
    context?: AudioContext;
    nodes?: AudioNode[];
    profile?: string;
    unsupported?: boolean;
    reason?: string;
  } | null>(null);
  const setupLiveAudioEnhancementRef = useRef<() => boolean>(() => false);
  const trackQuickTipAnalytics = useCallback((eventType: "live_quick_tip_opened" | "live_quick_tip_selected" | "live_quick_tip_payment_initiated" | "live_quick_tip_payment_cancelled" | "live_quick_tip_payment_failed", metadata: Record<string, string | number> = {}) => {
    if (!consentReady || !consent.analytics || typeof window === "undefined") return;
    const payload = JSON.stringify({
      eventType,
      eventKey: `quick-tip:${eventType}:${Date.now()}:${Math.random().toString(36).slice(2)}`,
      pagePath: "/live",
      languageCode: language,
      deviceType: window.matchMedia("(max-width: 680px)").matches ? "mobile" : window.matchMedia("(max-width: 1024px)").matches ? "tablet" : "desktop",
      environment: sandbox ? "sandbox" : "production",
      metadata
    });
    void fetch("/api/analytics/events", { method: "POST", headers: { "content-type": "application/json" }, body: payload, keepalive: true }).catch(() => undefined);
  }, [consent.analytics, consentReady, language, sandbox]);
  const [timeZone, setTimeZone] = useState(platformTimeZone);
  const [timeZoneDetected, setTimeZoneDetected] = useState(true);
  const [missingTranslations, setMissingTranslations] = useState<string[]>([]);
  const [ageOk, setAgeOk] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [twoFactorPromptOpen, setTwoFactorPromptOpen] = useState(false);
  const [trustDevice, setTrustDevice] = useState(true);
  const [userTwoFactorEnabled, setUserTwoFactorEnabled] = useState(false);
  const [trustedDevice, setTrustedDevice] = useState(false);
  const [trustedDeviceDays, setTrustedDeviceDays] = useState(30);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [accountSecurityStatus, setAccountSecurityStatus] = useState("2FA is optional for standard users.");
  const [userId, setUserId] = useState<string | null>(null);
  const [status, setStatus] = useState("Logged out");
  const [tipTotal, setTipTotal] = useState(0);
  const [tipTotalTokens, setTipTotalTokens] = useState(0);
  const [recentTip, setRecentTip] = useState("No tips yet");
  const [rewardEmojis, setRewardEmojis] = useState("💰,💸,🤑");
  const [rewardAnimation, setRewardAnimation] = useState("slide");
  const [rewardColor, setRewardColor] = useState("#7dff9b");
  const [rewardDisplaySeconds, setRewardDisplaySeconds] = useState(10);
  const [rewardSound, setRewardSound] = useState("ching");
  const [liveSeconds, setLiveSeconds] = useState(0);
  const [tips, setTips] = useState<TipItem[]>(defaultTips);
  const [tokenBalance, setTokenBalance] = useState<number | null>(null);
  const [tipMenuSettings, setTipMenuSettings] = useState<TipMenuSettings>(DEFAULT_TIP_MENU_SETTINGS);
  const [tipMenuOpen, setTipMenuOpen] = useState(false);
  const [tipProcessingId, setTipProcessingId] = useState<string | null>(null);
  const [tipSuccessfulId, setTipSuccessfulId] = useState<string | null>(null);
  const [tipFeedback, setTipFeedback] = useState("");
  const [pendingTip, setPendingTip] = useState<TipOption | null>(null);
  const [refillResumeReason, setRefillResumeReason] = useState<RefillResumeReason | null>(null);
  const reminderTipActionRef = useRef<() => void>(() => undefined);
  const reminderBuyCoinsActionRef = useRef<() => void>(() => undefined);
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [adminCode, setAdminCode] = useState("");
  const [notifications, setNotifications] = useState<string[]>([]);
  const [videoConfig, setVideoConfig] = useState<VideoProviderConfig>(defaultVideoProviderConfig);
  const [livePlaybackRuntime, setLivePlaybackRuntime] = useState<{ ready: boolean; configured: boolean; source: string | null }>({ ready: playbackConfigured !== undefined, configured: playbackConfigured === true, source: playbackSource });
  const [gateChecks, setGateChecks] = useState<boolean[]>(requiredGateCheckKeys.map(() => false));
  const [theaterMode, setTheaterMode] = useState(false);
  const [theaterEnabled, setTheaterEnabled] = useState(true);
  const [audioPriority, setAudioPriority] = useState<"live" | "notification" | "music">("live");
  const [immersiveMode, setImmersiveMode] = useState(false);
  const [videoMuted, setVideoMuted] = useState(true);
  const [walletBalance, setWalletBalance] = useState(0);
  const [coinPackages, setCoinPackages] = useState<CoinPackage[]>(defaultCoinPackages);
  const [selectedCoinPackageId, setSelectedCoinPackageId] = useState<string | null>(null);
  const [coinRefillOverlayOpen, setCoinRefillOverlayOpen] = useState(false);
  const coinPurchaseInFlightRef = useRef(false);
  const [coinPurchaseSubmitting, setCoinPurchaseSubmitting] = useState(false);
  const [quickTipOpen, setQuickTipOpen] = useState(false);
  const [selectedQuickTipId, setSelectedQuickTipId] = useState<string | null>(null);
  const [quickTipSubmitting, setQuickTipSubmitting] = useState(false);
  const [quickTipStatus, setQuickTipStatus] = useState("");
  const quickTipInFlightRef = useRef(false);
  const [mayaPackageConfirmed, setMayaPackageConfirmed] = useState(false);
  const [walletMaxPurchase, setWalletMaxPurchase] = useState(1000);
  const [depositFrequency, setDepositFrequency] = useState<DepositFrequency>("hourly");
  const [lastDepositAt, setLastDepositAt] = useState("2026-07-16T08:00:00.000Z");
  const [depositStatus, setDepositStatus] = useState("Deposit schedule ready. Payout worker connection required for production.");
  const [walletTransactions, setWalletTransactions] = useState<WalletTransaction[]>([]);
  const [coinPolicy, setCoinPolicy] = useState<CoinPolicySettings>({
    disclosure: defaultCoinUsageDisclosure,
    requireEveryPurchase: false,
    showInPurchase: true,
    showInWallet: true,
    showInFaq: true,
    showInReceipts: true,
    merchandiseEnabled: true,
    eligibleMerchandise: "Future platform-approved merchandise only"
  });
  const [coinPolicyAcknowledged, setCoinPolicyAcknowledged] = useState(false);
  const [hostedPaymentTermsAccepted, setHostedPaymentTermsAccepted] = useState(false);
  const [coinPolicyLogs, setCoinPolicyLogs] = useState<CoinPolicyLog[]>([]);
  const [moderationRules, setModerationRules] = useState(prohibitedWords.join("\n"));
  const [moderationLevel, setModerationLevel] = useState<"remove" | "temporary" | "permanent">("temporary");
  const [moderationBanHours, setModerationBanHours] = useState(720);
  const [moderationBanDuration, setModerationBanDuration] = useState("720");
  const [moderationPermanentBan, setModerationPermanentBan] = useState(false);
  const [moderationAppealStatus, setModerationAppealStatus] = useState("Not requested");
  const [moderationFilter, setModerationFilter] = useState<"all" | "temporary" | "permanent">("all");
  const [moderationLogs, setModerationLogs] = useState<ModerationLog[]>([]);
  const [moderationBlocked, setModerationBlocked] = useState(false);
  const [moderationNotice, setModerationNotice] = useState("");
  const [games, setGames] = useState<GameItem[]>(defaultGames);
  const [activeGameId, setActiveGameId] = useState(defaultGames[0].id);
  const [scoreEntries, setScoreEntries] = useState<ScoreEntry[]>([]);
  const [gameSessions, setGameSessions] = useState<Record<string, GameSession>>({});
  const [toddReports, setToddReports] = useState<string[]>(["Todd: Game system idle. Audio muted by default."]);
  const [supportAdminEmail, setSupportAdminEmail] = useState(appConfig.depositEmail);
  const [supportAgentActivities, setSupportAgentActivities] = useState<Record<string, string>>(
    Object.fromEntries(supportAgents.map((agent) => [agent.id, agent.status]))
  );
  const [supportEscalations, setSupportEscalations] = useState<Array<{ agent: string; issue: string; createdAt: string; user: string }>>([]);
  const [newGameTitle, setNewGameTitle] = useState("");
  const [geoSelectedCountry, setGeoSelectedCountry] = useState("US");
  const [geoDateFilter, setGeoDateFilter] = useState(geoDateFilters[0]);
  const [geoTrafficFilter, setGeoTrafficFilter] = useState(geoTrafficSources[0]);
  const [geoDeviceFilter, setGeoDeviceFilter] = useState("All devices");
  const [referralSelectedSource, setReferralSelectedSource] = useState("JuicyAds");
  const [referralDateFilter, setReferralDateFilter] = useState(referralDateFilters[0]);
  const [referralSourceFilter, setReferralSourceFilter] = useState(referralSourceTypes[0]);
  const [referralConversionFilter, setReferralConversionFilter] = useState(referralConversionFilters[0]);
  const [securityEvents] = useState<SecurityEvent[]>(defaultSecurityEvents);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    document.documentElement.classList.toggle("xmf-live-immersive", immersiveMode);
    return () => document.documentElement.classList.remove("xmf-live-immersive");
  }, [immersiveMode]);
  const [securityRules, setSecurityRules] = useState<SecurityRule[]>([
    { type: "IP blacklist", value: "198.51.100.14", reason: "Bot user agent" },
    { type: "User agent blacklist", value: "sqlmap", reason: "Attack signature" },
    { type: "Country watch", value: "High-risk bursts", reason: "Traffic spike monitoring" }
  ]);
  const [securityRuleValue, setSecurityRuleValue] = useState("");
  const [securityRuleType, setSecurityRuleType] = useState("IP blacklist");
  const [securityStatus, setSecurityStatus] = useState("Middleware security layer ready. Configure Cloudflare WAF, rate limits, bot fight mode, and DDoS protection before production traffic.");
  const [adminRequireTwoFactor, setAdminRequireTwoFactor] = useState(true);
  const [standardTwoFactorOptional, setStandardTwoFactorOptional] = useState(true);
  const [adminAuthStatus, setAdminAuthStatus] = useState("Admins must pass 2FA before sensitive dashboard actions. Standard users stay fast by default.");
  const [liveAlertsEmail, setLiveAlertsEmail] = useState(true);
  const [futurePushAlerts, setFuturePushAlerts] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState(2);
  const [paymentStatus, setPaymentStatus] = useState("No payment prepared yet.");
  const [paymentRiskThreshold, setPaymentRiskThreshold] = useState(75);
  const [fastTipThreshold, setFastTipThreshold] = useState(50);
  const [costProviders, setCostProviders] = useState<CostProvider[]>(defaultCostProviders);
  const [monthlyBudget, setMonthlyBudget] = useState(appConfig.costMonthlyBudget);
  const [costWarningThreshold, setCostWarningThreshold] = useState(appConfig.costWarningThreshold);
  const [financePermission, setFinancePermission] = useState<"readonly" | "finance">("readonly");
  const [manualCostText, setManualCostText] = useState(defaultCostProviders.map((item) => [
    item.category,
    item.provider,
    item.fixedMonthly,
    item.usageMonthly,
    item.usagePercent,
    item.freeRemaining,
    item.feature
  ].join("|")).join("\n"));
  const [costStatus, setCostStatus] = useState("Read-only financial mode.");
  const [redirectClipsPercent, setRedirectClipsPercent] = useState(appConfig.redirectClipsSplitPercent);
  const [redirectManualDestination, setRedirectManualDestination] = useState("automatic");
  const [redirectOfflineBlocks, setRedirectOfflineBlocks] = useState<RedirectOfflineBlock[]>(defaultRedirectOfflineBlocks);
  const [redirectStatus, setRedirectStatus] = useState("OBS live detection has priority over every redirect rule.");
  const [redirectLogPreview, setRedirectLogPreview] = useState([
    { destination: "live", reason: "OBS live priority", referrer: "Direct", createdAt: "Ready" },
    { destination: "clips4sale", reason: "Offline deterministic split", referrer: "Campaign", createdAt: "Ready" },
    { destination: "fansly", reason: "Offline deterministic split", referrer: "Social", createdAt: "Ready" }
  ]);
  const [backgroundMusic, setBackgroundMusic] = useState<BackgroundMusicSettings>(defaultBackgroundMusic);
  const [musicTrackText, setMusicTrackText] = useState(defaultBackgroundMusic.tracks.map((track) => `${track.title}|${track.artist}|${track.src}|${track.durationMinutes}|${track.enabled}`).join("\n"));
  const [musicIndex, setMusicIndex] = useState(0);
  const [musicRuntime, setMusicRuntime] = useState<"offline" | "live">("offline");
  const [musicCacheStatus, setMusicCacheStatus] = useState("60 / 60 min cache metadata ready");
  const [musicMixStatus, setMusicMixStatus] = useState("Live audio priority");
  const [musicLogs, setMusicLogs] = useState<Array<{ message: string; createdAt: string; level: string }>>([]);
  const [nowPlayingVisible, setNowPlayingVisible] = useState(false);
  const [accessExpiresAt, setAccessExpiresAt] = useState(Date.now() + appConfig.accessWindowMinutes * 60_000);
  const [accessLocked, setAccessLocked] = useState(false);
  const [accessLockReason, setAccessLockReason] = useState("");
  const [contributionStateReady, setContributionStateReady] = useState(false);
  const [contributionRestricted, setContributionRestricted] = useState(false);
  const [contributionUnpaidPlaybackStopped, setContributionUnpaidPlaybackStopped] = useState(false);
  const [checkoutRemaining, setCheckoutRemaining] = useState(appConfig.checkoutTimerSeconds);
  const [checkoutActive, setCheckoutActive] = useState(false);
  const [accessPanelPin, setAccessPanelPin] = useState("");
  const [accessPanelUnlocked, setAccessPanelUnlocked] = useState(false);
  const [accessPanelStatus, setAccessPanelStatus] = useState("Sensitive panel locked.");
  const [accessRedirectHistory, setAccessRedirectHistory] = useState<Array<{ destination: string; reason: string; createdAt: string }>>([]);
  const [accessSettings, setAccessSettings] = useState<AccessSettings>({
    accessWindowMinutes: appConfig.accessWindowMinutes,
    minimumPayment: appConfig.minimumAccessPayment,
    coinEquivalent: appConfig.minimumAccessCoins,
    checkoutTimerSeconds: appConfig.checkoutTimerSeconds,
    blurStrength: appConfig.accessBlurStrength,
    unlockDurationMinutes: appConfig.unlockDurationMinutes,
    clipsRedirectPercent: appConfig.redirectClipsPercent,
    fanslyRedirectPercent: appConfig.redirectFanslyPercent,
    clipsUrl: appConfig.clipsRedirectUrl,
    fanslyUrl: appConfig.fanslyRedirectUrl,
    retryLimit: appConfig.accessRetryLimit,
    notificationText: `A minimum contribution of ${formatCurrency(appConfig.minimumAccessPayment, "en")} or ${appConfig.minimumAccessCoins} coins applies to each ${appConfig.accessWindowMinutes}-minute period. The old $25 watch requirement has been removed.`
  });

  const supabase = useMemo(() => {
    try {
      return createSupabaseBrowserClient();
    } catch {
      return null;
    }
  }, []);

  const tokenApiHeaders = useCallback(async () => {
    if (!supabase) return null;
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    return accessToken ? { authorization: `Bearer ${accessToken}` } : null;
  }, [supabase]);

  const refreshTokenWallet = useCallback(async () => {
    const authHeaders = await tokenApiHeaders();
    const response = await fetch("/api/tips", { cache: "no-store", headers: authHeaders || undefined }).catch(() => null);
    if (!response?.ok) return false;
    const result = await response.json() as { tokenBalance?: number | null; options?: TipOption[]; settings?: TipMenuSettings };
    if (Array.isArray(result.options) && result.options.length) setTips(result.options);
    if (result.settings) setTipMenuSettings(result.settings);
    setTokenBalance(result.tokenBalance === null || result.tokenBalance === undefined ? null : Math.max(0, Math.floor(result.tokenBalance)));
    return true;
  }, [tokenApiHeaders]);

  const money = (amount: number) => formatCurrency(amount, language);
  const configuredVideoSource = resolveVideoSource(videoConfig);
  const videoSource = livePlaybackRuntime.ready
    ? livePlaybackRuntime.configured ? livePlaybackRuntime.source || "" : configuredVideoSource
    : "";
  const streamPlayback = useStreamPlaybackStatus(Boolean(videoSource));
  const contributionDeliveryEnabled = Boolean(videoSource) && ageOk && !moderationBlocked && canStartProtectedLivePlayback({ ready: contributionStateReady, restricted: contributionRestricted, unpaidPlaybackStopped: contributionUnpaidPlaybackStopped });
  const liveViewingCredit = useLiveViewingCredit({ enabled: contributionDeliveryEnabled, sandbox });
  useLiveDeliverySession({ videoRef, source: videoSource, enabled: contributionDeliveryEnabled, sandbox });
  // Presence is page participation, not billable playback. Keeping it independent
  // prevents pause/resume and hidden-tab transitions from creating a new entry.
  const livePresenceActive = Boolean(videoSource) && ageOk && !moderationBlocked;
  const livePresence = useLiveViewerPresence(livePresenceActive);
  const realViewerCount = livePresence.realLiveViewerCount;
  const viewRuleViewerCount = livePresence.publicViewerDisplayValue;
  const walletCoins = Math.max(0, Math.floor(tokenBalance || 0));
  const scheduleWindows = useMemo(() => {
    return streamWindows.map((window) => formatStreamWindow(window, timeZone, language));
  }, [language, timeZone]);
  const nextScheduledLive = useMemo(() => nextStreamStart(timeZone, language), [language, timeZone]);
  const goalPercent = Math.max(8, Math.min(100, ((tipTotal + tipTotalTokens * appConfig.coinValue) / appConfig.dailyGoal) * 100));
  const accessRemainingSeconds = Math.max(0, Math.ceil((accessExpiresAt - Date.now()) / 1000));
  const canEnter = gateChecks.every(Boolean);
  const enabledGames = useMemo(
    () => gamesEnabled ? games.filter((game) => game.enabled && !game.hidden).sort((a, b) => a.order - b.order) : [],
    [games, gamesEnabled]
  );
  const nextDepositAt = useMemo(() => calculateNextDepositAt({ frequency: depositFrequency, lastDepositAt }), [depositFrequency, lastDepositAt]);
  const nextDepositLabel = nextDepositAt ? new Intl.DateTimeFormat(language, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone
  }).format(new Date(nextDepositAt)) : "Manual release";
  const depositCountdown = nextDepositAt ? Math.max(0, Math.ceil((new Date(nextDepositAt).getTime() - Date.now()) / 1000)) : 0;
  const activeGame = enabledGames.find((game) => game.id === activeGameId) || enabledGames[0];
  coinPolicyActorRef.current = cleanName(displayName) || email || "Guest";
  const enabledCoinPackages = useMemo(
    () => coinPackages.filter((item) => item.enabled).sort((a, b) => a.order - b.order),
    [coinPackages]
  );
  const selectedCoinPackage = enabledCoinPackages.find((item) => item.id === selectedCoinPackageId) || null;
  const selectedPackageQuote = selectedCoinPackage ? quoteCoinPackage(selectedCoinPackage) : null;
  const enabledQuickTipOptions = useMemo(
    () => tips.filter((item) => item.enabled && item.temporaryAvailable && item.liveOnly).sort((a, b) => a.tokenCost - b.tokenCost || a.displayOrder - b.displayOrder),
    [tips]
  );
  const selectedQuickTip = enabledQuickTipOptions.find((item) => item.id === selectedQuickTipId) || enabledQuickTipOptions[0] || null;
  const quickTipStage = contributionRestricted || liveViewingCredit.deliveryPaused
    ? liveViewingCredit.pauseReason === "hourly" ? "hourly" : "entry"
    : "voluntary";
  const filteredModerationLogs = useMemo(() => {
    return moderationLogs.filter((item) => {
      if (moderationFilter === "permanent") return item.permanent;
      if (moderationFilter === "temporary") return !item.permanent;
      return true;
    });
  }, [moderationFilter, moderationLogs]);
  const geoSummaries = useMemo(() => summarizeGeoVisitors(geoVisitors), []);
  const selectedGeoSummary = geoSummaries.find((summary) => summary.countryCode === geoSelectedCountry) || geoSummaries[0];
  const activeGeoVisitors = useMemo(() => {
    return geoVisitors.filter((visitor) => {
      if (!visitor.active) return false;
      if (geoTrafficFilter !== "All sources" && visitor.referralSource !== geoTrafficFilter) return false;
      if (geoDeviceFilter !== "All devices" && visitor.deviceType !== geoDeviceFilter) return false;
      return true;
    });
  }, [geoDeviceFilter, geoTrafficFilter]);
  const worldClocks = geoSummaries
    .filter((summary) => summary.activeVisitors > 0)
    .map((summary) => ({ ...summary, clock: formatGeoClock(summary.timeZone, language) }));
  const geoTotals = useMemo(() => {
    return {
      active: activeGeoVisitors.length,
      unique: geoSummaries.reduce((sum, summary) => sum + summary.uniqueVisitors, 0),
      returning: geoSummaries.reduce((sum, summary) => sum + summary.returningVisitors, 0),
      historical: geoSummaries.reduce((sum, summary) => sum + summary.historicalVisits, 0)
    };
  }, [activeGeoVisitors.length, geoSummaries]);
  const referralSummaries = useMemo(() => summarizeReferrals(referralEvents), []);
  const selectedReferral = referralSummaries.find((item) => item.source === referralSelectedSource) || referralSummaries[0];
  const referralTotals = useMemo(() => {
    return referralSummaries.reduce((summary, item) => ({
      visitors: summary.visitors + item.visitors,
      uniqueVisitors: summary.uniqueVisitors + item.uniqueVisitors,
      clicks: summary.clicks + item.clicks,
      conversions: summary.conversions + item.totalConversions
    }), { visitors: 0, uniqueVisitors: 0, clicks: 0, conversions: 0 });
  }, [referralSummaries]);
  const maxReferralTrend = Math.max(1, ...(selectedReferral?.trend || [1]));
  const securitySummary = useMemo(() => {
    const blocked = securityEvents.filter((event) => event.action === "blocked").length;
    const throttled = securityEvents.filter((event) => event.action === "throttled").length;
    const averageScore = Math.round(securityEvents.reduce((sum, event) => sum + event.score, 0) / Math.max(1, securityEvents.length));
    return { blocked, throttled, averageScore, maxRate: Math.max(1, ...securityEvents.map((event) => event.requestRate)) };
  }, [securityEvents]);
  const gameAnalytics = useMemo(() => {
    const sessions = Object.entries(gameSessions);
    const totalPlays = sessions.reduce((sum, [, session]) => sum + session.plays, 0);
    const totalSeconds = sessions.reduce((sum, [, session]) => sum + session.totalSeconds, 0);
    const mostPlayed = sessions.sort((a, b) => b[1].plays - a[1].plays)[0]?.[0];
    return {
      totalPlays,
      averageSeconds: totalPlays ? Math.round(totalSeconds / totalPlays) : 0,
      mostPlayed: games.find((game) => game.id === mostPlayed)?.title || t("games.noScores")
    };
  }, [gameSessions, games, t]);
  const costMonthlyTotal = useMemo(() => {
    return costProviders.reduce((sum, item) => sum + item.fixedMonthly + item.usageMonthly, 0);
  }, [costProviders]);
  const costFeatureTotals = useMemo(() => {
    return costProviders.reduce<Record<string, number>>((totals, item) => {
      totals[item.feature] = (totals[item.feature] || 0) + item.fixedMonthly + item.usageMonthly;
      return totals;
    }, {});
  }, [costProviders]);
  const costDaily = costMonthlyTotal / 30;
  const costWeekly = costDaily * 7;
  const costProjected = costDaily * 30 + Math.max(0, new Date().getDate() - 1) * costDaily * 0.08;
  const costBudgetUsed = Math.round((costProjected / Math.max(1, monthlyBudget)) * 100);
  const costTopFeature = Object.entries(costFeatureTotals).sort((a, b) => b[1] - a[1])[0] || ["Streaming", 0];
  const costAlerts = [
    costBudgetUsed >= costWarningThreshold ? `Projected month-end cost is ${costBudgetUsed}% of the approved budget.` : "",
    ...costProviders.filter((item) => item.usagePercent >= costWarningThreshold).map((item) => `${item.provider} is at ${item.usagePercent}% of its allowance.`),
    costProjected > monthlyBudget ? "Projected costs are likely to exceed the approved monthly budget." : ""
  ].filter(Boolean);
  const costTrend = [0.72, 0.78, 0.74, 0.86, 0.91, 0.88, 1].map((ratio, index) => ({
    label: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][index],
    amount: costDaily * ratio
  }));
  const maxTrendCost = Math.max(1, ...costTrend.map((item) => item.amount));
  const maxFeatureCost = Math.max(1, ...Object.values(costFeatureTotals));
  const costPerUser = costMonthlyTotal / Math.max(1, geoTotals.unique || 128);
  const costPerViewerHour = costMonthlyTotal / Math.max(1, 24 * 3 + liveSeconds / 3600);
  const costPerStream = costMonthlyTotal / 3;
  const costPerTip = costMonthlyTotal / Math.max(1, Math.round(tipTotal / Math.max(1, appConfig.minimumAccessPayment)) || 18);
  const costPerConversion = costMonthlyTotal / Math.max(1, Math.round((tipTotal / Math.max(1, appConfig.minimumAccessPayment)) * 0.45) || 8);

  function startAccessPeriod(reason = "entry", minutes = accessSettings.accessWindowMinutes) {
    const expiresAt = Date.now() + Math.max(1, minutes) * 60_000;
    setAccessExpiresAt(expiresAt);
    setAccessLocked(false);
    setCheckoutActive(false);
    setCheckoutRemaining(accessSettings.checkoutTimerSeconds);
    setAccessLockReason(reason);
    setRefillResumeReason((current) => current === "twentyFiveMinuteThreshold" ? null : current);
    setStatus(`Live access active for ${minutes} minutes.`);
  }

  const lockAccess = useCallback((reason = "contribution requirement test restriction") => {
    setAccessLocked(true);
    setAccessLockReason(reason);
    setCheckoutActive(false);
    setCheckoutRemaining(accessSettings.checkoutTimerSeconds);
    setPaymentAmount(accessSettings.minimumPayment);
    setRefillResumeReason("twentyFiveMinuteThreshold");
    setStatus("Payment required to resume protected live viewing.");
  }, [accessSettings.checkoutTimerSeconds, accessSettings.minimumPayment]);

  const weightedAccessRedirect = useCallback((reason: string, previewOnly = false) => {
    const bucket = deterministicBucket(`${userId || email || "guest"}:${reason}:${accessLockReason}`);
    const destination = bucket < accessSettings.clipsRedirectPercent ? "Clips4Sale" : "Fansly";
    setAccessRedirectHistory((items) => [{ destination, reason, createdAt: new Date().toISOString() }, ...items].slice(0, 12));
    setNotifications((items) => [`Access redirect selected: ${destination} (${reason}).`, ...items].slice(0, 5));
    if (!previewOnly && typeof window !== "undefined") {
      window.location.href = destination === "Clips4Sale" ? accessSettings.clipsUrl : accessSettings.fanslyUrl;
    }
  }, [accessLockReason, accessSettings.clipsRedirectPercent, accessSettings.clipsUrl, accessSettings.fanslyUrl, email, userId]);

  function resumeCheckout() {
    setCheckoutActive(true);
    setPaymentAmount(accessSettings.minimumPayment);
    setPaymentStatus("Hosted payment fields active. Timer pauses while valid processor activity continues.");
  }

  function confirmAccessPayment(amount = paymentAmount, reference = `demo_${Date.now()}`) {
    const safeAmount = Math.min(1000, Math.max(accessSettings.minimumPayment, Number(amount || accessSettings.minimumPayment)));
    setPaymentAmount(safeAmount);
    setTipTotal((total) => Number((total + safeAmount).toFixed(2)));
    setRecentTip(`${cleanName(displayName)} resumed viewing with ${money(safeAmount)}`);
    setPaymentStatus(`${money(safeAmount)} confirmed through hosted/tokenized checkout. Processor reference: ${reference}.`);
    startAccessPeriod("payment confirmed", accessSettings.unlockDurationMinutes);
  }

  function logWalletTransaction(entry: Omit<WalletTransaction, "id" | "createdAt">) {
    setWalletTransactions((items) => [{
      ...entry,
      id: `wallet_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      createdAt: new Date().toISOString()
    }, ...items].slice(0, 40));
  }

  const logCoinPolicyEvent = useCallback((type: string, detail: string) => {
    setCoinPolicyLogs((items) => [{
      type,
      detail,
      user: coinPolicyActorRef.current,
      createdAt: new Date().toLocaleString()
    }, ...items].slice(0, 20));
  }, []);

  function acknowledgeCoinPolicy(source = "checkout") {
    setCoinPolicyAcknowledged(true);
    if (typeof window !== "undefined") localStorage.setItem("xmf-coin-policy-ack", "true");
    logCoinPolicyEvent("acknowledgement", `${source}: ${coinPolicy.disclosure}`);
  }

  function endPaymentFlow(outcome: "cancelled" | "failed" | "confirmed") {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("xmf:payment-flow-ended", { detail: { outcome } }));
    }
  }

  async function confirmWalletDeposit() {
    if (!selectedCoinPackage || !selectedPackageQuote) {
      setPaymentStatus("Select an enabled coin package before checkout.");
      endPaymentFlow("failed");
      return;
    }
    if (coinPolicy.showInPurchase && (coinPolicy.requireEveryPurchase || !coinPolicyAcknowledged)) {
      setPaymentStatus("Please acknowledge the Coin Usage notice before completing a coin purchase.");
      endPaymentFlow("failed");
      return;
    }
    if (!userId) {
      setPaymentStatus("Login is required before depositing to a wallet.");
      endPaymentFlow("failed");
      return;
    }
    if (!hostedPaymentTermsAccepted) {
      setPaymentStatus("Accept the checkout terms before continuing to the secure payment provider.");
      endPaymentFlow("failed");
      return;
    }
    if (coinPolicy.showInPurchase) acknowledgeCoinPolicy("coin purchase checkout");
    const idempotencyKey = `coin_${selectedCoinPackage.id}_${userId}_${Date.now()}`;
    const authHeaders = await tokenApiHeaders();
    if (!authHeaders) {
      setPaymentStatus("Your authenticated session is required before the token wallet can be credited.");
      endPaymentFlow("failed");
      return;
    }
    if (coinPurchaseInFlightRef.current) {
      setPaymentStatus("Secure checkout is already being prepared. Please wait for its result.");
      return;
    }
    coinPurchaseInFlightRef.current = true;
    setCoinPurchaseSubmitting(true);
    setPaymentStatus("Creating a secure hosted checkout...");
    let response: Response;
    try {
      response = await fetch("/api/payments/hosted", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey, ...authHeaders },
        body: JSON.stringify({
          purpose: "coin_purchase",
          packageId: selectedCoinPackage.id,
          coinPolicyAcknowledged: true,
          termsAccepted: true,
          returnTo: "/live"
        })
      });
    } catch {
      coinPurchaseInFlightRef.current = false;
      setCoinPurchaseSubmitting(false);
      setPaymentStatus("Secure checkout could not be reached. No charge was attempted.");
      endPaymentFlow("failed");
      return;
    }
    const result = await response.json().catch(() => ({})) as { message?: string; checkoutUrl?: string };
    if (!response.ok || !result.checkoutUrl) {
      coinPurchaseInFlightRef.current = false;
      setCoinPurchaseSubmitting(false);
      setPaymentStatus(result.message || "Secure checkout could not be started. No charge was attempted.");
      endPaymentFlow("failed");
      return;
    }
    let checkoutUrl: URL;
    try {
      checkoutUrl = new URL(result.checkoutUrl, window.location.origin);
    } catch {
      coinPurchaseInFlightRef.current = false;
      setCoinPurchaseSubmitting(false);
      setPaymentStatus("The payment provider returned an invalid checkout address. No charge was attempted.");
      endPaymentFlow("failed");
      return;
    }
    if (checkoutUrl.protocol !== "https:" && !(checkoutUrl.protocol === "http:" && checkoutUrl.origin === window.location.origin)) {
      coinPurchaseInFlightRef.current = false;
      setCoinPurchaseSubmitting(false);
      setPaymentStatus("The payment provider address failed the secure redirect check. No charge was attempted.");
      endPaymentFlow("failed");
      return;
    }
    setPaymentStatus("Redirecting to the secure hosted payment provider...");
    window.location.assign(checkoutUrl.toString());
  }

  function askMayaToConfirmPackage() {
    if (!selectedCoinPackage || !selectedPackageQuote) {
      setPaymentStatus("Choose a package to continue.");
      return;
    }
    const bonusUnit = selectedPackageQuote.bonusCoins === 1 ? "bonus coin" : "bonus coins";
    const message = `Maya: You selected the ${selectedCoinPackage.name}. You’ll pay ${money(selectedPackageQuote.amount)} and receive ${formatNumber(selectedPackageQuote.baseCoins, language)} base coins plus ${formatNumber(selectedPackageQuote.bonusCoins, language)} ${bonusUnit}, for ${formatNumber(selectedPackageQuote.totalCoins, language)} total coins. Continue to secure checkout?`;
    setMayaPackageConfirmed(true);
    setPaymentStatus(message);
  }

  function failAccessPayment(reason = "payment failed") {
    setPaymentStatus(`${reason}. Visitor will be redirected unless a valid retry is active.`);
    weightedAccessRedirect(reason, true);
  }

  function unlockAccessPanel() {
    if (!adminUnlocked) {
      setAccessPanelStatus("Unlock ADMIN controls first.");
      return;
    }
    if (accessPanelPin !== "6464") {
      setAccessPanelStatus("Secondary PIN rejected. Production stores only a hashed PIN and rate-limits failures.");
      setNotifications((items) => ["Failed secondary PIN attempt for Live Access Control.", ...items].slice(0, 5));
      return;
    }
    setAccessPanelUnlocked(true);
    setAccessPanelStatus("Sensitive panel open. Production must verify ADMIN role and 2FA before this secondary PIN.");
  }

  function parseManualCosts(text: string) {
    const parsed = text.split("\n").map((line) => {
      const [category, provider, fixedMonthly, usageMonthly, usagePercent, freeRemaining, feature] = line.split("|").map((part) => part?.trim());
      return category && provider ? {
        category,
        provider,
        fixedMonthly: Math.max(0, Number(fixedMonthly || 0)),
        usageMonthly: Math.max(0, Number(usageMonthly || 0)),
        usagePercent: Math.max(0, Math.min(100, Number(usagePercent || 0))),
        freeRemaining: freeRemaining || "Unknown",
        feature: feature || category
      } : null;
    }).filter(Boolean) as CostProvider[];
    return parsed.length ? parsed : defaultCostProviders;
  }

  function saveCostDashboard() {
    if (!adminUnlocked) {
      setCostStatus("Unlock ADMIN controls first.");
      return;
    }
    if (financePermission !== "finance") {
      setCostStatus("Read-only admins cannot change financial settings.");
      setNotifications((items) => ["Cost Dashboard edit blocked for read-only admin.", ...items].slice(0, 5));
      return;
    }
    setCostProviders(parseManualCosts(manualCostText));
    setCostStatus("Cost Dashboard settings saved. Connect provider billing APIs for live usage in production.");
  }

  function addSecurityRule() {
    if (!adminUnlocked) {
      setSecurityStatus("Unlock ADMIN controls first.");
      return;
    }
    const value = securityRuleValue.trim();
    if (!value) {
      setSecurityStatus("Enter an IP, country, or user agent before adding a rule.");
      return;
    }
    setSecurityRules((items) => [{ type: securityRuleType, value, reason: "Manual admin rule" }, ...items].slice(0, 20));
    setSecurityRuleValue("");
    setSecurityStatus(`${value} added to ${securityRuleType}. Production syncs this to middleware/CDN rules.`);
    setNotifications((items) => [`Security rule staged: ${securityRuleType} ${value}.`, ...items].slice(0, 5));
  }

  function saveTrustedDevice() {
    setTrustedDevice(true);
    localStorage.setItem("xmf-trusted-device", new Date().toISOString());
  }

  function generateRecoveryCodes() {
    const codes = Array.from({ length: 8 }).map((_, index) => `XMF${index + 1}${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 8)}`.toUpperCase());
    setRecoveryCodes(codes);
    setAccountSecurityStatus("Recovery codes generated. Production stores only hashed recovery codes.");
  }

  function saveAdminAuthPolicy() {
    if (!adminUnlocked) {
      setAdminAuthStatus("Unlock ADMIN controls first.");
      return;
    }
    setAdminAuthStatus(adminRequireTwoFactor
      ? "Admin 2FA enforcement saved. Standard user 2FA remains optional."
      : "Warning: admin 2FA enforcement should stay enabled for production.");
    setNotifications((items) => ["Admin authentication policy updated.", ...items].slice(0, 5));
  }

  function requestPasswordReset() {
    setStatus(email ? `Password reset prepared for ${email}. Production sends a secure reset email.` : "Enter an email before requesting a password reset.");
  }

  function updateRedirectBlock(id: string, value: Partial<RedirectOfflineBlock>) {
    setRedirectOfflineBlocks((blocks) => blocks.map((block) => block.id === id ? { ...block, ...value } : block));
  }

  function saveRedirectSettings() {
    if (!adminUnlocked) {
      setRedirectStatus("Unlock ADMIN controls first.");
      return;
    }
    const fanslyPercent = 100 - Math.max(0, Math.min(100, redirectClipsPercent));
    setRedirectStatus(`Offline redirect settings staged: ${redirectClipsPercent}% Clips4Sale / ${fanslyPercent}% Fansly. OBS live still overrides every rule.`);
    setRedirectLogPreview((items) => [
      {
        destination: redirectManualDestination === "automatic" ? "deterministic split" : redirectManualDestination,
        reason: redirectManualDestination === "automatic" ? "Admin saved offline split" : "Admin saved manual offline override",
        referrer: "Admin preview",
        createdAt: new Date().toLocaleString()
      },
      ...items
    ].slice(0, 6));
  }

  const redirectOfflineBlocksJson = JSON.stringify(redirectOfflineBlocks.map((block) => ({
    id: block.id,
    label: block.label,
    start: block.start,
    end: block.end,
    destination: block.destination
  })));

  const syncProfile = useCallback(async (id: string, userEmail: string, name: string) => {
    if (!supabase) return;
    await supabase.from("profiles").upsert({
      id,
      email: userEmail,
      display_name: cleanName(name),
      country_code: "US",
      preferred_language: normalizeLocale(language),
      preferred_time_zone: timeZone,
      updated_at: new Date().toISOString()
    });
  }, [language, supabase, timeZone]);

  function chooseLanguage(value: string) {
    const nextLanguage = normalizeLocale(value);
    setLocale(nextLanguage);
  }

  function chooseTimeZone(value: string) {
    setTimeZone(value);
    setTimeZoneDetected(true);
    rememberTimeZone(value);
  }

  useEffect(() => {
    if (sandbox) {
      setAgeOk(true);
      setGateChecks(requiredGateCheckKeys.map(() => true));
      setEmail("sandbox@example.com");
      setDisplayName("TestViewer");
      setUserId("sandbox-user");
      setStatus("Sandbox mode: Supabase auth bypassed for visual testing.");
      setAdminUnlocked(true);
      setCoinPolicyAcknowledged(localStorage.getItem("xmf-coin-policy-ack") === "true");
      setWalletBalance(200);
      setTipTotal(72);
      setRecentTip("TestViewer tipped $15.00");
      setNotifications([
        "Sandbox: admin dashboard unlocked.",
        "Sandbox: visual testing state loaded.",
        "Sandbox: video provider controls are editable."
      ]);
      setScoreEntries([
        { gameId: "space-sweep", gameTitle: "Space Sweep", displayName: "TestViewer", score: 42, sessionSeconds: 86, createdAt: new Date().toISOString() },
        { gameId: "space-sweep", gameTitle: "Space Sweep", displayName: "Velvet12", score: 38, sessionSeconds: 75, createdAt: new Date().toISOString() },
        { gameId: "pac-mask", gameTitle: "Pac-Mask Chase", displayName: "NightRun", score: 31, sessionSeconds: 64, createdAt: new Date().toISOString() }
      ]);
      setGameSessions({
        "space-sweep": { plays: 8, totalSeconds: 612, totalScore: 210 },
        "pac-mask": { plays: 5, totalSeconds: 351, totalScore: 104 },
        "slither": { plays: 3, totalSeconds: 210, totalScore: 680 }
      });
      setToddReports([
        "Todd: Sandbox games loaded cleanly.",
        "Todd: Difficulty ready to rise after score 12.",
        "Todd: Audio is muted until the viewer chooses otherwise."
      ]);
      return;
    }

    setAgeOk(localStorage.getItem("xmf-age-ok") === "true");
    setTrustedDevice(Boolean(localStorage.getItem("xmf-trusted-device")));
    setCoinPolicyAcknowledged(localStorage.getItem("xmf-coin-policy-ack") === "true");
    const detectedTimeZone = detectPreferredTimeZone();
    setTimeZone(detectedTimeZone.timeZone);
    setTimeZoneDetected(detectedTimeZone.detected);
    rememberTimeZone(detectedTimeZone.timeZone);
    const savedScores = localStorage.getItem("xmf-game-scores");
    if (savedScores) {
      try {
        setScoreEntries(JSON.parse(savedScores) as ScoreEntry[]);
      } catch {
        setToddReports((items) => ["Todd: Saved leaderboard data could not load. Starting fresh.", ...items].slice(0, 6));
      }
    }
    scoresLoadedRef.current = true;
  }, [sandbox]);

  useEffect(() => {
    if (!coinPolicyReadyRef.current) {
      coinPolicyReadyRef.current = true;
      return;
    }
    if (!adminUnlocked) return;
    logCoinPolicyEvent("admin update", "Coin usage disclosure settings changed");
  }, [coinPolicy, adminUnlocked, logCoinPolicyEvent]);

  useEffect(() => {
    if (!userId && (status === "Logged out" || status === fallbackMessages["auth.loggedOut"])) {
      setStatus(t("auth.loggedOut"));
    }
    if (recentTip === "No tips yet" || recentTip === fallbackMessages["tip.recentEmpty"]) {
      setRecentTip(t("tip.recentEmpty"));
    }
  }, [recentTip, status, t, userId]);

  useEffect(() => {
    const onContributionState = (event: Event) => {
      const detail = (event as CustomEvent<{ ready?: boolean; restricted?: boolean; unpaidPlaybackStopped?: boolean; restrictionReason?: string | null }>).detail;
      setContributionStateReady(detail?.ready === true);
      setContributionRestricted(detail?.restricted === true);
      setContributionUnpaidPlaybackStopped(detail?.unpaidPlaybackStopped === true);
      setAccessLocked(detail?.restricted === true);
      if (detail?.restrictionReason) setAccessLockReason(detail.restrictionReason);
    };
    window.addEventListener("xmf:contribution-state", onContributionState);
    return () => window.removeEventListener("xmf:contribution-state", onContributionState);
  }, []);

  reminderTipActionRef.current = () => { void sendCustomTokenTip(appConfig.minimumAccessCoins); };
  reminderBuyCoinsActionRef.current = openTokenRefill;

  useEffect(() => {
    const onReminderTip = () => reminderTipActionRef.current();
    const onReminderBuyCoins = () => reminderBuyCoinsActionRef.current();
    window.addEventListener("xmf:tip-reminder-tip", onReminderTip);
    window.addEventListener("xmf:tip-reminder-buy-coins", onReminderBuyCoins);
    return () => {
      window.removeEventListener("xmf:tip-reminder-tip", onReminderTip);
      window.removeEventListener("xmf:tip-reminder-buy-coins", onReminderBuyCoins);
    };
  }, []);

  useEffect(() => {
    if (!accessLocked || checkoutActive) return;
    const timer = window.setInterval(() => {
      setCheckoutRemaining((seconds) => {
        if (seconds <= 1) {
          weightedAccessRedirect("checkout timeout");
          return 0;
        }
        return seconds - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [accessLocked, checkoutActive, weightedAccessRedirect]);

  useEffect(() => {
    if (!supabase) return;
    if (sandbox) return;

    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      const savedName = localStorage.getItem("xmf-display-name") || "Masked";
      setUserId(data.user.id);
      setEmail(data.user.email || "");
      setDisplayName(savedName);
      setStatus(`Welcome back, ${savedName}.`);
      void syncProfile(data.user.id, data.user.email || "", savedName);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id || null);
      if (session?.user.email) {
        const savedName = localStorage.getItem("xmf-display-name") || "Masked";
        setEmail(session.user.email);
        setDisplayName(savedName);
        setStatus(`Welcome back, ${savedName}.`);
        void syncProfile(session.user.id, session.user.email, savedName);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, [supabase, sandbox, syncProfile]);

  useEffect(() => {
    if (!adminUnlocked) return undefined;
    const timer = setInterval(() => setLiveSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [adminUnlocked]);

  useEffect(() => {
    void refreshTokenWallet();
  }, [refreshTokenWallet, userId]);

  useEffect(() => {
    if (tokenBalance === null) return;
    window.dispatchEvent(new CustomEvent("xmf:wallet-updated", { detail: { balance: tokenBalance, source: "live-room" } }));
  }, [tokenBalance]);

  useEffect(() => {
    if (sandbox) return;
    if (!scoresLoadedRef.current) return;
    localStorage.setItem("xmf-game-scores", JSON.stringify(scoreEntries.slice(-50)));
  }, [scoreEntries, sandbox]);

  useEffect(() => {
    if (!enabledGames.length) {
      setToddReports((items) => ["Todd: No enabled games. Viewers cannot open a dedicated game route.", ...items].slice(0, 6));
      return;
    }

    if (!enabledGames.some((game) => game.id === activeGameId)) {
      setActiveGameId(enabledGames[0].id);
    }
  }, [activeGameId, enabledGames]);

  useEffect(() => {
    function reportGameError(event: ErrorEvent) {
      setToddReports((items) => [`Todd bug catch: ${event.message || "Unknown game error"}.`, ...items].slice(0, 6));
    }

    function reportGameRejection(event: PromiseRejectionEvent) {
      const reason = event.reason?.message || String(event.reason || "Unhandled game loading issue");
      setToddReports((items) => [`Todd loading catch: ${reason}.`, ...items].slice(0, 6));
    }

    window.addEventListener("error", reportGameError);
    window.addEventListener("unhandledrejection", reportGameRejection);
    return () => {
      window.removeEventListener("error", reportGameError);
      window.removeEventListener("unhandledrejection", reportGameRejection);
    };
  }, []);

  useEffect(() => {
    if (playbackConfigured !== undefined) return undefined;
    fetch("/api/live/playback", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Live playback configuration unavailable")))
      .then((data: { configured?: boolean; source?: string | null }) => {
        setLivePlaybackRuntime({ ready: true, configured: data.configured === true, source: typeof data.source === "string" ? data.source : null });
      })
      .catch(() => {
        // Fail closed for configured Cloudflare playback so an unavailable provider
        // cannot create repeated delivery attempts or burn visitor credit.
        setLivePlaybackRuntime({ ready: true, configured: true, source: null });
      });
  }, [playbackConfigured]);

  useEffect(() => {
    fetch("/api/stream-settings")
      .then((response) => response.json())
      .then((data: { settings?: VideoProviderConfig }) => {
        if (data.settings) setVideoConfig(data.settings);
      })
      .catch(() => {
        setNotifications((items) => ["Using local default video provider settings.", ...items].slice(0, 5));
      });
  }, []);

  useEffect(() => {
    fetch("/api/live-config", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((data: { settings?: { theaterAudio?: { theaterEnabled?: boolean; audioPriority?: "live" | "notification" | "music" }; backgroundMusic?: Partial<BackgroundMusicSettings> & { tracks?: Array<Partial<MusicTrack> & { status?: string }> }; coinPackages?: CoinPackage[] } } | null) => {
        const settings = data?.settings;
        if (!settings) return;
        if (Array.isArray(settings.coinPackages) && settings.coinPackages.length) {
          setCoinPackages(settings.coinPackages);
        }
        if (settings.theaterAudio) {
          setTheaterEnabled(settings.theaterAudio.theaterEnabled !== false);
          setAudioPriority(settings.theaterAudio.audioPriority || "live");
        }
        const music = settings.backgroundMusic;
        if (music) {
          const tracks = Array.isArray(music.tracks) ? music.tracks.flatMap((track, index) => track.title ? [{
            id: String(track.id || `track-${index + 1}`),
            mediaId: track.mediaId ? String(track.mediaId) : null,
            title: String(track.title),
            artist: String(track.artist || "XMASKEDFREAKS"),
            src: String(track.src || ""),
            durationMinutes: Number(track.durationMinutes || 10),
            enabled: track.enabled !== false,
            order: Number(track.order || index + 1),
            type: "audio" as const
          }] : []) : [];
          setBackgroundMusic((current) => ({
            ...current,
            enabled: music.enabled !== false,
            mode: music.mode || current.mode,
            lobbyVolume: Number(music.lobbyVolume ?? current.lobbyVolume),
            liveDuckingVolume: Number(music.liveDuckingVolume ?? current.liveDuckingVolume),
            stopWhenLive: music.stopWhenLive === true,
            noticeSeconds: Number(music.noticeSeconds ?? current.noticeSeconds),
            tracks: tracks.length ? tracks : current.tracks
          }));
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => () => disconnectLiveAudioEnhancer(), []);

  useEffect(() => {
    localStorage.setItem("xmf-live-muted", String(videoMuted));
    if (!localStorage.getItem("xmf-live-volume")) localStorage.setItem("xmf-live-volume", "1");
  }, [videoMuted]);

  useEffect(() => {
    if (typeof window === "undefined" || !("BroadcastChannel" in window)) return undefined;
    rewardChannelRef.current = new BroadcastChannel("xmaskedfreaks-rewards");
    return () => rewardChannelRef.current?.close();
  }, []);

  useEffect(() => {
    const checks = [
      ["maya", "Maya: Quietly answering visitor basics and routing unresolved questions."],
      ["riley", "Riley: Checking wallet deposits, masked payment references, and refund-review flags."],
      ["nova", "Nova: Watching playback health, browser behavior, and stream provider readiness."],
      ["atlas", "Atlas: I’m tracing the request path now. API, queue, database, and auth checks are active."],
      ["pixel", "Pixel: I found the point where the experience breaks. Layout and interaction checks are active."],
      ["ledger", "Ledger: I’m reconciling the transaction before changing anything."],
      ["echo", "Echo: I’m checking the live signal from source to viewer."],
      ["nova", "Nova: I’m testing the viewer’s path across device and browser conditions."],
      ["route", "Route: I’m following the visitor path from entry to destination."],
      ["riley", "Riley: Verifying customer billing details calmly before escalation."],
      ["sage", "Sage: I’m checking the behavior against the platform rules and safety history."],
      ["todd", "Todd: I’m testing the game loop and player difficulty."],
      ["maya", "Maya: Quiet language, tip, and support guidance is standing by."]
    ];
    let index = 0;
    const timer = window.setInterval(() => {
      const [agentId, activity] = checks[index % checks.length];
      setSupportAgentActivities((items) => ({ ...items, [agentId]: activity }));
      index += 1;
    }, 9000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedBan = localStorage.getItem("xmf-moderation-ban");
    if (!storedBan) return;
    try {
      const ban = JSON.parse(storedBan) as { permanent?: boolean; expiresAt?: number; reason?: string };
      if (ban.permanent || Number(ban.expiresAt || 0) > Date.now()) {
        setModerationBlocked(true);
        setModerationNotice(`Access removed by moderation: ${ban.reason || "prohibited chat language"}.`);
        setUserId(null);
      } else {
        localStorage.removeItem("xmf-moderation-ban");
      }
    } catch {
      localStorage.removeItem("xmf-moderation-ban");
    }
  }, []);

  useEffect(() => {
    if (!supabase || !missingTranslations.length) return;
    const translationKey = missingTranslations[0];
    void supabase.from("missing_translation_events").insert({
      locale: normalizeLocale(language),
      translation_key: translationKey,
      page_path: typeof window === "undefined" ? "/" : window.location.pathname,
      user_id: userId
    });
  }, [language, missingTranslations, supabase, userId]);

  function runSandboxTip() {
    const option = tips.find((item) => item.id === "appreciate-content") || DEFAULT_TIP_OPTIONS[6];
    void sendTokenTip(option);
  }

  function rewardEmojiFor(seed: string) {
    const list = rewardEmojis.split(",").map((item) => item.trim()).filter(Boolean);
    const emojis = list.length ? list : ["💰"];
    const index = Math.abs(seed.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0)) % emojis.length;
    return emojis[index];
  }

  function publishRewardEvent(name: string, amount: number, label: string, coins = 0) {
    const event: RewardEvent = {
      id: `reward-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name,
      amount,
      coins,
      label,
      emoji: rewardEmojiFor(`${Date.now()}-${name}-${amount}`),
      animation: rewardAnimation,
      color: rewardColor,
      durationSeconds: rewardDisplaySeconds,
      sound: rewardSound,
      createdAt: new Date().toISOString()
    };
    setRecentTip(`${name} tipped ${money(amount)}`);
    window.dispatchEvent(new CustomEvent("xmaskedfreaks:reward", { detail: event }));
    rewardChannelRef.current?.postMessage(event);
    localStorage.setItem("xmaskedfreaks-global-reward-event", JSON.stringify(event));
  }

  function publishTokenRewardEvent(name: string, option: TipOption, tokens: number, transactionId: string) {
    const event: RewardEvent = {
      id: transactionId,
      name,
      amount: 0,
      coins: tokens,
      label: option.phrase,
      emoji: option.emoji,
      animation: option.alertStyle || rewardAnimation,
      color: rewardColor,
      durationSeconds: rewardDisplaySeconds,
      sound: option.soundStyle || rewardSound,
      createdAt: new Date().toISOString()
    };
    setRecentTip(`${name} tipped ${tokens.toLocaleString()} coins`);
    window.dispatchEvent(new CustomEvent("xmaskedfreaks:reward", { detail: event }));
    rewardChannelRef.current?.postMessage(event);
    localStorage.setItem("xmaskedfreaks-global-reward-event", JSON.stringify(event));
  }

  function detectLiveAudioProfile() {
    if (typeof navigator === "undefined") return { label: "standard output", normalizer: 0.92, release: 0.24 };
    const agent = navigator.userAgent.toLowerCase();
    const touchDevice = navigator.maxTouchPoints > 1;
    if (agent.includes("bluetooth")) return { label: "bluetooth", normalizer: 0.92, release: 0.26 };
    if (touchDevice && /iphone|ipad|android/.test(agent)) return { label: "mobile speaker or earbuds", normalizer: 0.9, release: 0.24 };
    if (/macintosh|windows|linux/.test(agent)) return { label: "desktop speakers or wired audio", normalizer: 0.94, release: 0.22 };
    return { label: "standard output", normalizer: 0.92, release: 0.24 };
  }

  function createLiveLimiterCurve(amount = 0.82) {
    const samples = 32768;
    const curve = new Float32Array(samples);
    for (let index = 0; index < samples; index += 1) {
      const input = (index * 2) / samples - 1;
      curve[index] = Math.tanh(input / amount) * amount;
    }
    return curve;
  }

  function disconnectLiveAudioEnhancer() {
    liveAudioEnhancerRef.current?.nodes?.forEach((node) => node.disconnect());
    liveAudioEnhancerRef.current = null;
  }

  function setupLiveAudioEnhancement() {
    const video = videoRef.current;
    if (!video || typeof window === "undefined") return false;

    const audioWindow = window as typeof window & { webkitAudioContext?: typeof AudioContext };
    const AudioContextClass = audioWindow.AudioContext || audioWindow.webkitAudioContext;
    if (!AudioContextClass) {
      liveAudioEnhancerRef.current = { ready: false, unsupported: true, reason: "Web Audio is unavailable." };
      return false;
    }

    if (liveAudioEnhancerRef.current?.ready && liveAudioEnhancerRef.current.video === video) {
      void liveAudioEnhancerRef.current.context?.resume();
      return true;
    }

    if (liveAudioEnhancerRef.current?.video && liveAudioEnhancerRef.current.video !== video) {
      disconnectLiveAudioEnhancer();
    }

    try {
      const profile = detectLiveAudioProfile();
      const context = new AudioContextClass();
      const source = context.createMediaElementSource(video);
      const inputTrim = context.createGain();
      const compressor = context.createDynamicsCompressor();
      const normalizer = context.createGain();
      const limiter = context.createWaveShaper();
      const outputTrim = context.createGain();

      inputTrim.gain.value = 0.96;
      compressor.threshold.value = -18;
      compressor.knee.value = 18;
      compressor.ratio.value = 2.6;
      compressor.attack.value = 0.006;
      compressor.release.value = profile.release;
      normalizer.gain.value = profile.normalizer;
      limiter.curve = createLiveLimiterCurve();
      limiter.oversample = "2x";
      outputTrim.gain.value = 0.92;

      source.connect(inputTrim).connect(compressor).connect(normalizer).connect(limiter).connect(outputTrim).connect(context.destination);
      liveAudioEnhancerRef.current = {
        ready: true,
        video,
        context,
        nodes: [source, inputTrim, compressor, normalizer, limiter, outputTrim],
        profile: profile.label
      };
      video.closest(".player")?.setAttribute("data-audio-enhancement", profile.label);
      void context.resume();
      return true;
    } catch (error) {
      liveAudioEnhancerRef.current = {
        ready: false,
        unsupported: true,
        reason: error instanceof Error ? error.message : "Audio enhancement unavailable."
      };
      video.closest(".player")?.setAttribute("data-audio-enhancement", "fallback");
      return false;
    }
  }

  setupLiveAudioEnhancementRef.current = setupLiveAudioEnhancement;

  function toggleVideoMute() {
    const nextMuted = !videoMuted;
    setVideoMuted(nextMuted);
    if (videoRef.current) {
      videoRef.current.muted = nextMuted;
    }
    if (!nextMuted) setupLiveAudioEnhancement();
  }

  function requestPlayerFullscreen() {
    const player = videoRef.current?.closest(".player") as HTMLElement | null;
    if (!player || typeof document === "undefined") return;
    if (document.fullscreenElement) {
      void document.exitFullscreen?.();
      return;
    }
    void player.requestFullscreen?.();
  }

  const handleVideoPlaying = useCallback(() => {
    streamPlayback.videoEvents.onPlaying();
    setupLiveAudioEnhancementRef.current();
  }, [streamPlayback.videoEvents]);

  const enabledMusicTracks = useMemo(
    () => backgroundMusic.tracks.filter((track) => track.enabled).sort((a, b) => a.order - b.order),
    [backgroundMusic.tracks]
  );
  const activeMusicTrack = enabledMusicTracks[musicIndex % Math.max(1, enabledMusicTracks.length)];

  function addMusicLog(message: string, level = "info") {
    setMusicLogs((items) => [{ message, level, createdAt: new Date().toLocaleString() }, ...items].slice(0, 8));
  }

  function musicTargetVolume(runtime = musicRuntime, settings = backgroundMusic) {
    if (!settings.enabled || settings.mode === "disabled") return 0;
    if (runtime === "live") {
      if (settings.stopWhenLive || settings.mode === "lobby-only") return 0;
      const duckingVolume = audioPriority === "music" ? settings.lobbyVolume : settings.liveDuckingVolume;
      return Math.min(duckingVolume, 18) / 100;
    }
    return settings.lobbyVolume / 100;
  }

  function fadeLobbyAudio(target: number) {
    const audio = lobbyAudioRef.current;
    if (!audio) return;
    audio.volume = Math.max(0, Math.min(1, target));
  }

  function refreshMusicCache(settings = backgroundMusic) {
    const cachedMinutes = Math.min(60, settings.tracks.filter((track) => track.enabled).reduce((sum, track) => sum + track.durationMinutes, 0));
    const expiresAt = Date.now() + 60 * 60 * 1000;
    setMusicCacheStatus(`${cachedMinutes} / 60 min cached until ${new Date(expiresAt).toLocaleTimeString()}`);
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("xmaskedfreaks-background-music-cache", JSON.stringify({
        cachedMinutes,
        expiresAt,
        trackIds: settings.tracks.filter((track) => track.enabled).map((track) => track.id)
      }));
    }
  }

  function showNowPlaying() {
    setNowPlayingVisible(true);
    if (lobbyNoticeTimerRef.current) window.clearTimeout(lobbyNoticeTimerRef.current);
    lobbyNoticeTimerRef.current = window.setTimeout(() => setNowPlayingVisible(false), backgroundMusic.noticeSeconds * 1000);
  }

  function playMusicTrack(index = musicIndex, settings = backgroundMusic) {
    const tracks = settings.tracks.filter((track) => track.enabled).sort((a, b) => a.order - b.order);
    if (!tracks.length || !settings.enabled || settings.mode === "disabled") {
      addMusicLog("No enabled lobby tracks available.", "warning");
      return;
    }
    const nextIndex = ((index % tracks.length) + tracks.length) % tracks.length;
    setMusicIndex(nextIndex);
    const track = tracks[nextIndex];
    const audio = lobbyAudioRef.current;
    if (audio && track.src) {
      audio.src = track.src;
      audio.preload = "auto";
      audio.volume = musicTargetVolume(musicRuntime, settings);
      audio.onended = () => skipMusicTrack();
      audio.onerror = () => {
        addMusicLog(`Track failed and was skipped: ${track.title}`, "warning");
        skipMusicTrack();
      };
      void audio.play().catch(() => addMusicLog(`Browser blocked preview for ${track.title}; user gesture required.`, "warning"));
    } else {
      addMusicLog(`Demo lobby track ready: ${track.title}. Add MP3, AAC, M4A, WAV, or MP4 audio for real playback.`);
    }
    refreshMusicCache(settings);
    showNowPlaying();
  }

  function skipMusicTrack() {
    const tracks = enabledMusicTracks;
    if (!tracks.length) return;
    const nextIndex = backgroundMusic.shuffle ? Math.floor(Math.random() * tracks.length) : musicIndex + 1;
    if (!backgroundMusic.repeat && nextIndex >= tracks.length) {
      lobbyAudioRef.current?.pause();
      addMusicLog("Playlist ended without repeat.");
      return;
    }
    playMusicTrack(nextIndex);
  }

  function setMusicLiveMode(runtime: "offline" | "live") {
    setMusicRuntime(runtime);
    const target = musicTargetVolume(runtime);
    fadeLobbyAudio(target);
    setMusicMixStatus(runtime === "live" ? `Ducked under live audio at ${backgroundMusic.liveDuckingVolume}%` : `Lobby volume restored to ${backgroundMusic.lobbyVolume}%`);
    addMusicLog(runtime === "live" ? "OBS live detected; lobby music ducked below live audio." : "Stream offline/pre-show; lobby music returned to normal.");
  }

  function parseMusicTrackText(text: string) {
    return text.split("\n").map((line, index) => {
      const [title, artist, src, duration, enabled] = line.split("|").map((part) => (part || "").trim());
      if (!title) return null;
      return {
        id: `music-${index + 1}`,
        title: title.slice(0, 80),
        artist: (artist || "XMASKEDFREAKS").slice(0, 80),
        src,
        durationMinutes: Math.max(1, Math.min(60, Number(duration || 10))),
        enabled: enabled ? enabled.toLowerCase() !== "false" : true,
        order: index + 1,
        type: /\.mp4$/i.test(src || "") ? "mp4-audio" as const : "audio" as const
      };
    }).filter(Boolean) as MusicTrack[];
  }

  function saveMusicSettings() {
    if (!adminUnlocked) {
      setNotifications((items) => ["Unlock ADMIN controls first.", ...items].slice(0, 5));
      return;
    }
    const parsed = parseMusicTrackText(musicTrackText);
    const next = {
      ...backgroundMusic,
      tracks: parsed.length ? parsed : backgroundMusic.tracks
    };
    setBackgroundMusic(next);
    refreshMusicCache(next);
    addMusicLog("ADMIN saved background music settings.", "success");
  }

  function handleMusicUploads(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    const supported = /\.(mp3|aac|m4a|wav|mp4)$/i;
    const uploaded = files.filter((file) => supported.test(file.name)).map((file, index) => ({
      id: `upload-${Date.now()}-${index}`,
      title: file.name.replace(/\.[^.]+$/, ""),
      artist: "Uploaded",
      src: URL.createObjectURL(file),
      durationMinutes: 10,
      enabled: true,
      order: backgroundMusic.tracks.length + index + 1,
      type: /\.mp4$/i.test(file.name) ? "mp4-audio" as const : "audio" as const
    }));
    if (!uploaded.length) {
      addMusicLog("Unsupported upload skipped. Use MP3, AAC, M4A, WAV, or MP4 with audio.", "warning");
      return;
    }
    const next = { ...backgroundMusic, tracks: [...backgroundMusic.tracks, ...uploaded] };
    setBackgroundMusic(next);
    setMusicTrackText(next.tracks.map((track) => `${track.title}|${track.artist}|${track.src}|${track.durationMinutes}|${track.enabled}`).join("\n"));
    addMusicLog(`${uploaded.length} local preview track reference(s) added. Production should store protected files server-side.`, "success");
  }

  function openGame(gameId?: string, spaceTest?: string) {
    const nextGame = gameId ? games.find((game) => game.id === gameId && game.enabled && !game.hidden) : activeGame;
    if (!nextGame) {
      setToddReports((items) => ["Todd: Game open failed because no enabled games are available.", ...items].slice(0, 6));
      return;
    }
    setActiveGameId(nextGame.id);
    setToddReports((items) => [`Todd: ${nextGame.title} opened in its dedicated game route.`, ...items].slice(0, 6));
    const testQuery = spaceTest ? `?xmfSandbox=1&spaceTest=${encodeURIComponent(spaceTest)}` : "";
    window.location.assign(`/games/${nextGame.slug}/play${testQuery}`);
  }

  function openSpaceSandboxTest(test: string) {
    const spaceGame = games.find((game) => game.kind === "space" && game.enabled && !game.hidden);
    if (spaceGame) openGame(spaceGame.id, test);
  }

  function addGame() {
    const title = newGameTitle.trim();
    if (!title) return;
    const id = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `game-${Date.now()}`;
    setGames((items) => [
      ...items,
      {
        id,
        slug: id,
        title: title.slice(0, 28),
        kind: "slither",
        category: "Experimental",
        difficulty: "Medium",
        thumbnail: "/assets/preview-04.svg",
        thumbnailAlt: `${title.slice(0, 28)} game thumbnail.`,
        description: "Custom MASKED UP arena shell.",
        featured: false,
        hidden: false,
        enabled: true,
        order: items.length + 1
      }
    ]);
    setNewGameTitle("");
    setToddReports((items) => [`Todd: ${title.slice(0, 28)} added as a MASKED UP-style game shell.`, ...items].slice(0, 6));
  }

  function updateGame(id: string, value: Partial<GameItem>) {
    setGames((items) => items.map((game) => game.id === id ? { ...game, ...value } : game));
  }

  function moveGame(id: string, direction: -1 | 1) {
    setGames((items) => {
      const ordered = [...items].sort((a, b) => a.order - b.order);
      const index = ordered.findIndex((game) => game.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= ordered.length) return items;
      [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
      return ordered.map((game, orderIndex) => ({ ...game, order: orderIndex + 1 }));
    });
  }

  function removeGame(id: string) {
    setGames((items) => items.filter((game) => game.id !== id).map((game, index) => ({ ...game, order: index + 1 })));
    setToddReports((items) => ["Todd: Game removed from viewer menu.", ...items].slice(0, 6));
  }

  async function acceptAge() {
    if (!canEnter) return;
    localStorage.setItem("xmf-age-ok", "true");
    window.dispatchEvent(new Event("xmf-age-verified"));
    setAgeOk(true);
  }

  async function login(event: FormEvent) {
    event.preventDefault();
    if (moderationBlocked) {
      setStatus(moderationNotice || "Access removed by moderation enforcement.");
      return;
    }
    const name = cleanName(displayName);
    setDisplayName(name);
    localStorage.setItem("xmf-display-name", name);
    const adminLike = email.endsWith("@xmaskedfreaks.com") || email === "ustension@gmail.com";
    const lastTrustedAt = typeof window !== "undefined" ? localStorage.getItem("xmf-trusted-device") : null;
    const twoFactorDecision = shouldRequireTwoFactor({
      role: adminLike ? "admin" : "user",
      userTwoFactorEnabled,
      trustedDevice,
      lastVerifiedAt: lastTrustedAt,
      inactivityDays: trustedDeviceDays
    });

    if (twoFactorDecision.requireTwoFactor) {
      setTwoFactorPromptOpen(true);
      if (!/^\d{6,8}$/.test(twoFactorCode.trim())) {
        setStatus(twoFactorDecision.reason);
        return;
      }
      if (trustDevice) saveTrustedDevice();
    }

    if (!supabase) {
      setUserId("local-demo-user");
      setStatus(t("auth.localDemo", { name }));
      startAccessPeriod("local login", accessSettings.accessWindowMinutes);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    setStatus(error ? (error.message === "Invalid login credentials" ? "The email or password is incorrect." : error.message) : `Welcome back, ${name}.`);
    if (!error) startAccessPeriod("password auth", accessSettings.accessWindowMinutes);
  }

  async function sendTokenTip(option: TipOption, customTokens?: number, customMessage = "") {
    if (!userId || !supabase) {
      setTipFeedback(t("tipMenu.error.authRequired"));
      window.dispatchEvent(new CustomEvent("xmf:tip-failed"));
      return;
    }
    const requestedTokens = customTokens || option.tokenCost;
    const confirmedOption = customTokens ? { ...option, id: "custom", tokenCost: customTokens } : option;
    const confirmedPhrase = confirmedOption.id === "custom" ? confirmedOption.phrase : t(tipPhraseKey(confirmedOption.id));
    if (tokenBalance !== null && tokenBalance < requestedTokens) {
      setPendingTip(confirmedOption);
      setRefillResumeReason(tokenBalance === 0 ? "zeroBalance" : "insufficientTokens");
      setTipMenuOpen(false);
      window.dispatchEvent(new CustomEvent("xmf:tip-failed"));
      return;
    }
    if (tipMenuSettings.requireConfirmation && !window.confirm(t("tipMenu.confirm", { tokens: requestedTokens, phrase: confirmedPhrase }))) return;

    const authHeaders = await tokenApiHeaders();
    if (!authHeaders) {
      setTipFeedback(t("tipMenu.error.sessionExpired"));
      window.dispatchEvent(new CustomEvent("xmf:tip-failed"));
      return;
    }
    const idempotencyKey = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `tip-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setTipProcessingId(confirmedOption.id);
    setTipSuccessfulId(null);
    setTipFeedback(t("tipMenu.sendingTokens", { tokens: requestedTokens }));
    const response = await fetch("/api/tips", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": idempotencyKey, ...authHeaders },
      body: JSON.stringify({ optionId: confirmedOption.id, customTokens: customTokens || null, message: customMessage.slice(0, 120), sessionId: tipSessionRef.current, playbackSessionId: tipSessionRef.current, streamId: "daily-live", environment: sandbox ? "sandbox" : "production", displayName: cleanName(displayName) })
    }).catch(() => null);
    const result = await response?.json().catch(() => ({})) as { ok?: boolean; code?: string; message?: string; duplicate?: boolean; transactionId?: string; tokenBalance?: number; tokenAmount?: number; streamTotalTokens?: number; tipPhrase?: string; emoji?: string; viewingCredit?: { entryRequirementSatisfied?: boolean; graceExpiresAt?: string | null; creditHalfSeconds?: number; consumedHalfSeconds?: number; lastConsumedAt?: string | null } | null };
    setTipProcessingId(null);

    if (!response?.ok || !result.ok) {
      window.dispatchEvent(new CustomEvent("xmf:payment-flow-ended", { detail: { outcome: "failed" } }));
      await refreshTokenWallet();
      if (result.code === "INSUFFICIENT_TOKENS") {
        setPendingTip(confirmedOption);
        setRefillResumeReason((tokenBalance || 0) === 0 ? "zeroBalance" : "insufficientTokens");
        setTipMenuOpen(false);
      }
      const errorKey = result.code === "INSUFFICIENT_TOKENS" ? "tipMenu.error.insufficient" : result.code === "TIP_OPTION_UNAVAILABLE" ? "tipMenu.error.unavailable" : "tipMenu.error.failed";
      setTipFeedback(t(errorKey));
      window.dispatchEvent(new CustomEvent("xmf:tip-failed"));
      return;
    }

    const confirmedBalance = Math.max(0, Math.floor(Number(result.tokenBalance || 0)));
    const confirmedTokens = Math.max(1, Math.floor(Number(result.tokenAmount || requestedTokens)));
    setTokenBalance(confirmedBalance);
    if (Number.isFinite(result.streamTotalTokens)) setTipTotalTokens(Math.max(0, Number(result.streamTotalTokens)));
    setTipSuccessfulId(confirmedOption.id);
    setTipFeedback(result.duplicate ? t("tipMenu.duplicate") : t("tipMenu.sentTokens", { tokens: confirmedTokens }));
    setPendingTip(null);
    window.dispatchEvent(new CustomEvent("xmf:payment-flow-ended", { detail: { outcome: "confirmed" } }));
    window.dispatchEvent(new CustomEvent("xmf:tip-confirmed", { detail: { transactionId: result.transactionId || idempotencyKey, tokenAmount: confirmedTokens, viewingCredit: result.viewingCredit || null } }));
    window.setTimeout(() => setTipSuccessfulId(null), 1800);

    if (!result.duplicate) {
      const name = cleanName(displayName);
      publishTokenRewardEvent(name, confirmedOption, confirmedTokens, String(result.transactionId || idempotencyKey));
      logWalletTransaction({ type: "tip", amount: 0, baseCoins: 0, bonusCoins: 0, totalCoins: -confirmedTokens, reference: String(result.transactionId || idempotencyKey), status: "confirmed", note: confirmedOption.phrase });
    }
    if (confirmedBalance === 0) {
      setTipMenuOpen(false);
      setRefillResumeReason("zeroBalance");
    }
  }

  function sendCustomTokenTip(coins: number, message = "") {
    return sendTokenTip({ ...DEFAULT_TIP_OPTIONS[0], id: "custom", emoji: "✨", phrase: "Custom Tip", tokenCost: coins, featured: false }, coins, message);
  }

  function openTipMenu() {
    if (tokenBalance === 0) {
      setPendingTip(null);
      setRefillResumeReason("zeroBalance");
      return;
    }
    setTipMenuOpen(true);
  }

  function openTokenRefill() {
    setTipMenuOpen(false);
    setCoinRefillOverlayOpen(true);
    setRefillResumeReason(null);
  }

  function closeCoinRefillOverlay() {
    setCoinRefillOverlayOpen(false);
  }

  function selectCoinPackage(packageId: string) {
    const item = enabledCoinPackages.find((candidate) => candidate.id === packageId);
    if (!item) return;
    const quote = quoteCoinPackage(item);
    setSelectedCoinPackageId(item.id);
    setPaymentAmount(quote.amount);
    setMayaPackageConfirmed(false);
    setPaymentStatus(`${item.name} selected. Review the exact package below.`);
  }

  function openQuickTip() {
    setTipMenuOpen(false);
    setQuickTipStatus("");
    setSelectedQuickTipId((current) => current && enabledQuickTipOptions.some((amount) => amount.id === current) ? current : enabledQuickTipOptions[0]?.id || null);
    setQuickTipOpen(true);
    trackQuickTipAnalytics("live_quick_tip_opened", { stage: quickTipStage });
  }

  async function submitQuickTip(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedQuickTip || quickTipInFlightRef.current) return;
    quickTipInFlightRef.current = true;
    setQuickTipSubmitting(true);
    setQuickTipStatus(t("quickTip.paymentPending"));
    trackQuickTipAnalytics("live_quick_tip_payment_initiated", { quickTipId: selectedQuickTip.id, coins: selectedQuickTip.tokenCost, stage: quickTipStage });
    window.dispatchEvent(new CustomEvent("xmf:quick-tip-checkout-started", { detail: { coins: selectedQuickTip.tokenCost, stage: quickTipStage } }));
    const idempotencyKey = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `quick-tip-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const authHeaders = await tokenApiHeaders();
    const response = await fetch("/api/live/quick-tip", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": idempotencyKey, ...(authHeaders || {}) },
      body: JSON.stringify({
        quickTipId: selectedQuickTip.id,
        stage: quickTipStage,
        returnTo: "/live",
        streamId: "daily-live",
        displayName: cleanName(displayName),
        locale: language
      })
    }).catch(() => null);
    const result = await response?.json().catch(() => ({})) as { ok?: boolean; checkoutUrl?: string; message?: string };
    if (!response?.ok || !result.ok || !result.checkoutUrl) {
      setQuickTipSubmitting(false);
      quickTipInFlightRef.current = false;
      setQuickTipStatus(result.message || t("quickTip.paymentFailed"));
      trackQuickTipAnalytics("live_quick_tip_payment_failed", { quickTipId: selectedQuickTip.id, coins: selectedQuickTip.tokenCost, stage: quickTipStage });
      window.dispatchEvent(new CustomEvent("xmf:quick-tip-checkout-ended", { detail: { outcome: "failed" } }));
      return;
    }
    let checkoutUrl: URL;
    try {
      checkoutUrl = new URL(result.checkoutUrl, window.location.origin);
      if (checkoutUrl.origin !== window.location.origin && checkoutUrl.protocol !== "https:") throw new Error("Unsafe checkout URL");
    } catch {
      setQuickTipSubmitting(false);
      quickTipInFlightRef.current = false;
      setQuickTipStatus(t("quickTip.paymentFailed"));
      trackQuickTipAnalytics("live_quick_tip_payment_failed", { quickTipId: selectedQuickTip.id, coins: selectedQuickTip.tokenCost, stage: quickTipStage });
      window.dispatchEvent(new CustomEvent("xmf:quick-tip-checkout-ended", { detail: { outcome: "failed" } }));
      return;
    }
    window.location.assign(checkoutUrl.toString());
  }

  async function prepareTokenizedPayment(event: FormEvent) {
    event.preventDefault();
    window.dispatchEvent(new CustomEvent("xmf:payment-flow-started"));
    const safeAmount = selectedPackageQuote ? selectedPackageQuote.amount : Math.min(1000, Math.max(10, Number(paymentAmount || 25)));
    setPaymentAmount(safeAmount);
    const processorAmount = money(safeAmount);
    if (!userId) {
      setPaymentStatus("Login is required before secure checkout.");
      endPaymentFlow("failed");
      return;
    }
    if (accessLocked) {
      if (walletBalance < safeAmount) {
        setPaymentStatus(`Wallet balance is ${money(walletBalance)}. Contribution qualification remains server-confirmed through the approved wallet and checkout systems.`);
        endPaymentFlow("failed");
        return;
      }
      setWalletBalance((balance) => Number((balance - safeAmount).toFixed(2)));
      logWalletTransaction({
        type: "tip",
        amount: -safeAmount,
        baseCoins: 0,
        bonusCoins: 0,
        totalCoins: Math.floor(safeAmount / appConfig.coinValue),
        reference: `wallet_access_${Date.now()}`,
        status: "confirmed",
        note: "Resume live access"
      });
      confirmAccessPayment(safeAmount, `wallet_${Date.now()}`);
      endPaymentFlow("confirmed");
      return;
    }
    setPaymentStatus(`Preparing hosted checkout for ${processorAmount}...`);
    await confirmWalletDeposit();
  }

  async function prepareLiveCoinPurchase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    window.dispatchEvent(new CustomEvent("xmf:payment-flow-started"));
    await confirmWalletDeposit();
  }

  function sendLiveNotification() {
    if (!adminUnlocked) return;
    window.location.assign("/admin/operationalization");
  }

  function unlockAdmin() {
    setAdminUnlocked(adminCode === appConfig.ownerCode);
  }

  function updateVideoConfig(value: Partial<VideoProviderConfig>) {
    setVideoConfig((current) => ({
      ...current,
      ...value
    }));
  }

  function moderationRuleList() {
    return moderationRules
      .split("\n")
      .map((rule) => rule.trim().toLowerCase())
      .filter(Boolean);
  }

  function moderationDeviceSignal() {
    if (typeof window === "undefined") return "server";
    const marker = localStorage.getItem("xmf-moderation-cookie") || "fresh";
    return `${navigator.userAgent.slice(0, 80)} | ${marker}`;
  }

  function detectModerationViolation(message: string) {
    const normalized = message.toLowerCase().replace(/\s+/g, " ").trim();
    const matchedRule = moderationRuleList().find((rule) => normalized.includes(rule));
    if (matchedRule) return { blocked: true, reason: `Blocked phrase: ${matchedRule}` };
    if (/\b(kill|hurt|attack|dox|swat)\b.*\b(you|them|creator|viewer)\b/i.test(message)) {
      return { blocked: true, reason: "Threat pattern detected" };
    }
    if (/\b(stupid|worthless|trash)\b.*\b(you|creator|viewer|them)\b/i.test(message)) {
      return { blocked: true, reason: "Harassment pattern detected" };
    }
    return { blocked: false, reason: "" };
  }

  async function enforceModerationViolation(message: string, reason: string) {
    const durationOption = banDurationOptions.find((option) => String(option.hours) === moderationBanDuration) || banDurationOptions[6];
    const permanent = moderationPermanentBan || moderationLevel === "permanent" || durationOption.hours === null;
    const expiresAt = permanent ? null : new Date(Date.now() + Math.max(1, durationOption.hours || moderationBanHours) * 60 * 60 * 1000).toISOString();
    const enforcement = permanent ? "permanent ban" : moderationLevel === "remove" ? "session removal" : "temporary ban";
    const deviceSignal = moderationDeviceSignal();
    const log: ModerationLog = {
      id: `mod-${Date.now()}`,
      displayName: cleanName(displayName) || "Guest",
      reason,
      enforcement,
      appealStatus: moderationAppealStatus,
      deviceSignal,
      messagePreview: message.slice(0, 120),
      permanent,
      expiresAt,
      createdAt: new Date().toISOString()
    };
    setModerationLogs((items) => [log, ...items].slice(0, 100));
    setModerationBlocked(true);
    setModerationNotice("Your access has been removed for prohibited chat language.");
    setUserId(null);
    setStatus("Session revoked by moderation enforcement.");
    if (typeof window !== "undefined") {
      localStorage.setItem("xmf-moderation-cookie", `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
      localStorage.setItem("xmf-moderation-ban", JSON.stringify({
        reason,
        permanent,
        expiresAt: permanent ? null : new Date(expiresAt || Date.now()).getTime(),
        accountId: email,
        displayName: cleanName(displayName),
        deviceSignal,
        createdAt: log.createdAt
      }));
    }
    if (supabase) {
      await supabase.from("moderation_events").insert({
        user_id: userId,
        display_name: log.displayName,
        message: log.messagePreview,
        reason,
        enforcement,
        appeal_status: moderationAppealStatus
      });
      await supabase.from("moderation_bans").insert({
        user_id: userId,
        display_name: log.displayName,
        reason,
        enforcement,
        permanent,
        expires_at: expiresAt,
        appeal_status: moderationAppealStatus,
        device_signal_hash: deviceSignal
      });
    }
  }

  function clearPermanentBan(id?: string) {
    if (id) {
      setModerationLogs((items) => items.filter((item) => item.id !== id));
    } else {
      setModerationBlocked(false);
      setModerationNotice("");
      if (typeof window !== "undefined") localStorage.removeItem("xmf-moderation-ban");
      setStatus("Moderation ban manually cleared by administrator.");
    }
  }

  async function saveVideoProviderSettings() {
    if (!adminUnlocked) return;

    const response = await fetch("/api/stream-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(videoConfig)
    });

    setNotifications((items) => [
      response.ok ? t("creator.settingsSaved") : t("creator.settingsNeedSupabase"),
      ...items
    ].slice(0, 5));
  }

  return (
    <>
      {!ageOk && (
        <div className="age-gate">
          <div className="gate-panel">
            <p className="kicker">{t("age.kicker")}</p>
            <h1>{appConfig.siteName}</h1>
            <p className="status-line">{t("age.detected")}: {getLocaleLabel(language)}</p>
            <label htmlFor="language">{t("age.language")}</label>
            <select
              id="language"
              className="language-select"
              value={language}
              onChange={(event) => chooseLanguage(event.target.value)}
            >
              {languageOptions.map((option) => (
                <option value={option.code} key={option.code}>{formatLanguageLabel(option.nativeName, option.name)}</option>
              ))}
            </select>
            <p>{t("age.copy")}</p>
            <div className="gate-checks">
              {requiredGateCheckKeys.map((key, index) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={gateChecks[index]}
                    onChange={(event) => {
                      const next = [...gateChecks];
                      next[index] = event.target.checked;
                      setGateChecks(next);
                    }}
                  />
                  <span>{t(key)}</span>
                </label>
              ))}
            </div>
            <div className="gate-actions">
              <button className="primary" onClick={acceptAge} disabled={!canEnter}>{t("age.enter")}</button>
              <a className="secondary" href="https://www.google.com">{t("age.leave")}</a>
            </div>
          </div>
        </div>
      )}

      {moderationBlocked && (
        <div className="kick-screen">
          <div className="gate-panel">
            <p className="kicker">Moderation enforcement</p>
            <h1>Access Removed</h1>
            <p>{moderationNotice || "This session was removed for prohibited chat language."}</p>
          </div>
        </div>
      )}

      <div className={`site-shell${theaterMode ? " theater-mode" : ""}${immersiveMode ? " immersive-live-mode" : ""}`}>
      {sandbox && (
        <aside className="sandbox-toolbar" aria-label="Sandbox visual testing controls">
          <strong>Sandbox mode</strong>
          <button className="secondary" type="button" onClick={runSandboxTip}>Trigger tip</button>
          <button className="secondary" type="button" disabled={!theaterEnabled} onClick={() => setTheaterMode((value) => !value)}>
            {theaterMode ? "Exit theater" : "Theater"}
          </button>
          {gamesEnabled ? <button className="secondary" type="button" onClick={() => openGame()}>Open game</button> : null}
          {gamesEnabled ? <details className="sandbox-game-tests"><summary>Space Invaders tests</summary><div><button className="secondary" type="button" onClick={() => openSpaceSandboxTest("spawn-heart")}>Spawn Heart</button><button className="secondary" type="button" onClick={() => openSpaceSandboxTest("lives-1")}>Set lives 1</button><button className="secondary" type="button" onClick={() => openSpaceSandboxTest("lives-3")}>Set lives 3</button><button className="secondary" type="button" onClick={() => openSpaceSandboxTest("half-life")}>Set ½ life</button><button className="secondary" type="button" onClick={() => openSpaceSandboxTest("simulate-29")}>Simulate 29s clear</button><button className="secondary" type="button" onClick={() => openSpaceSandboxTest("simulate-129")}>Simulate 1:29 clear</button><button className="secondary" type="button" onClick={() => openSpaceSandboxTest("simulate-214")}>Simulate 2:14 clear</button><button className="secondary" type="button" onClick={() => openSpaceSandboxTest("simulate-missed")}>Simulate missed target</button></div></details> : null}
          <button className="secondary" type="button" onClick={() => setNotifications((items) => ["Sandbox lag alert: CDN fallback suggested.", ...items].slice(0, 5))}>
            Lag alert
          </button>
          <a className="secondary" href="/">Live page</a>
        </aside>
      )}
      <header className="site-header">
        <BrandLogo href="/" priority />
        <PublicNavigation gamesEnabled={gamesEnabled} />
        {gamesEnabled ? <button className="header-cta" type="button" onClick={() => openGame()}>{t("nav.games")}</button> : null}
      </header>

      <main id="live" className={sandbox ? "live-main is-sandbox" : "live-main"}>
        <section className="live-hero">
          <TipMenu
            open={tipMenuOpen}
            options={tips}
            settings={tipMenuSettings}
            tokenBalance={tokenBalance}
            processingId={tipProcessingId}
            successfulId={tipSuccessfulId}
            feedback={tipFeedback}
            onOpen={openTipMenu}
            onClose={() => setTipMenuOpen(false)}
            onTip={(option) => void sendTokenTip(option)}
            onCustomTip={(coins, message) => void sendCustomTokenTip(coins, message)}
            onRefill={openTokenRefill}
            onQuickTip={openQuickTip}
          />
          {coinRefillOverlayOpen ? <LiveCoinPurchaseOverlay
            packages={enabledCoinPackages}
            selectedPackageId={selectedCoinPackage?.id || null}
            selectedPackageQuote={selectedPackageQuote}
            walletCoins={walletCoins}
            email={email}
            paymentStatus={paymentStatus}
            termsAccepted={hostedPaymentTermsAccepted}
            coinPolicyAcknowledged={coinPolicyAcknowledged}
            coinPolicyVisible={coinPolicy.showInPurchase}
            coinPolicyDisclosure={coinPolicy.disclosure}
            mayaPackageConfirmed={mayaPackageConfirmed}
            submitting={coinPurchaseSubmitting}
            onClose={closeCoinRefillOverlay}
            onSelectPackage={selectCoinPackage}
            onEmailChange={setEmail}
            onTermsChange={setHostedPaymentTermsAccepted}
            onAcknowledgeCoinPolicy={() => acknowledgeCoinPolicy("Live coin purchase overlay")}
            onAskMaya={askMayaToConfirmPackage}
            onSubmit={prepareLiveCoinPurchase}
          /> : null}
          <RefillResumeModal
            reason={refillResumeReason}
            tokenBalance={walletCoins}
            pendingTip={pendingTip}
            checkoutRemaining={checkoutRemaining}
            accessCopy={accessSettings.notificationText}
            accessCostLabel={money(accessSettings.minimumPayment)}
            accessLockReason={accessLockReason}
            onRefill={openTokenRefill}
            onReturnToLive={() => setRefillResumeReason(null)}
            onResumeAccess={resumeCheckout}
            onDeclineAccess={() => weightedAccessRedirect("visitor refused payment")}
            onQuickTip={openQuickTip}
          />
          <QuickLiveTipModal
            open={quickTipOpen}
            amounts={enabledQuickTipOptions}
            selectedId={selectedQuickTip?.id || null}
            requiredCoins={quickTipStage === "hourly" ? HOURLY_RATE_COINS : accessSettings.coinEquivalent}
            stage={quickTipStage}
            status={quickTipStatus}
            submitting={quickTipSubmitting}
            onClose={() => { if (!quickTipSubmitting) { trackQuickTipAnalytics("live_quick_tip_payment_cancelled", { stage: quickTipStage }); setQuickTipOpen(false); } }}
            onSelect={(id) => { const option = enabledQuickTipOptions.find((amount) => amount.id === id); if (option) { setSelectedQuickTipId(id); trackQuickTipAnalytics("live_quick_tip_selected", { quickTipId: option.id, coins: option.tokenCost, stage: quickTipStage }); } }}
            onSubmit={submitQuickTip}
          />

          <section className="stream-card">
            <div className="stream-topline">
              <h1>{appConfig.streamTitle}</h1>
              <div className="stream-actions">
                <strong className="view-rule-display" aria-label={`View Rule viewer count ${formatNumber(viewRuleViewerCount, language)}`}>
                  <span aria-hidden="true">👁</span>
                  {formatNumber(viewRuleViewerCount, language)}
                  <span key={livePresence.joinEventId} className={`viewer-join-arrow ${livePresence.joinEventId ? "is-visible" : ""}`} aria-hidden="true">↑</span>
                </strong>
                <button className="secondary" type="button" disabled={!theaterEnabled} onClick={() => setTheaterMode((value) => !value)}>
                  {theaterMode ? t("stream.exitTheater") : t("stream.theater")}
                </button>
                <button className="secondary video-control" type="button" onClick={toggleVideoMute}>
                  {videoMuted ? "Mute" : "Sound On"}
                </button>
                <button className="secondary video-control" type="button" onClick={requestPlayerFullscreen}>
                  Fullscreen
                </button>
                <div className="live-pill"><span />LIVE</div>
              </div>
            </div>
            <div className={`player ${videoSource ? "has-source" : ""} ${accessLocked ? "is-access-locked" : ""} ${liveViewingCredit.deliveryPaused ? "is-delivery-paused" : ""}`} style={{ "--access-blur": `${accessSettings.blurStrength}px` } as CSSProperties}>
              {/* LiveVideoSurface keeps preload="none" and the media element stable while Live status changes. */}
              <LiveVideoSurface videoRef={videoRef} muted={videoMuted} videoEvents={streamPlayback.videoEvents} onPlaying={handleVideoPlaying} />
              {liveViewingCredit.deliveryPaused ? <div className="live-credit-paused-state" role="status" aria-live="polite">
                <span className="live-credit-paused-kicker">{liveViewingCredit.pauseReason === "hourly" ? "LIVE TIME EMPTY" : "LIVE PAUSED"}</span>
                <strong>{liveViewingCredit.pauseReason === "hourly" ? "REFILL TO CONTINUE WATCHING" : "10 COINS / $5 TO CONTINUE WATCHING"}</strong>
                {liveViewingCredit.pauseReason === "hourly" ? <small>32 COINS = 1 HOUR</small> : null}
                <div className="live-credit-paused-actions">
                  <button className="primary" type="button" onClick={() => { window.dispatchEvent(new CustomEvent("xmf:payment-flow-started")); window.dispatchEvent(new CustomEvent("xmf:tip-reminder-tip")); }}>TIP NOW</button>
                  <button className="secondary" type="button" onClick={() => { window.dispatchEvent(new CustomEvent("xmf:tip-reminder-buy-coins")); }}>BUY COINS</button>
                </div>
              </div> : null}
              {liveViewingCredit.timerVisible && !liveViewingCredit.deliveryPaused ? <div className={`live-credit-timer ${liveViewingCredit.warning === "final" ? "is-final" : liveViewingCredit.warning === "strong" ? "is-strong" : ""}`} role="status" aria-live="polite">LIVE TIME <strong>{liveViewingCredit.remainingLabel}</strong></div> : null}
              <div className={`now-playing-notice ${nowPlayingVisible ? "is-visible" : ""}`} aria-live="polite">
                <span>♪</span>
                <strong>{activeMusicTrack?.title || "Lobby mix standing by"}</strong>
                <small>{activeMusicTrack?.artist || "XMASKEDFREAKS"}</small>
              </div>
              <audio ref={lobbyAudioRef} preload="auto" aria-hidden="true" />
              <div className="player-fallback" aria-label="Live video placeholder" />
              <div className="watermark">{displayName || t("top.guest")}</div>
              <LiveCommentFeed sandbox={sandbox} liveSessionId="daily-live" />
              <button
                className="immersive-live-toggle"
                type="button"
                aria-pressed={immersiveMode}
                aria-label={t(immersiveMode ? "stream.exitImmersive" : "stream.enterImmersive")}
                onClick={() => setImmersiveMode((value) => !value)}
              >
                <span aria-hidden="true">⛶</span>
                <span>{t(immersiveMode ? "stream.exitImmersive" : "stream.enterImmersive")}</span>
              </button>
            </div>
          </section>

          <SupportWidget />
        </section>

        <section className="schedule-strip localized-schedule" aria-label="Live schedule">
          <span><strong>{t("schedule.everyday")}</strong></span>
          <span><strong>{t("schedule.yourLocal")}</strong> {scheduleWindows.map((window) => window.local).join(" / ")}</span>
          <span><strong>{t("schedule.nextLive")}</strong> {nextScheduledLive.local}</span>
          {!timeZoneDetected && <span className="warning">{t("schedule.timeZoneNotice")}</span>}
          <span>{t("schedule.newsletter")}</span>
        </section>

        <section className="payment-panel add-coins-store" id="coin-packages" aria-labelledby="add-coins-title">
          <header className="coin-store-header">
            <div className="coin-store-title">
              <div className="coin-stack-mark" aria-hidden="true"><CoinIcon /><CoinIcon /><CoinIcon /></div>
              <div>
                <p className="kicker">{t("wallet.packages")}</p>
                <h2 id="add-coins-title">{t("wallet.addCoins")}</h2>
                <p>{t("wallet.packagesCopy")}</p>
              </div>
            </div>
            <aside className="coin-store-promo" aria-label={t("wallet.bonusInfo")}>
              <span aria-hidden="true">♨</span>
              <strong>{t("wallet.biggerPacks")}<br />{t("wallet.betterDeals")}</strong>
              <small>{t("wallet.buyMore")}</small>
            </aside>
          </header>

          <div className="coin-store-status" aria-label={t("wallet.statusLabel")}>
            <span><small>{t("top.dailyGoal")}</small><strong>{t("wallet.percentComplete", { percent: Math.round(goalPercent) })}</strong><i><b style={{ width: `${goalPercent}%` }} /></i></span>
            <span><small>{t("top.wallet")}</small><strong><CoinValue value={walletCoins} language={language} /></strong><em>{tokenBalance === null ? t("wallet.signInSync") : t("wallet.confirmedBalance")}</em></span>
            <span><small>{t("wallet.liveStatus")}</small><strong>{t("wallet.watching", { count: formatNumber(viewRuleViewerCount, language) })}</strong><em>{streamPlayback.status === "live" ? t("wallet.liveNow") : t("wallet.waitingRoom")}</em></span>
          </div>

          <div className="coin-package-grid" role="list" aria-label={t("wallet.availablePackages")}>
            {enabledCoinPackages.map((item) => {
              const quote = quoteCoinPackage(item);
              return (
                <article className={`coin-package-card ${selectedCoinPackage?.id === item.id ? "is-selected" : ""} ${item.highlighted ? "is-highlighted" : ""}`} role="listitem" key={item.id}>
                  {item.badge ? <span className="coin-package-badge">{item.badge}</span> : null}
                  <p>{item.name.toUpperCase()}</p>
                  <small className="coin-package-description">{item.description}</small>
                  <h3>{money(quote.amount).replace(".00", "")}</h3>
                  <CoinIcon className="package-coin-art" />
                  <dl>
                    <div><dt>{t("wallet.base")}</dt><dd>{formatNumber(quote.baseCoins, language)}</dd></div>
                    <div><dt>{t("wallet.bonus")}</dt><dd>+ {formatNumber(quote.bonusCoins, language)}</dd></div>
                    <div className="coin-total"><dt>{t("wallet.total")}</dt><dd>{formatNumber(quote.totalCoins, language)}</dd></div>
                  </dl>
                  <strong className="coin-savings">{t("wallet.bonusPercent", { percent: quote.bonusPercent })}</strong>
                  <button
                    className="coin-package-choose"
                    type="button"
                    aria-pressed={selectedCoinPackage?.id === item.id}
                    aria-label={t("wallet.chooseLabel", { name: item.name, amount: money(quote.amount), coins: formatNumber(quote.totalCoins, language) })}
                    onClick={() => selectCoinPackage(item.id)}
                  >
                    {selectedCoinPackage?.id === item.id ? t("wallet.selected") : t("wallet.choose")}
                  </button>
                </article>
              );
            })}
          </div>

          <section className="payment-confirmation" aria-live="polite">
            <div className="confirmation-heading"><span aria-hidden="true">✓</span><div><strong>{t("wallet.confirmPackage")}</strong><small>{selectedPackageQuote ? t("wallet.youSelected") : t("wallet.chooseContinue")}</small></div></div>
            {selectedPackageQuote && selectedCoinPackage ? (
              <div className="confirmation-package">
                <CoinIcon />
                <strong>{money(selectedPackageQuote.amount).replace(".00", "")} {t("wallet.pack")}</strong>
                <span>{formatNumber(selectedPackageQuote.baseCoins, language)} {t("wallet.base")}</span><b>+</b>
                <span>{formatNumber(selectedPackageQuote.bonusCoins, language)} {t("wallet.bonus")}</span><b>=</b>
                <span>{formatNumber(selectedPackageQuote.totalCoins, language)} {t("wallet.coins")}</span>
              </div>
            ) : null}
            <div className="confirmation-action">
              <p>{selectedPackageQuote ? t("wallet.payReceive", { amount: money(selectedPackageQuote.amount), coins: formatNumber(selectedPackageQuote.totalCoins, language) }) : t("wallet.noPackage")}</p>
              <button className="maya-confirm-button" type="button" disabled={!selectedPackageQuote} onClick={askMayaToConfirmPackage}>{t("wallet.askMaya")}</button>
            </div>
          </section>

          <form className="payment-form" onSubmit={prepareTokenizedPayment}>
            <label>{t("payment.receiptEmail")}<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label>
            <section className="coin-policy-notice hosted-payment-notice">
              <strong>Secure hosted payment</strong>
              <p>Your payment will be completed securely on our payment provider’s website. XMASKEDFREAKS does not receive or store your card details.</p>
            </section>
            {coinPolicy.showInPurchase ? (
              <section className="coin-policy-notice">
                <strong>Coin Usage</strong>
                <p>{coinPolicy.disclosure}</p>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={coinPolicyAcknowledged}
                    disabled={coinPolicyAcknowledged && !coinPolicy.requireEveryPurchase}
                    onChange={(event) => {
                      if (event.target.checked) acknowledgeCoinPolicy("checkout checkbox");
                    }}
                  />
                  I understand how Platform Coins can be used.
                </label>
              </section>
            ) : null}
            <label className="check-row"><input type="checkbox" checked={hostedPaymentTermsAccepted} onChange={(event) => setHostedPaymentTermsAccepted(event.target.checked)} /> I accept the checkout terms and understand payment continues on the provider’s website.</label>
            <button className="primary" type="submit" disabled={!selectedPackageQuote || !hostedPaymentTermsAccepted}>{mayaPackageConfirmed ? "Continue to secure payment" : "Continue without Maya"}</button>
            <p className="status-line">{paymentStatus}</p>
          </form>
          <footer className="coin-store-trust" aria-label="Payment protections">
            <span>✓ Secure payments</span>
            <span>⚡ Credit after approval</span>
            <span>▣ Secure processor checkout</span>
            <span>◉ Payment support</span>
          </footer>
          <div className="account-settings-grid">
            <section className="account-card">
              <h3>Live notification settings</h3>
              <label className="check-row"><input type="checkbox" checked={liveAlertsEmail} onChange={(event) => setLiveAlertsEmail(event.target.checked)} /> Email me when the stream goes live</label>
              <label className="check-row"><input type="checkbox" checked={futurePushAlerts} onChange={(event) => setFuturePushAlerts(event.target.checked)} /> Future browser/mobile/SMS alerts</label>
              <p className="status-line">Marketing emails must include unsubscribe links and respect consent, suppression, and delivery rules.</p>
            </section>
            <section className="account-card">
              <h3>Account Security</h3>
              <label className="check-row"><input type="checkbox" checked={userTwoFactorEnabled} onChange={(event) => { setUserTwoFactorEnabled(event.target.checked); setAccountSecurityStatus(event.target.checked ? "Authenticator app 2FA enabled. Trusted devices skip codes until inactivity expires." : "2FA disabled for this standard user. Email/password login stays fast."); }} /> Enable authenticator app 2FA</label>
              <label>Trusted-device inactivity days<input type="number" min={1} max={180} value={trustedDeviceDays} onChange={(event) => setTrustedDeviceDays(Number(event.target.value))} /></label>
              <div className="recovery-code-list">
                {recoveryCodes.length ? recoveryCodes.map((code) => <span key={code}>{maskRecoveryCode(code)}</span>) : <span>No recovery codes generated.</span>}
              </div>
              <button className="secondary" type="button" onClick={generateRecoveryCodes}>Generate recovery codes</button>
              <p className="status-line">{accountSecurityStatus}</p>
            </section>
            <section className="account-card">
              <h3>Payment Methods</h3>
              <p>Payment details are entered only on the approved provider’s hosted checkout page.</p>
              <p className="status-line">XMASKEDFREAKS does not request, receive, or store card numbers, expiration dates, CVV codes, or raw payment credentials.</p>
            </section>
            <section className="account-card">
              <h3>Wallet transaction history</h3>
              <div className="transaction-history">
                {walletTransactions.length ? walletTransactions.map((item) => (
                  <div className="transaction-row" key={item.id}>
                    <span><strong>{item.type}</strong><small>{new Date(item.createdAt).toLocaleString()} · {item.reference}</small></span>
                    <em>{item.type === "tip" ? `${Math.abs(item.totalCoins).toLocaleString()} coins` : money(item.amount)}</em>
                    <small><CoinValue value={item.baseCoins} language={language} label="base" /> · <CoinValue value={item.bonusCoins} language={language} label="bonus" /> · <CoinValue value={item.totalCoins} language={language} label="total" /></small>
                    {coinPolicy.showInReceipts ? <small>{coinPolicy.disclosure}</small> : null}
                  </div>
                )) : <span>No wallet transactions yet.</span>}
              </div>
              <p className="status-line">Wallet credits appear only after processor confirmation. Duplicate webhook and replay protection belongs on the server.</p>
            </section>
            {coinPolicy.showInWallet ? (
              <section className="account-card coin-usage-card">
                <h3>Coin Usage</h3>
                <p>{coinPolicy.disclosure}</p>
                <p className="status-line">Coins are not cash, stored value, bank funds, cryptocurrency, investments, or transferable financial instruments. Merchandise eligibility: {coinPolicy.merchandiseEnabled ? coinPolicy.eligibleMerchandise : "disabled"}.</p>
              </section>
            ) : null}
          </div>
        </section>

        <FaqSection translate={t} hideCoinUsage={!coinPolicy.showInFaq} />

        {sandbox ? <section id="creator" className="creator-panel">
          <div className="creator-heading">
            <p className="kicker">{t("creator.kicker")}</p>
            <h2>{t("creator.title")}</h2>
            <p>{t("creator.copy")}</p>
          </div>
          <div className={`creator-form ${adminUnlocked ? "" : "is-locked"}`}>
            <div className="unlock-row">
              <label htmlFor="ownerCode">{t("creator.ownerCode")}</label>
              <div className="inline-form">
                <input id="ownerCode" type="password" value={adminCode} onChange={(event) => setAdminCode(event.target.value)} />
                <button className="secondary" type="button" onClick={unlockAdmin}>{t("creator.unlock")}</button>
              </div>
            </div>
            <div className="admin-modules">
              <section className="admin-card">
                <p className="kicker">{t("creator.connection")}</p>
                <h3>{t("creator.streamStability")}</h3>
                <p>{t("creator.streamCopy")}</p>
                <label>
                  {t("creator.videoProvider")}
                  <select
                    value={videoConfig.provider}
                    onChange={(event) => updateVideoConfig({ provider: event.target.value as VideoProvider })}
                    disabled={!adminUnlocked}
                  >
                    <option value="mux">Mux</option>
                    <option value="bunny">Bunny Stream</option>
                    <option value="cloudflare">Cloudflare Stream</option>
                  </select>
                </label>
                <span>{t("creator.activeProvider")} <strong>{getProviderLabel(videoConfig.provider)}</strong></span>
              </section>
              <section className="admin-card">
                <p className="kicker">{t("creator.analytics")}</p>
                <h3>{t("creator.honestStats")}</h3>
                <span>{t("creator.actualViewer")} <strong>{formatNumber(realViewerCount, language)}</strong></span>
                <span>{t("creator.publicDisplay")} <strong>{formatNumber(viewRuleViewerCount, language)}</strong></span>
                <span>{t("creator.tipsRecorded")} <strong>{money(tipTotal)}</strong></span>
                <span>Geo active visitors <strong>{formatNumber(geoTotals.active, language)}</strong></span>
              </section>
              <section className="admin-card">
                <p className="kicker">{t("creator.notifications")}</p>
                <h3>{t("creator.adminCenter")}</h3>
                {notifications.length ? notifications.map((item) => <p key={item}>{item}</p>) : <p>{t("creator.noAlerts")}</p>}
              </section>
              <section className="admin-card">
                <p className="kicker">Rewards</p>
                <h3>Global tip notifications</h3>
                <label>Emoji set<input value={rewardEmojis} disabled={!adminUnlocked} onChange={(event) => setRewardEmojis(event.target.value)} /></label>
                <label>Animation<select value={rewardAnimation} disabled={!adminUnlocked} onChange={(event) => setRewardAnimation(event.target.value)}><option value="slide">Slide glow</option><option value="pulse">Soft pulse</option><option value="spark">Cash spark</option></select></label>
                <label>Sound<select value={rewardSound} disabled={!adminUnlocked} onChange={(event) => setRewardSound(event.target.value)}><option value="ching">Money ching</option><option value="bell">Soft bell</option><option value="pulse">Green pulse</option><option value="arcade">Arcade coins</option></select></label>
                <label>Accent color<input type="color" value={rewardColor} disabled={!adminUnlocked} onChange={(event) => setRewardColor(event.target.value)} /></label>
                <label>Display seconds<input type="number" min={3} max={20} value={rewardDisplaySeconds} disabled={!adminUnlocked} onChange={(event) => setRewardDisplaySeconds(Math.max(3, Math.min(20, Number(event.target.value))))} /></label>
                <button className="secondary" type="button" disabled={!adminUnlocked} onClick={() => publishRewardEvent("DemoViewer", 5, "Admin preview", 10)}>Preview reward</button>
                <p className="status-line">Built as a global event service. Production can wire the same payload to Supabase Realtime, SSE, or a websocket provider.</p>
              </section>
              <section className="admin-card live-notification-card">
                <p className="kicker">Live Notification Manager</p>
                <h3>Managed from Operationalization Center</h3>
                <p className="status-line">Sandbox previews never fabricate recipients, delivery counts, or provider acceptance. Use the protected Resend queue manager for a real test-recipient handoff and cooldown state.</p>
                <button className="primary" type="button" disabled={!adminUnlocked} onClick={sendLiveNotification}>Open Operationalization Center</button>
                <p className="status-line">Email remains the only enabled outbound channel. Browser push, mobile push, and SMS stay deferred.</p>
              </section>
              <section className="admin-card background-music-card">
                <p className="kicker">Background Music</p>
                <h3>Live lobby playlist</h3>
                <p className="status-line">Lobby audio is secondary to live video, chat, tip sounds, games, and notifications. MP4 files with audio plus MP3, AAC, M4A, and WAV are accepted for protected provider storage in production.</p>
                <div className="music-control-grid">
                  <label className="check-row"><input type="checkbox" checked={backgroundMusic.enabled} disabled={!adminUnlocked} onChange={(event) => setBackgroundMusic((settings) => ({ ...settings, enabled: event.target.checked }))} /> Music system on</label>
                  <label>Mode<select value={backgroundMusic.mode} disabled={!adminUnlocked} onChange={(event) => setBackgroundMusic((settings) => ({ ...settings, mode: event.target.value as BackgroundMusicSettings["mode"] }))}><option value="automatic">Automatic</option><option value="lobby-only">Lobby Only</option><option value="live-background">Live Background</option><option value="disabled">Disabled</option></select></label>
                  <label>Playlist name<input value={backgroundMusic.playlistName} disabled={!adminUnlocked} onChange={(event) => setBackgroundMusic((settings) => ({ ...settings, playlistName: event.target.value }))} /></label>
                  <label>Pre-show playlist<input value={backgroundMusic.preshowPlaylistName} disabled={!adminUnlocked} onChange={(event) => setBackgroundMusic((settings) => ({ ...settings, preshowPlaylistName: event.target.value }))} /></label>
                  <label>Track upload<input type="file" accept=".mp3,.aac,.m4a,.wav,.mp4,audio/*,video/mp4" multiple disabled={!adminUnlocked} onChange={handleMusicUploads} /></label>
                  <label>Pre-live start minutes<input type="number" min={0} max={120} value={backgroundMusic.preLiveStartMinutes} disabled={!adminUnlocked} onChange={(event) => setBackgroundMusic((settings) => ({ ...settings, preLiveStartMinutes: Number(event.target.value) }))} /></label>
                  <label>Lobby volume<input type="range" min={0} max={100} value={backgroundMusic.lobbyVolume} disabled={!adminUnlocked} onChange={(event) => setBackgroundMusic((settings) => ({ ...settings, lobbyVolume: Number(event.target.value) }))} /></label>
                  <label>Live ducking volume<input type="range" min={0} max={30} value={backgroundMusic.liveDuckingVolume} disabled={!adminUnlocked} onChange={(event) => setBackgroundMusic((settings) => ({ ...settings, liveDuckingVolume: Number(event.target.value) }))} /></label>
                  <label>Crossfade seconds<input type="number" min={0} max={20} value={backgroundMusic.crossfadeSeconds} disabled={!adminUnlocked} onChange={(event) => setBackgroundMusic((settings) => ({ ...settings, crossfadeSeconds: Number(event.target.value) }))} /></label>
                  <label>Notice seconds<input type="number" min={2} max={15} value={backgroundMusic.noticeSeconds} disabled={!adminUnlocked} onChange={(event) => setBackgroundMusic((settings) => ({ ...settings, noticeSeconds: Number(event.target.value) }))} /></label>
                  <label>Post-live behavior<select value={backgroundMusic.postLiveBehavior} disabled={!adminUnlocked} onChange={(event) => setBackgroundMusic((settings) => ({ ...settings, postLiveBehavior: event.target.value as BackgroundMusicSettings["postLiveBehavior"] }))}><option value="resume">Resume lobby position</option><option value="post-show">Start post-show playlist</option><option value="stop">Stop after live</option></select></label>
                  <label className="check-row"><input type="checkbox" checked={backgroundMusic.shuffle} disabled={!adminUnlocked} onChange={(event) => setBackgroundMusic((settings) => ({ ...settings, shuffle: event.target.checked }))} /> Shuffle</label>
                  <label className="check-row"><input type="checkbox" checked={backgroundMusic.repeat} disabled={!adminUnlocked} onChange={(event) => setBackgroundMusic((settings) => ({ ...settings, repeat: event.target.checked }))} /> Repeat</label>
                  <label className="check-row"><input type="checkbox" checked={backgroundMusic.stopWhenLive} disabled={!adminUnlocked} onChange={(event) => setBackgroundMusic((settings) => ({ ...settings, stopWhenLive: event.target.checked }))} /> Stop completely when live</label>
                </div>
                <label className="wide-field">Playlist tracks, one per line: Title|Artist|URL or local filename|Minutes|Enabled
                  <textarea rows={5} value={musicTrackText} disabled={!adminUnlocked} onChange={(event) => setMusicTrackText(event.target.value)} />
                </label>
                <div className="music-admin-actions">
                  <button className="secondary" type="button" disabled={!adminUnlocked} onClick={() => { saveMusicSettings(); playMusicTrack(musicIndex); }}>Preview playlist</button>
                  <button className="secondary" type="button" disabled={!adminUnlocked} onClick={skipMusicTrack}>Skip track</button>
                  <button className="secondary" type="button" disabled={!adminUnlocked} onClick={() => setMusicLiveMode("offline")}>Simulate offline lobby</button>
                  <button className="secondary" type="button" disabled={!adminUnlocked} onClick={() => setMusicLiveMode("live")}>Simulate live ducking</button>
                  <button className="secondary" type="button" disabled={!adminUnlocked} onClick={saveMusicSettings}>Save music settings</button>
                </div>
                <div className="music-status-grid">
                  <span>Now playing<strong>{activeMusicTrack ? `${activeMusicTrack.title} · ${activeMusicTrack.artist}` : "Standing by"}</strong></span>
                  <span>Cache status<strong>{musicCacheStatus}</strong></span>
                  <span>Audio mix<strong>{musicMixStatus}</strong></span>
                  <span>Mode<strong>{backgroundMusic.mode} · {backgroundMusic.enabled ? "on" : "off"}</strong></span>
                </div>
                <div className="notification-history">
                  {backgroundMusic.tracks.map((track) => <span key={track.id}>{track.enabled ? "On" : "Off"} · {track.title}<strong>{track.artist} · {track.durationMinutes} min · {track.type}{track.src ? " · source ready" : " · demo tone"}</strong></span>)}
                </div>
                <div className="notification-history">
                  {musicLogs.length ? musicLogs.map((entry) => <span key={`${entry.createdAt}-${entry.message}`}>{entry.message}<strong>{entry.createdAt} · {entry.level}</strong></span>) : <span>No music events yet.</span>}
                </div>
              </section>
              <section className="admin-card payment-admin-card">
                <p className="kicker">Payments</p>
                <h3>Hosted checkout readiness</h3>
                <p>Segpay and CCBill remain disabled until official provider documentation, approval, and credentials are supplied.</p>
                <label>Extra verification over<input type="number" min={1} value={fastTipThreshold} disabled={!adminUnlocked} onChange={(event) => setFastTipThreshold(Number(event.target.value))} /></label>
                <label>Risk review threshold<input type="number" min={1} value={paymentRiskThreshold} disabled={!adminUnlocked} onChange={(event) => setPaymentRiskThreshold(Number(event.target.value))} /></label>
                <label>Max wallet purchase<input type="number" min={25} max={1000} value={walletMaxPurchase} disabled={!adminUnlocked} onChange={(event) => setWalletMaxPurchase(Math.max(25, Math.min(1000, Number(event.target.value))))} /></label>
                <label>
                  Deposit schedule
                  <select value={depositFrequency} disabled={!adminUnlocked} onChange={(event) => setDepositFrequency(event.target.value as DepositFrequency)}>
                    {depositScheduleOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <label>Last deposit timestamp<input value={lastDepositAt} disabled={!adminUnlocked} onChange={(event) => setLastDepositAt(event.target.value)} /></label>
                <div className="admin-stats">
                  <span>Card entry <strong>Provider website only</strong></span>
                  <span>Callback dedupe <strong>Provider event ID required</strong></span>
                  <span>Wallet credit <strong>Verified callback only</strong></span>
                  <span>Bonus cap <strong>15% hard max</strong></span>
                  <span>Deposit frequency <strong>{formatDepositScheduleLabel(depositFrequency)}</strong></span>
                  <span>Next scheduled payout <strong>{nextDepositLabel}</strong></span>
                  <span>Payout countdown <strong>{nextDepositAt ? formatTimer(depositCountdown) : "Manual"}</strong></span>
                </div>
                <button
                  className="secondary"
                  type="button"
                  disabled={!adminUnlocked}
                  onClick={() => {
                    setLastDepositAt(new Date().toISOString());
                    setDepositStatus(`Deposit schedule saved: ${formatDepositScheduleLabel(depositFrequency)}. Next payout ${nextDepositLabel}.`);
                  }}
                >
                  Save deposit schedule
                </button>
                <p className="status-line">{depositStatus}</p>
                <p className="status-line">Admins may see payment status and processor references only. Card details never enter this application.</p>
              </section>
              <section className="admin-card coin-policy-admin-card">
                <p className="kicker">Coin Policy</p>
                <h3>Usage disclosure controls</h3>
                <label>Disclosure wording<textarea rows={4} value={coinPolicy.disclosure} disabled={!adminUnlocked} onChange={(event) => setCoinPolicy((policy) => ({ ...policy, disclosure: event.target.value || defaultCoinUsageDisclosure }))} /></label>
                <label className="check-row"><input type="checkbox" checked={coinPolicy.requireEveryPurchase} disabled={!adminUnlocked} onChange={(event) => { setCoinPolicy((policy) => ({ ...policy, requireEveryPurchase: event.target.checked })); logCoinPolicyEvent("admin update", "Changed acknowledgement frequency"); }} /> Require acknowledgement on every coin purchase</label>
                <label className="check-row"><input type="checkbox" checked={coinPolicy.showInPurchase} disabled={!adminUnlocked} onChange={(event) => setCoinPolicy((policy) => ({ ...policy, showInPurchase: event.target.checked }))} /> Show above purchase confirmation</label>
                <label className="check-row"><input type="checkbox" checked={coinPolicy.showInWallet} disabled={!adminUnlocked} onChange={(event) => setCoinPolicy((policy) => ({ ...policy, showInWallet: event.target.checked }))} /> Show inside wallet</label>
                <label className="check-row"><input type="checkbox" checked={coinPolicy.showInFaq} disabled={!adminUnlocked} onChange={(event) => setCoinPolicy((policy) => ({ ...policy, showInFaq: event.target.checked }))} /> Show inside FAQ and Help Center</label>
                <label className="check-row"><input type="checkbox" checked={coinPolicy.showInReceipts} disabled={!adminUnlocked} onChange={(event) => setCoinPolicy((policy) => ({ ...policy, showInReceipts: event.target.checked }))} /> Include in receipts and confirmation screens</label>
                <label className="check-row"><input type="checkbox" checked={coinPolicy.merchandiseEnabled} disabled={!adminUnlocked} onChange={(event) => setCoinPolicy((policy) => ({ ...policy, merchandiseEnabled: event.target.checked }))} /> Future approved merchandise eligibility enabled</label>
                <label>Eligible merchandise note<input value={coinPolicy.eligibleMerchandise} disabled={!adminUnlocked} onChange={(event) => setCoinPolicy((policy) => ({ ...policy, eligibleMerchandise: event.target.value.slice(0, 180) }))} /></label>
                <div className="coin-policy-preview-grid">
                  <div className="coin-policy-notice"><strong>Desktop preview</strong><p>{coinPolicy.disclosure}</p></div>
                  <div className="coin-policy-notice mobile-preview"><strong>Mobile preview</strong><p>{coinPolicy.disclosure}</p></div>
                </div>
                <div className="notification-history">
                  {coinPolicyLogs.length ? coinPolicyLogs.map((entry) => <span key={`${entry.type}-${entry.createdAt}`}>{entry.type}<strong>{entry.detail} · {entry.user} · {entry.createdAt}</strong></span>) : <span>No coin policy events yet.</span>}
                </div>
                <button className="secondary" type="button" disabled={!adminUnlocked} onClick={() => logCoinPolicyEvent("admin update", "Coin usage disclosure settings reviewed and saved")}>Log policy update</button>
                <p className="status-line">Production should store acknowledgements and policy updates server-side by user/session and policy version.</p>
              </section>
              <section className="admin-card payment-admin-card">
                <p className="kicker">Coin Package Manager</p>
                <h3>Packages and bonus pricing</h3>
                <div className="package-admin-list">
                  {[...coinPackages].sort((a, b) => a.order - b.order).map((item) => (
                    <div className="package-admin-row" key={item.id}>
                      <label><input type="checkbox" checked={item.enabled} disabled={!adminUnlocked} onChange={(event) => setCoinPackages((packages) => packages.map((pack) => pack.id === item.id ? { ...pack, enabled: event.target.checked } : pack))} /> Enabled</label>
                      <input value={item.name} disabled={!adminUnlocked} aria-label="Package name" onChange={(event) => setCoinPackages((packages) => packages.map((pack) => pack.id === item.id ? { ...pack, name: event.target.value.slice(0, 24) } : pack))} />
                      <input value={item.label} disabled={!adminUnlocked} onChange={(event) => setCoinPackages((packages) => packages.map((pack) => pack.id === item.id ? { ...pack, label: event.target.value.slice(0, 32) } : pack))} />
                      <input value={item.description} disabled={!adminUnlocked} aria-label="Package description" onChange={(event) => setCoinPackages((packages) => packages.map((pack) => pack.id === item.id ? { ...pack, description: event.target.value.slice(0, 64) } : pack))} />
                      <input type="number" min={5} max={1000} value={item.amount} disabled={!adminUnlocked} onChange={(event) => setCoinPackages((packages) => packages.map((pack) => pack.id === item.id ? { ...pack, amount: Math.max(5, Math.min(1000, Number(event.target.value))) } : pack))} />
                      <input type="number" min={1} max={2000} aria-label="Base coins" value={item.baseCoins} disabled={!adminUnlocked} onChange={(event) => setCoinPackages((packages) => packages.map((pack) => pack.id === item.id ? { ...pack, baseCoins: Math.max(1, Math.min(2000, Number(event.target.value))) } : pack))} />
                      <input type="number" min={0} max={300} aria-label="Bonus coins" value={item.bonusCoins} disabled={!adminUnlocked} onChange={(event) => setCoinPackages((packages) => packages.map((pack) => pack.id === item.id ? { ...pack, bonusCoins: Math.max(0, Math.min(300, Number(event.target.value))) } : pack))} />
                      <input type="number" min={0} max={15} value={item.bonusPercent} disabled={!adminUnlocked} onChange={(event) => setCoinPackages((packages) => packages.map((pack) => pack.id === item.id ? { ...pack, bonusPercent: Math.max(0, Math.min(15, Number(event.target.value))) } : pack))} />
                      <input value={item.badge} disabled={!adminUnlocked} onChange={(event) => setCoinPackages((packages) => packages.map((pack) => pack.id === item.id ? { ...pack, badge: event.target.value.slice(0, 24) } : pack))} placeholder="Badge" />
                      <input type="number" min={1} max={50} aria-label="Package order" value={item.order} disabled={!adminUnlocked} onChange={(event) => setCoinPackages((packages) => packages.map((pack) => pack.id === item.id ? { ...pack, order: Math.max(1, Math.min(50, Number(event.target.value))) } : pack))} />
                      <label><input type="checkbox" checked={item.highlighted} disabled={!adminUnlocked} onChange={(event) => setCoinPackages((packages) => packages.map((pack) => pack.id === item.id ? { ...pack, highlighted: event.target.checked } : pack))} /> Highlight</label>
                      <button className="secondary" type="button" disabled={!adminUnlocked} onClick={() => setCoinPackages((packages) => packages.concat({ ...item, id: `${item.id}-copy-${Date.now()}`, label: `${item.label} Copy`, order: packages.length + 1 }))}>Duplicate</button>
                      <button className="secondary" type="button" disabled={!adminUnlocked} onClick={() => setCoinPackages((packages) => packages.map((pack) => pack.id === item.id ? { ...pack, enabled: false } : pack))}>Disable</button>
                    </div>
                  ))}
                </div>
                <button className="primary" type="button" disabled={!adminUnlocked} onClick={() => setCoinPackages((packages) => packages.concat({ id: `package-${Date.now()}`, name: "New Package", label: "$25 New Package", description: "Admin-configured package", amount: 25, baseCoins: 50, bonusCoins: 0, bonusPercent: 0, badge: "", highlighted: false, enabled: true, order: packages.length + 1 }))}>Add package</button>
                <p className="status-line">Server must recalculate package price, base coins, bonus coins, and final wallet credit after processor confirmation. Browser values are display only.</p>
              </section>
              <section className="admin-card access-control-card">
                <p className="kicker">Live Entry &amp; Viewing Credit</p>
                <h3>Contribution, reminder, exemption, and restriction settings</h3>
                <p className="status-line">The $25 watch requirement has been removed. Live entry is $5 or 10 coins, followed by exactly 5 minutes of complimentary grace, then refillable credit at 32 coins per hour. {appConfig.accessControlNotice} The 6464 code is only a secondary confirmation PIN and must be hashed server-side.</p>
                <div className="access-pin-row">
                  <input type="password" inputMode="numeric" maxLength={8} value={accessPanelPin} disabled={!adminUnlocked} onChange={(event) => setAccessPanelPin(event.target.value)} placeholder="Secondary PIN" />
                  <button className="secondary" type="button" disabled={!adminUnlocked} onClick={unlockAccessPanel}>Open sensitive panel</button>
                </div>
                <div className={`access-control-settings ${accessPanelUnlocked ? "" : "is-locked"}`}>
                  <label>Viewing threshold<input type="number" min={1} value={accessSettings.accessWindowMinutes} onChange={(event) => setAccessSettings((settings) => ({ ...settings, accessWindowMinutes: Number(event.target.value) }))} /></label>
                  <label>Required contribution (USD)<input type="number" min={5} max={200} step={0.01} value={accessSettings.minimumPayment} onChange={(event) => setAccessSettings((settings) => ({ ...settings, minimumPayment: Math.max(5, Number(event.target.value)) }))} /></label>
                  <label>Required contribution (coins)<input type="number" min={10} value={accessSettings.coinEquivalent} onChange={(event) => setAccessSettings((settings) => ({ ...settings, coinEquivalent: Math.max(10, Number(event.target.value)) }))} /></label>
                  <label>Checkout timer<input type="number" min={10} value={accessSettings.checkoutTimerSeconds} onChange={(event) => setAccessSettings((settings) => ({ ...settings, checkoutTimerSeconds: Number(event.target.value) }))} /></label>
                  <label>Blur strength<input type="number" min={4} max={32} value={accessSettings.blurStrength} onChange={(event) => setAccessSettings((settings) => ({ ...settings, blurStrength: Number(event.target.value) }))} /></label>
                  <label>Unlock duration<input type="number" min={1} value={accessSettings.unlockDurationMinutes} onChange={(event) => setAccessSettings((settings) => ({ ...settings, unlockDurationMinutes: Number(event.target.value) }))} /></label>
                  <label>Clips4Sale %<input type="number" min={0} max={100} value={accessSettings.clipsRedirectPercent} onChange={(event) => setAccessSettings((settings) => ({ ...settings, clipsRedirectPercent: Number(event.target.value) }))} /></label>
                  <label>Fansly %<input type="number" min={0} max={100} value={accessSettings.fanslyRedirectPercent} onChange={(event) => setAccessSettings((settings) => ({ ...settings, fanslyRedirectPercent: Number(event.target.value) }))} /></label>
                  <label>Clips4Sale URL<input value={accessSettings.clipsUrl} onChange={(event) => setAccessSettings((settings) => ({ ...settings, clipsUrl: event.target.value }))} /></label>
                  <label>Fansly URL<input value={accessSettings.fanslyUrl} onChange={(event) => setAccessSettings((settings) => ({ ...settings, fanslyUrl: event.target.value }))} /></label>
                  <label>Retry rules<input type="number" min={0} value={accessSettings.retryLimit} onChange={(event) => setAccessSettings((settings) => ({ ...settings, retryLimit: Number(event.target.value) }))} /></label>
                  <label>Notification text<textarea rows={2} value={accessSettings.notificationText} onChange={(event) => setAccessSettings((settings) => ({ ...settings, notificationText: event.target.value }))} /></label>
                </div>
                <div className="access-test-actions">
                  <button className="secondary" type="button" disabled={!accessPanelUnlocked} onClick={() => lockAccess("admin test mode lock")}>Simulate lock</button>
                  <button className="secondary" type="button" disabled={!accessPanelUnlocked} onClick={() => confirmAccessPayment(accessSettings.minimumPayment, `test_success_${Date.now()}`)}>Simulate success</button>
                  <button className="secondary" type="button" disabled={!accessPanelUnlocked} onClick={() => failAccessPayment("payment failed")}>Simulate failed payment</button>
                  <button className="secondary" type="button" disabled={!accessPanelUnlocked} onClick={() => weightedAccessRedirect("checkout timeout", true)}>Simulate timeout</button>
                  <button className="secondary" type="button" disabled={!accessPanelUnlocked} onClick={() => weightedAccessRedirect("admin weighted redirect test", true)}>Test weighted redirect</button>
                </div>
                <div className="notification-history">
                  {accessRedirectHistory.map((item) => <span key={`${item.destination}-${item.createdAt}`}>{item.destination}<strong>{item.reason} · {new Date(item.createdAt).toLocaleString()}</strong></span>)}
                </div>
                <p className="status-line">{accessPanelStatus}</p>
              </section>
              <section className="admin-card cost-dashboard-card">
                <p className="kicker">Cost Dashboard</p>
                <h3>Operating expense monitor</h3>
                <p className="status-line">Financial view is read-only for standard administrators. Never expose private API keys, banking details, or full payment credentials here.</p>
                <div className="cost-controls">
                  <label>Monthly budget<input type="number" min={1} value={monthlyBudget} disabled={!adminUnlocked || financePermission !== "finance"} onChange={(event) => setMonthlyBudget(Number(event.target.value))} /></label>
                  <label>Warning threshold %<input type="number" min={1} max={100} value={costWarningThreshold} disabled={!adminUnlocked || financePermission !== "finance"} onChange={(event) => setCostWarningThreshold(Number(event.target.value))} /></label>
                  <label>Finance permission<select value={financePermission} disabled={!adminUnlocked} onChange={(event) => setFinancePermission(event.target.value as "readonly" | "finance")}><option value="readonly">Read-only</option><option value="finance">Finance editor</option></select></label>
                </div>
                <div className="cost-summary-grid">
                  <span>Daily estimate<strong>{money(costDaily)}</strong></span>
                  <span>Weekly estimate<strong>{money(costWeekly)}</strong></span>
                  <span>Monthly estimate<strong>{money(costMonthlyTotal)}</strong></span>
                  <span>Projected month end<strong>{money(costProjected)}</strong></span>
                  <span>Budget used<strong>{formatNumber(costBudgetUsed, language)}%</strong></span>
                  <span>Top spender<strong>{costTopFeature[0]}</strong></span>
                </div>
                <div className="cost-alerts">
                  {costAlerts.length ? costAlerts.map((alert) => <span key={alert}>{alert}</span>) : <span>All services are below configured warning thresholds.</span>}
                </div>
                <div className="cost-dashboard-grid">
                  <section className="cost-panel">
                    <h4>Expenses by provider</h4>
                    <div className="cost-provider-list">
                      {costProviders.map((item) => (
                        <div className="cost-row" key={`${item.category}-${item.provider}`}>
                          <span><strong>{item.category}</strong><small>{item.provider} · {item.feature}</small></span>
                          <em>{money(item.fixedMonthly + item.usageMonthly)} / mo</em>
                          <small>Fixed {money(item.fixedMonthly)} · Usage {money(item.usageMonthly)}</small>
                        </div>
                      ))}
                    </div>
                  </section>
                  <section className="cost-panel">
                    <h4>Allowance usage</h4>
                    <div className="cost-allowance-list">
                      {costProviders.map((item) => (
                        <div className="allowance-row" key={`${item.provider}-allowance`}>
                          <span>{item.provider}<strong>{formatNumber(item.usagePercent, language)}% used</strong></span>
                          <div className="mini-track"><i style={{ width: `${Math.min(100, Math.max(0, item.usagePercent))}%` }} /></div>
                          <small>{item.freeRemaining}</small>
                        </div>
                      ))}
                    </div>
                  </section>
                  <section className="cost-panel">
                    <h4>Trend</h4>
                    <div className="cost-trend-chart">
                      {costTrend.map((point) => (
                        <span style={{ height: `${Math.max(12, (point.amount / maxTrendCost) * 100)}%` }} key={point.label}>
                          <i>{point.label}</i>
                          <strong>{money(point.amount)}</strong>
                        </span>
                      ))}
                    </div>
                  </section>
                  <section className="cost-panel">
                    <h4>Feature breakdown</h4>
                    <div className="cost-feature-breakdown">
                      {Object.entries(costFeatureTotals).sort((a, b) => b[1] - a[1]).map(([feature, amount]) => (
                        <div className="feature-cost-row" key={feature}>
                          <span>{feature}<strong>{money(amount)}</strong></span>
                          <div className="mini-track"><i style={{ width: `${Math.max(5, (amount / maxFeatureCost) * 100)}%` }} /></div>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
                <div className="cost-metric-grid">
                  <span>Cost / user<strong>{money(costPerUser)}</strong></span>
                  <span>Cost / viewer hour<strong>{money(costPerViewerHour)}</strong></span>
                  <span>Cost / stream<strong>{money(costPerStream)}</strong></span>
                  <span>Cost / tip<strong>{money(costPerTip)}</strong></span>
                  <span>Cost / conversion<strong>{money(costPerConversion)}</strong></span>
                </div>
                <label className="wide-field">
                  Manual provider costs, one per line: Category|Provider|Fixed monthly|Usage monthly|Usage %|Free remaining|Feature
                  <textarea rows={6} value={manualCostText} disabled={!adminUnlocked || financePermission !== "finance"} onChange={(event) => setManualCostText(event.target.value)} />
                </label>
                <button className="secondary" type="button" disabled={!adminUnlocked} onClick={saveCostDashboard}>Save cost settings</button>
                <p className="status-line">{costStatus}</p>
              </section>
              <section className="admin-card open-source-policy-card">
                <p className="kicker">Open-source-first policy</p>
                <h3>Cost-efficient development rules</h3>
                <p className="status-line">Before adding any library, API, hosted service, or paid integration, evaluate native browser/Next.js features and well-maintained open-source options first. Prefer MIT, Apache 2.0, BSD, or similarly permissive licenses.</p>
                <div className="policy-grid">
                  <span>Dependency rule<strong>Clear purpose, active maintenance, security history, docs, and bundle impact required.</strong></span>
                  <span>Paid service rule<strong>Document necessity, alternatives, pricing model, monthly cost, limits, lock-in, and replacement plan.</strong></span>
                  <span>Quality rule<strong>Do not choose the cheapest option when it harms reliability, security, accessibility, performance, or UX.</strong></span>
                  <span>Architecture rule<strong>Keep integrations modular and provider-agnostic so services can be replaced later.</strong></span>
                </div>
                <div className="dependency-review-list">
                  <span>Native browser / Next.js first</span>
                  <span>Reuse existing dependencies before adding new ones</span>
                  <span>Avoid abandoned, duplicate, or oversized packages</span>
                  <span>Run audits and remove unused packages regularly</span>
                </div>
                <p className="status-line">Any new dependency report must include package name, license, maintenance status, bundle impact, security considerations, free/paid status, and why it was chosen.</p>
              </section>
              <section className="admin-card redirect-manager-card">
                <p className="kicker">Redirect Manager</p>
                <h3>Deterministic /go routing</h3>
                <p className="status-line">All ads and external links should point to <code>/go</code>. OBS live detection always takes priority: when OBS is live, redirects are disabled and every visitor goes to the main live page.</p>
                <div className="redirect-controls">
                  <label>Clips4Sale split %<input type="number" min={0} max={100} value={redirectClipsPercent} disabled={!adminUnlocked} onChange={(event) => setRedirectClipsPercent(Math.max(0, Math.min(100, Number(event.target.value))))} /></label>
                  <label>Fansly split %<input type="number" value={100 - redirectClipsPercent} disabled /></label>
                  <label>Manual offline override<select value={redirectManualDestination} disabled={!adminUnlocked} onChange={(event) => setRedirectManualDestination(event.target.value)}><option value="automatic">Automatic split / blocks</option><option value="clips4sale">100% Clips4Sale</option><option value="fansly">100% Fansly</option></select></label>
                </div>
                <div className="redirect-rule-grid">
                  {redirectOfflineBlocks.map((block) => (
                    <div className="redirect-rule-row" key={block.id}>
                      <strong>{block.label}</strong>
                      <label>Start<input type="time" value={block.start} disabled={!adminUnlocked} onChange={(event) => updateRedirectBlock(block.id, { start: event.target.value })} /></label>
                      <label>End<input type="time" value={block.end} disabled={!adminUnlocked} onChange={(event) => updateRedirectBlock(block.id, { end: event.target.value })} /></label>
                      <label>Destination<select value={block.destination} disabled={!adminUnlocked} onChange={(event) => updateRedirectBlock(block.id, { destination: event.target.value as RedirectOfflineBlock["destination"] })}><option value="split">Use 60/40 split</option><option value="clips4sale">100% Clips4Sale</option><option value="fansly">100% Fansly</option></select></label>
                    </div>
                  ))}
                </div>
                <div className="redirect-env-box">
                  <span>Production env</span>
                  <code>REDIRECT_CLIPS_PERCENT={redirectClipsPercent}</code>
                  <code>REDIRECT_MANUAL_DESTINATION={redirectManualDestination === "automatic" ? "" : redirectManualDestination}</code>
                  <code>REDIRECT_OFFLINE_BLOCKS={redirectOfflineBlocksJson}</code>
                </div>
                <div className="notification-history">
                  {redirectLogPreview.map((item) => (
                    <span key={`${item.destination}-${item.createdAt}-${item.reason}`}>{item.destination}<strong>{item.reason} · {item.referrer} · {item.createdAt}</strong></span>
                  ))}
                </div>
                <button className="secondary" type="button" disabled={!adminUnlocked} onClick={saveRedirectSettings}>Save redirect settings</button>
                <p className="status-line">{redirectStatus}</p>
              </section>
              <section className="admin-card admin-auth-card">
                <p className="kicker">Admin Authentication</p>
                <h3>2FA policy</h3>
                <label className="check-row"><input type="checkbox" checked={adminRequireTwoFactor} disabled={!adminUnlocked} onChange={(event) => setAdminRequireTwoFactor(event.target.checked)} /> Require 2FA for all administrators</label>
                <label className="check-row"><input type="checkbox" checked={standardTwoFactorOptional} disabled={!adminUnlocked} onChange={(event) => setStandardTwoFactorOptional(event.target.checked)} /> Keep 2FA optional for standard users</label>
                <label>Trusted-device inactivity days<input type="number" min={1} max={180} value={trustedDeviceDays} disabled={!adminUnlocked} onChange={(event) => setTrustedDeviceDays(Number(event.target.value))} /></label>
                <div className="admin-stats">
                  <span>Supported now <strong>TOTP authenticator apps</strong></span>
                  <span>Recovery <strong>Recovery codes + password reset</strong></span>
                  <span>Future-ready <strong>Email codes · passkeys · hardware keys</strong></span>
                </div>
                <button className="secondary" type="button" disabled={!adminUnlocked} onClick={saveAdminAuthPolicy}>Save auth policy</button>
                <p className="status-line">{adminAuthStatus}</p>
              </section>
              <section className="admin-card">
                <p className="kicker">{t("creator.engagement")}</p>
                <h3>{t("creator.aiMessages")}</h3>
                <p>{t("creator.aiCopy")}</p>
              </section>
              <section className="admin-card support-agent-admin-card">
                <p className="kicker">AI Support Architecture</p>
                <h3>Three-layer support control</h3>
                <p>Layer 1 keeps visitor chat simple with Maya, Riley, Nova, and Sage. Layer 2 specialists stay hidden in ADMIN. Claude coordinates evidence, repairs, approvals, and final answers through the same visible agent.</p>
                <label>Admin support email<input value={supportAdminEmail} disabled={!adminUnlocked} onChange={(event) => setSupportAdminEmail(event.target.value)} /></label>
                <div className="support-layer-summary">
                  <span><strong>Layer 1</strong> Visitor visible</span>
                  <span><strong>Layer 2</strong> Hidden specialists</span>
                  <span><strong>Layer 3</strong> Claude coordinator</span>
                </div>
                <p className="kicker">Layer 1 · Visitor Support</p>
                <div className="agent-station-grid">
                  {visitorSupportAgents.map((agent) => (
                    <article className="agent-station" style={{ "--agent-color": agent.color } as CSSProperties} key={agent.id}>
                      <div className="agent-avatar">{agent.avatar}</div>
                      <div>
                        <strong>{agent.name}</strong>
                        <span>{agent.role}</span>
                      </div>
                      <small>Visibility: can communicate directly with visitors</small>
                      <small>Saying: {agent.saying}</small>
                      <small>Hours: {agent.hours}</small>
                      <small>Solves: {agent.capabilities}</small>
                      <small>Tools: {agent.tools}</small>
                      <small>Auto-response: {agent.autoResponse}</small>
                      <small>Escalation: {agent.escalation}</small>
                      <em>{supportAgentActivities[agent.id] || agent.status}</em>
                    </article>
                  ))}
                </div>
                <p className="kicker">Layer 2 · Hidden Specialists</p>
                <div className="agent-station-grid">
                  {hiddenSpecialistAgents.map((agent) => (
                    <article className="agent-station" style={{ "--agent-color": agent.color } as CSSProperties} key={agent.id}>
                      <div className="agent-avatar">{agent.avatar}</div>
                      <div>
                        <strong>{agent.name}</strong>
                        <span>{agent.role}</span>
                      </div>
                      <small>Visibility: ADMIN and Claude logs only</small>
                      <small>Saying: {agent.saying}</small>
                      <small>Hours: {agent.hours}</small>
                      <small>Solves: {agent.capabilities}</small>
                      <small>Tools: {agent.tools}</small>
                      <small>Report: problem, evidence, root cause, confidence, safe actions, result, risk, approval need</small>
                      <em>{supportAgentActivities[agent.id] || agent.status}</em>
                    </article>
                  ))}
                </div>
                <div className="support-layer-summary">
                  <span><strong>Billing</strong> Visitor → Riley → Claude → Ledger → Atlas if needed → Claude → Riley → Visitor</span>
                  <span><strong>Playback</strong> Visitor → Nova → Claude → Echo + Pixel → Atlas if server-related → Claude → Nova → Visitor</span>
                  <span><strong>Moderation</strong> Visitor → Sage → Claude → Atlas + Route if needed → Claude → Sage → Visitor</span>
                </div>
                <div className="support-escalation-log">
                  {supportEscalations.length ? supportEscalations.map((item) => (
                    <span key={`${item.agent}-${item.createdAt}`}>{item.agent}<strong>{item.issue} · {item.user} · {item.createdAt}</strong></span>
                  )) : <span>No support escalations yet. Maya will prepare an admin email payload when a visitor needs human review.</span>}
                </div>
                <button className="secondary" type="button" disabled={!adminUnlocked} onClick={() => setSupportEscalations((items) => [{ agent: "Maya", issue: "Support station daily check", user: cleanName(displayName) || "Admin", createdAt: new Date().toLocaleString() }, ...items].slice(0, 8))}>
                  Run support station check
                </button>
              </section>
              <section className="admin-card">
                <p className="kicker">{t("games.kicker")}</p>
                <h3>{t("creator.gameQa")}</h3>
                <p>{t("creator.gameQaCopy")}</p>
                <div className="notification-list compact">
                  {toddReports.map((item) => <p className="notification-item" key={item}>{item}</p>)}
                </div>
              </section>
              <section className="admin-card">
                <p className="kicker">{t("creator.moderation")}</p>
                <h3>{t("creator.sage")}</h3>
                <p>{t("creator.sageCopy")}</p>
                <div className="moderation-controls-grid">
                  <label>
                    Blocked words / phrases
                    <textarea rows={5} value={moderationRules} disabled={!adminUnlocked} onChange={(event) => setModerationRules(event.target.value)} />
                  </label>
                  <label>
                    Enforcement
                    <select value={moderationLevel} disabled={!adminUnlocked} onChange={(event) => setModerationLevel(event.target.value as "remove" | "temporary" | "permanent")}>
                      <option value="remove">Remove from site</option>
                      <option value="temporary">Temporary ban</option>
                      <option value="permanent">Permanent ban</option>
                    </select>
                  </label>
                  <label>
                    Ban duration
                    <select
                      value={moderationBanDuration}
                      disabled={!adminUnlocked}
                      onChange={(event) => {
                        setModerationBanDuration(event.target.value);
                        const hours = event.target.value === "null" ? null : Number(event.target.value);
                        setModerationPermanentBan(hours === null);
                        if (hours) setModerationBanHours(hours);
                      }}
                    >
                      {banDurationOptions.map((option) => (
                        <option value={String(option.hours)} key={option.label}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <label>Appeal status<input value={moderationAppealStatus} disabled={!adminUnlocked} onChange={(event) => setModerationAppealStatus(event.target.value)} /></label>
                  <label className="check-row"><input type="checkbox" checked={moderationPermanentBan} disabled={!adminUnlocked} onChange={(event) => setModerationPermanentBan(event.target.checked)} /> Permanent ban enabled</label>
                  <label>
                    Ban filter
                    <select value={moderationFilter} disabled={!adminUnlocked} onChange={(event) => setModerationFilter(event.target.value as "all" | "temporary" | "permanent")}>
                      <option value="all">All</option>
                      <option value="temporary">Temporary</option>
                      <option value="permanent">Permanent</option>
                    </select>
                  </label>
                </div>
                <div className="moderation-log-list">
                  {filteredModerationLogs.length ? filteredModerationLogs.slice(0, 8).map((item) => (
                    <div className="moderation-log-row" key={item.id}>
                      <strong>{item.reason}</strong>
                      <span>{item.displayName} · {item.permanent ? "Banned Indefinitely" : item.enforcement} · {item.appealStatus}</span>
                      <small>{item.permanent ? "Never Expires" : `Expires ${item.expiresAt ? new Date(item.expiresAt).toLocaleString() : "after session"}`} · {new Date(item.createdAt).toLocaleString()} · {item.deviceSignal.slice(0, 48)}</small>
                      {item.permanent ? <button className="secondary" type="button" disabled={!adminUnlocked} onClick={() => clearPermanentBan(item.id)}>Manual unban</button> : null}
                    </div>
                  )) : <p className="status-line">No moderation events match this filter.</p>}
                </div>
                <button className="secondary" type="button" disabled={!adminUnlocked || !moderationBlocked} onClick={() => clearPermanentBan()}>Clear current device ban</button>
              </section>
            </div>
            <section className="geo-dashboard" aria-label="Geo Dashboard">
              <div className="geo-header">
                <div>
                  <p className="kicker">Geo Dashboard</p>
                  <h3>Visitor intelligence</h3>
                  <p>Approximate location analytics only. Raw IP addresses stay server-side for security, fraud prevention, abuse review, and restricted investigations.</p>
                </div>
                <div className="geo-filter-row">
                  <label>
                    Date range
                    <select value={geoDateFilter} disabled={!adminUnlocked} onChange={(event) => setGeoDateFilter(event.target.value)}>
                      {geoDateFilters.map((item) => <option value={item} key={item}>{item}</option>)}
                    </select>
                  </label>
                  <label>
                    Traffic source
                    <select value={geoTrafficFilter} disabled={!adminUnlocked} onChange={(event) => setGeoTrafficFilter(event.target.value)}>
                      {geoTrafficSources.map((item) => <option value={item} key={item}>{item}</option>)}
                    </select>
                  </label>
                  <label>
                    Device type
                    <select value={geoDeviceFilter} disabled={!adminUnlocked} onChange={(event) => setGeoDeviceFilter(event.target.value)}>
                      {["All devices", "Mobile", "Desktop", "Tablet"].map((item) => <option value={item} key={item}>{item}</option>)}
                    </select>
                  </label>
                </div>
              </div>

              <div className="geo-metrics">
                <span>Active visitors <strong>{formatNumber(geoTotals.active, language)}</strong></span>
                <span>Unique visitors <strong>{formatNumber(geoTotals.unique, language)}</strong></span>
                <span>Returning visitors <strong>{formatNumber(geoTotals.returning, language)}</strong></span>
                <span>Historical visits <strong>{formatNumber(geoTotals.historical, language)}</strong></span>
              </div>

              <div className="geo-grid">
                <section className="geo-card">
                  <h4>Dynamic world clocks</h4>
                  <div className="world-clock-grid">
                    {worldClocks.map((item) => (
                      <div className="world-clock" key={item.countryCode}>
                        <span>{item.country}</span>
                        <strong>{item.clock.time}</strong>
                        <small>{item.timeZone} · {formatNumber(item.activeVisitors, language)} active · {item.clock.daylight ? "Daytime" : "Nighttime"}</small>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="geo-card">
                  <h4>Interactive world map</h4>
                  <div className="world-map" role="list">
                    {geoSummaries.map((country) => (
                      <button
                        className={country.countryCode === selectedGeoSummary.countryCode ? "is-selected" : ""}
                        key={country.countryCode}
                        type="button"
                        disabled={!adminUnlocked}
                        onClick={() => setGeoSelectedCountry(country.countryCode)}
                      >
                        <span>{country.countryCode}</span>
                        <strong>{country.country}</strong>
                        <small>{formatNumber(country.activeVisitors, language)} active</small>
                      </button>
                    ))}
                  </div>
                </section>
              </div>

              <div className="geo-grid">
                <section className="geo-card country-detail">
                  <h4>{selectedGeoSummary.country} analytics</h4>
                  <div className="geo-detail-grid">
                    <span>Active sessions <strong>{formatNumber(selectedGeoSummary.activeVisitors, language)}</strong></span>
                    <span>Total visits <strong>{formatNumber(selectedGeoSummary.historicalVisits, language)}</strong></span>
                    <span>Average session <strong>{formatTimer(selectedGeoSummary.averageSessionSeconds)}</strong></span>
                    <span>Pages viewed <strong>{formatNumber(selectedGeoSummary.pagesViewed, language)}</strong></span>
                    <span>Language <strong>{selectedGeoSummary.languagePreference}</strong></span>
                    <span>Top referral <strong>{selectedGeoSummary.topReferral}</strong></span>
                    <span>Device breakdown <strong>{Object.entries(selectedGeoSummary.deviceBreakdown).map(([key, value]) => `${key} ${value}`).join(" · ")}</strong></span>
                    <span>Browser usage <strong>{Object.entries(selectedGeoSummary.browserUsage).map(([key, value]) => `${key} ${value}`).join(" · ")}</strong></span>
                    <span>Conversions <strong>{selectedGeoSummary.conversions.registrations} regs · {selectedGeoSummary.conversions.deposits} deposits · {selectedGeoSummary.conversions.purchases} purchases · {selectedGeoSummary.conversions.tips} tips</strong></span>
                  </div>
                </section>

                <section className="geo-card">
                  <h4>Geographic reports</h4>
                  <div className="geo-report-list">
                    {geoReportCadence.map((cadence) => (
                      <span key={cadence}>
                        {cadence}
                        <strong>{selectedGeoSummary.country}: peak activity around local live-window overlap, {selectedGeoSummary.conversions.tips} tip conversions, {selectedGeoSummary.topReferral} leading source.</strong>
                      </span>
                    ))}
                  </div>
                  <p className="status-line">Reports are prepared for daily, weekly, and monthly email/export jobs once backend scheduling is connected.</p>
                </section>
              </div>

              <section className="geo-card">
                <h4>Active visitors</h4>
                <div className="active-visitor-table">
                  <div className="active-visitor-head">
                    <span>Location</span>
                    <span>Session</span>
                    <span>Page</span>
                    <span>Source</span>
                    <span>Language</span>
                    <span>Device</span>
                    <span>Status</span>
                  </div>
                  {activeGeoVisitors.map((visitor) => (
                    <div className="active-visitor-row" key={visitor.id}>
                      <span>{visitor.city}, {visitor.region}, {visitor.country}</span>
                      <span>{formatTimer(visitor.sessionSeconds)}</span>
                      <span>{visitor.currentPage}</span>
                      <span>{visitor.referralSource}</span>
                      <span>{visitor.language} · {visitor.timeZone}</span>
                      <span>{visitor.deviceType} · {visitor.browser} · {visitor.operatingSystem}</span>
                      <span>{visitor.returning ? "Returning" : "New"}</span>
                    </div>
                  ))}
                </div>
                <p className="status-line">Restricted security view can use encrypted IP metadata and access-control checks. Raw IPs are not displayed here by default.</p>
              </section>
            </section>
            <section className="referral-dashboard" aria-label="Referring Websites">
              <div className="geo-header">
                <div>
                  <p className="kicker">Referring Websites</p>
                  <h3>Traffic source analytics</h3>
                  <p>Automatically classifies referrers from campaign links, browser referral headers, and tracking parameters. Missing referral data becomes Direct Traffic.</p>
                </div>
                <div className="geo-filter-row">
                  <label>
                    Date range
                    <select value={referralDateFilter} disabled={!adminUnlocked} onChange={(event) => setReferralDateFilter(event.target.value)}>
                      {referralDateFilters.map((item) => <option value={item} key={item}>{item}</option>)}
                    </select>
                  </label>
                  <label>
                    Source type
                    <select value={referralSourceFilter} disabled={!adminUnlocked} onChange={(event) => setReferralSourceFilter(event.target.value)}>
                      {referralSourceTypes.map((item) => <option value={item} key={item}>{item}</option>)}
                    </select>
                  </label>
                  <label>
                    Conversion
                    <select value={referralConversionFilter} disabled={!adminUnlocked} onChange={(event) => setReferralConversionFilter(event.target.value)}>
                      {referralConversionFilters.map((item) => <option value={item} key={item}>{item}</option>)}
                    </select>
                  </label>
                </div>
              </div>

              <div className="geo-metrics">
                <span>Total visitors <strong>{formatNumber(referralTotals.visitors, language)}</strong></span>
                <span>Unique visitors <strong>{formatNumber(referralTotals.uniqueVisitors, language)}</strong></span>
                <span>Clicks <strong>{formatNumber(referralTotals.clicks, language)}</strong></span>
                <span>Conversions <strong>{formatNumber(referralTotals.conversions, language)}</strong></span>
              </div>

              <div className="geo-grid">
                <section className="geo-card">
                  <h4>Referral trends</h4>
                  <div className="referral-trend-chart">
                    {selectedReferral.trend.map((value, index) => (
                      <span key={`${selectedReferral.source}-${index}`} style={{ height: `${Math.max(12, (value / maxReferralTrend) * 100)}%` }}>
                        <strong>{formatNumber(value, language)}</strong>
                        <i>{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][index]}</i>
                      </span>
                    ))}
                  </div>
                </section>

                <section className="geo-card">
                  <h4>Source detail</h4>
                  <div className="geo-detail-grid">
                    <span>Source <strong>{selectedReferral.source}</strong></span>
                    <span>Referral URL <strong>{selectedReferral.referrerUrl || "No referrer available"}</strong></span>
                    <span>Landing page <strong>{selectedReferral.landingPage}</strong></span>
                    <span>Average session <strong>{formatTimer(selectedReferral.averageSessionSeconds)}</strong></span>
                    <span>Bounce rate <strong>{selectedReferral.bounceRate}%</strong></span>
                    <span>Conversion actions <strong>{selectedReferral.conversions.tips} tips · {selectedReferral.conversions.registrations} regs · {selectedReferral.conversions.purchases} purchases</strong></span>
                  </div>
                </section>
              </div>

              <section className="geo-card">
                <h4>Sources</h4>
                <div className="referral-source-table">
                  <div className="referral-source-head">
                    <span>Source</span>
                    <span>Visitors</span>
                    <span>Unique</span>
                    <span>Clicks</span>
                    <span>Conversions</span>
                    <span>Traffic %</span>
                  </div>
                  {referralSummaries.map((item) => (
                    <button
                      className={`referral-source-row ${item.source === selectedReferral.source ? "is-selected" : ""}`}
                      key={item.source}
                      type="button"
                      disabled={!adminUnlocked}
                      onClick={() => setReferralSelectedSource(item.source)}
                    >
                      <span>{item.source}</span>
                      <span>{formatNumber(item.visitors, language)}</span>
                      <span>{formatNumber(item.uniqueVisitors, language)}</span>
                      <span>{formatNumber(item.clicks, language)}</span>
                      <span>{formatNumber(item.totalConversions, language)}</span>
                      <span>{item.trafficPercent}%</span>
                    </button>
                  ))}
                </div>
                <p className="status-line">Provider adapters can be added later for JuicyAds, social platforms, search analytics, or privacy-safe server analytics without rebuilding the dashboard.</p>
              </section>
            </section>
            <section className="security-dashboard" aria-label="Admin Security Dashboard">
              <div className="geo-header">
                <div>
                  <p className="kicker">Security Dashboard</p>
                  <h3>Edge protection and abuse control</h3>
                  <p>Every request should pass middleware checks before app logic, auth, streaming, payments, APIs, or database access. Cloudflare/CDN filtering is the first shield before the server.</p>
                </div>
                <div className="geo-filter-row">
                  <label>IP / country / agent<input value={securityRuleValue} disabled={!adminUnlocked} onChange={(event) => setSecurityRuleValue(event.target.value)} placeholder="203.0.113.42, US, badbot" /></label>
                  <label>Rule type<select value={securityRuleType} disabled={!adminUnlocked} onChange={(event) => setSecurityRuleType(event.target.value)}><option>IP whitelist</option><option>IP blacklist</option><option>Country blacklist</option><option>User agent blacklist</option></select></label>
                  <button className="secondary" type="button" disabled={!adminUnlocked} onClick={addSecurityRule}>Add security rule</button>
                </div>
              </div>

              <div className="geo-metrics">
                <span>Active visitors <strong>{formatNumber(geoTotals.active, language)}</strong></span>
                <span>Blocked IPs <strong>{formatNumber(securitySummary.blocked, language)}</strong></span>
                <span>Suspicious requests <strong>{formatNumber(securitySummary.throttled, language)}</strong></span>
                <span>Average abuse score <strong>{formatNumber(securitySummary.averageScore, language)}</strong></span>
              </div>

              <div className="geo-grid">
                <section className="geo-card">
                  <h4>Request rates</h4>
                  <div className="referral-trend-chart">
                    {securityEvents.map((event) => (
                      <span key={`${event.ipAddress}-${event.endpoint}`} style={{ height: `${Math.max(12, (event.requestRate / securitySummary.maxRate) * 100)}%` }}>
                        <strong>{formatNumber(event.requestRate, language)}</strong>
                        <i>{event.country}</i>
                      </span>
                    ))}
                  </div>
                </section>

                <section className="geo-card">
                  <h4>Server health</h4>
                  <div className="geo-detail-grid">
                    <span>CDN provider <strong>Cloudflare-ready</strong></span>
                    <span>DDoS shield <strong>Edge provider required</strong></span>
                    <span>Middleware <strong>Rate limit · bot detection · validation</strong></span>
                    <span>Temporary blocks <strong>15 min default</strong></span>
                    <span>Admin alerts <strong>Traffic spikes and attack attempts</strong></span>
                    <span>Server health <strong>{securitySummary.blocked >= 2 ? "Elevated risk" : "Stable"}</strong></span>
                  </div>
                </section>
              </div>

              <div className="geo-grid">
                <section className="geo-card">
                  <h4>Blocked and suspicious requests</h4>
                  <div className="security-event-table">
                    <div className="security-event-head">
                      <span>IP</span><span>Country</span><span>Browser</span><span>Endpoint</span><span>Reason</span><span>Action</span><span>Score</span><span>Time</span>
                    </div>
                    {securityEvents.map((event) => (
                      <div className="security-event-row" key={`${event.ipAddress}-${event.createdAt}`}>
                        <span>{event.ipAddress}</span>
                        <span>{event.country}</span>
                        <span>{event.browser}</span>
                        <span>{event.endpoint}</span>
                        <span>{event.reason}</span>
                        <span>{event.action}</span>
                        <span>{event.score}</span>
                        <span>{event.createdAt}</span>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="geo-card">
                  <h4>Manual rules</h4>
                  <div className="security-rule-list">
                    {securityRules.map((rule) => (
                      <span key={`${rule.type}-${rule.value}`}>{rule.type}<strong>{rule.value}</strong><em>{rule.reason}</em></span>
                    ))}
                  </div>
                </section>
              </div>
              <p className="status-line">{securityStatus}</p>
            </section>
            <div className="provider-grid">
              <label>
                Mux playback ID
                <input
                  value={videoConfig.muxPlaybackId}
                  onChange={(event) => updateVideoConfig({ muxPlaybackId: event.target.value })}
                  disabled={!adminUnlocked}
                  placeholder="Mux playback id"
                />
              </label>
              <label>
                Bunny library ID
                <input
                  value={videoConfig.bunnyLibraryId}
                  onChange={(event) => updateVideoConfig({ bunnyLibraryId: event.target.value })}
                  disabled={!adminUnlocked}
                  placeholder="Bunny library id"
                />
              </label>
              <label>
                Bunny video ID
                <input
                  value={videoConfig.bunnyVideoId}
                  onChange={(event) => updateVideoConfig({ bunnyVideoId: event.target.value })}
                  disabled={!adminUnlocked}
                  placeholder="Bunny video id"
                />
              </label>
              <label>
                Bunny hostname
                <input
                  value={videoConfig.bunnyHostname}
                  onChange={(event) => updateVideoConfig({ bunnyHostname: event.target.value })}
                  disabled={!adminUnlocked}
                  placeholder="iframe.mediadelivery.net"
                />
              </label>
              <label>
                Cloudflare subdomain
                <input
                  value={videoConfig.cloudflareCustomerSubdomain}
                  onChange={(event) => updateVideoConfig({ cloudflareCustomerSubdomain: event.target.value })}
                  disabled={!adminUnlocked}
                  placeholder="customer-subdomain"
                />
              </label>
              <label>
                Cloudflare video ID
                <input
                  value={videoConfig.cloudflareVideoId}
                  onChange={(event) => updateVideoConfig({ cloudflareVideoId: event.target.value })}
                  disabled={!adminUnlocked}
                  placeholder="video id"
                />
              </label>
              <label className="wide-field">
                Fallback HLS/MP4 URL
                <input
                  value={videoConfig.fallbackUrl}
                  onChange={(event) => updateVideoConfig({ fallbackUrl: event.target.value })}
                  disabled={!adminUnlocked}
                  placeholder="https://..."
                />
              </label>
            </div>
            <div className="creator-actions">
              <button className="primary" type="button" onClick={saveVideoProviderSettings}>
                {t("creator.saveVideo")}
              </button>
            </div>
            <section className="admin-game-manager">
              <div className="section-heading">
                <p className="kicker">{t("creator.gameControl")}</p>
                <h3>{t("creator.manageGames")}</h3>
              </div>
              <div className="game-admin-grid">
                <div className="admin-game-list">
                  {[...games].sort((a, b) => a.order - b.order).map((game) => (
                    <div className="admin-game-row" key={game.id}>
                      <label>
                        <input
                          type="checkbox"
                          checked={game.enabled}
                          disabled={!adminUnlocked}
                          onChange={(event) => updateGame(game.id, { enabled: event.target.checked })}
                        />
                        <span>{game.title}</span>
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={Boolean(game.hidden)}
                          disabled={!adminUnlocked}
                          onChange={(event) => updateGame(game.id, { hidden: event.target.checked })}
                        />
                        Hide
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={Boolean(game.featured)}
                          disabled={!adminUnlocked}
                          onChange={(event) => updateGame(game.id, { featured: event.target.checked })}
                        />
                        Feature
                      </label>
                      <select
                        value={game.kind}
                        disabled={!adminUnlocked}
                        onChange={(event) => updateGame(game.id, { kind: event.target.value as GameItem["kind"] })}
                      >
                        <option value="space">Space</option>
                        <option value="pacman">Pac-Mask</option>
                        <option value="slither">MASKED UP</option>
                      </select>
                      <select
                        value={game.category || "Arcade"}
                        disabled={!adminUnlocked}
                        onChange={(event) => updateGame(game.id, { category: event.target.value })}
                      >
                        <option value="Arcade">Arcade</option>
                        <option value="Puzzle">Puzzle</option>
                        <option value="Reaction">Reaction</option>
                        <option value="Strategy">Strategy</option>
                        <option value="Seasonal">Seasonal</option>
                        <option value="Experimental">Experimental</option>
                      </select>
                      <select
                        value={game.difficulty || "Medium"}
                        disabled={!adminUnlocked}
                        onChange={(event) => updateGame(game.id, { difficulty: event.target.value })}
                      >
                        <option value="Easy">Easy</option>
                        <option value="Medium">Medium</option>
                        <option value="Hard">Hard</option>
                        <option value="Expert">Expert</option>
                      </select>
                      <button className="secondary" type="button" disabled={!adminUnlocked} onClick={() => moveGame(game.id, -1)}>{t("creator.up")}</button>
                      <button className="secondary" type="button" disabled={!adminUnlocked} onClick={() => moveGame(game.id, 1)}>{t("creator.down")}</button>
                      <button className="secondary" type="button" disabled={!adminUnlocked} onClick={() => removeGame(game.id)}>{t("creator.remove")}</button>
                    </div>
                  ))}
                </div>
                <div className="admin-card compact-card">
                  <h3>{t("creator.leaderboardAnalytics")}</h3>
                  <span>{t("creator.totalPlays")} <strong>{formatNumber(gameAnalytics.totalPlays, language)}</strong></span>
                  <span>{t("creator.averageSession")} <strong>{formatNumber(gameAnalytics.averageSeconds, language)}s</strong></span>
                  <span>{t("creator.mostPlayed")} <strong>{gameAnalytics.mostPlayed}</strong></span>
                  <span>{t("creator.topScore")} <strong>{formatNumber(Math.max(0, ...scoreEntries.map((entry) => entry.score)), language)}</strong></span>
                </div>
                <div className="admin-card compact-card">
                  <h3>{t("creator.addGameShell")}</h3>
                  <label>
                    {t("creator.gameName")}
                    <input value={newGameTitle} disabled={!adminUnlocked} onChange={(event) => setNewGameTitle(event.target.value)} placeholder="New arcade game" />
                  </label>
                  <button className="primary" type="button" disabled={!adminUnlocked} onClick={addGame}>{t("creator.addGame")}</button>
                </div>
              </div>
            </section>
            <a className="secondary admin-link-button" href="/admin/tips">Open protected Payments · Tip Menu controls</a>
          </div>
        </section> : null}
      </main>
      <section className="legal-policy-grid" aria-label="Legal policies">
        <details id="terms">
          <summary>{t("footer.terms")}</summary>
          <p>XMASKEDFREAKS.COM is available only to adults who may lawfully view adult entertainment. Users may not copy, record, redistribute, scrape, resell, harass, interfere with security, bypass payment controls, or use the platform unlawfully.</p>
        </details>
        <details id="privacy">
          <summary>{t("footer.privacy")}</summary>
          <p>The platform may process account details, preferences, session signals, wallet activity, payment references, and security logs to operate access, payments, fraud prevention, support, and analytics. Raw payment card data and CVV must be handled only by approved processors.</p>
        </details>
        <details id="dmca">
          <summary>{t("footer.dmca")}</summary>
          <p>Copyright owners may submit a notice identifying the protected work, the allegedly infringing material, contact details, a good-faith statement, and an accuracy statement under penalty of perjury. Valid notices are reviewed under applicable law.</p>
        </details>
        <details id="refund">
          <summary>{t("footer.refund")}</summary>
          <p>{t("legal.refundBody")}</p>
        </details>
      </section>
      <footer className="legal-footer">
        <a href="#terms">{t("footer.terms")}</a>
        <a href="#privacy">{t("footer.privacy")}</a>
        <a href="#dmca">{t("footer.dmca")}</a>
        <a href="#refund">{t("footer.refund")}</a>
        <label className="footer-language">
          {t("footer.language")}
          <select value={language} onChange={(event) => chooseLanguage(event.target.value)}>
            {languageOptions.map((option) => (
              <option value={option.code} key={option.code}>{formatLanguageLabel(option.nativeName, option.name)}</option>
            ))}
          </select>
        </label>
        <label className="footer-language">
          {t("footer.timeZone")}
          <select value={timeZone} onChange={(event) => chooseTimeZone(event.target.value)}>
            {commonTimeZones.map((zone) => (
              <option value={zone} key={zone}>{zone.replace("_", " ")}</option>
            ))}
          </select>
        </label>
      </footer>
      </div>
    </>
  );
}
