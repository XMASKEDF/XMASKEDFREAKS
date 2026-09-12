import { DEFAULT_TIP_OPTIONS, type TipOption } from "./tips.ts";

export type TipItem = TipOption;

export type ClipItem = {
  title: string;
  duration: string;
  poster: string;
  url: string;
};

export type VideoProvider = "mux" | "bunny" | "cloudflare";

export type VideoProviderConfig = {
  provider: VideoProvider;
  muxPlaybackId: string;
  bunnyLibraryId: string;
  bunnyVideoId: string;
  bunnyHostname: string;
  cloudflareCustomerSubdomain: string;
  cloudflareVideoId: string;
  fallbackUrl: string;
};

export type GameItem = {
  id: string;
  slug: string;
  title: string;
  kind: "space" | "pacman" | "slither";
  category?: "Arcade" | "Puzzle" | "Reaction" | "Strategy" | "Seasonal" | "Experimental" | string;
  description?: string;
  difficulty?: "Easy" | "Medium" | "Hard" | "Expert" | string;
  thumbnail?: string;
  thumbnailRegion?: "top" | "middle" | "bottom";
  thumbnailAlt: string;
  thumbnailWidth?: number;
  thumbnailHeight?: number;
  thumbnailMimeType?: string;
  thumbnailFileSize?: number;
  thumbnailUpdatedAt?: string;
  thumbnailUpdatedBy?: string;
  featured?: boolean;
  hidden?: boolean;
  enabled: boolean;
  order: number;
};

export type CostProvider = {
  category: string;
  provider: string;
  fixedMonthly: number;
  usageMonthly: number;
  usagePercent: number;
  freeRemaining: string;
  feature: string;
};

export type RedirectOfflineBlock = {
  id: string;
  label: string;
  start: string;
  end: string;
  destination: "split" | "clips4sale" | "fansly";
};

export function applyViewRule(realViewerCount: number, multiplier: number) {
  return Math.max(0, Math.floor(realViewerCount)) * Math.max(1, Math.floor(multiplier));
}

export type CoinPackage = {
  id: string;
  name: string;
  label: string;
  description: string;
  amount: number;
  baseCoins: number;
  bonusCoins: number;
  bonusPercent: number;
  badge: string;
  highlighted: boolean;
  enabled: boolean;
  order: number;
};

export const defaultTips: TipItem[] = DEFAULT_TIP_OPTIONS;

export const defaultClips: ClipItem[] = [
  { title: "Masked Preview 01", duration: "08:44", poster: "/assets/preview-01.svg", url: "https://www.clips4sale.com/studio/444327/xmaskedfreaks" },
  { title: "Masked Preview 02", duration: "10:12", poster: "/assets/preview-02.svg", url: "https://www.clips4sale.com/studio/444327/xmaskedfreaks" },
  { title: "Masked Preview 03", duration: "06:35", poster: "/assets/preview-03.svg", url: "https://www.clips4sale.com/studio/444327/xmaskedfreaks" },
  { title: "Masked Preview 04", duration: "12:09", poster: "/assets/preview-04.svg", url: "https://www.clips4sale.com/studio/444327/xmaskedfreaks" },
  { title: "Masked Preview 05", duration: "09:18", poster: "/assets/preview-01.svg", url: "https://www.clips4sale.com/studio/444327/xmaskedfreaks" },
  { title: "Masked Preview 06", duration: "11:27", poster: "/assets/preview-02.svg", url: "https://www.clips4sale.com/studio/444327/xmaskedfreaks" }
];

export const defaultGames: GameItem[] = [
  {
    id: "space-sweep",
    slug: "space-invader-sweep",
    title: "MASK INVADERS",
    kind: "space",
    category: "Arcade",
    difficulty: "Medium",
    thumbnail: "/games/thumbnails/xmaskedfreaks-game-library.png",
    thumbnailRegion: "top",
    thumbnailAlt: "Neon spacecraft battling an alien wave in deep space.",
    description: "Pilot a neon ship, defend your shields, and clear waves before they reach the floor.",
    featured: false,
    hidden: false,
    enabled: true,
    order: 1
  },
  {
    id: "pac-mask",
    slug: "pac-mask-chase",
    title: "Pac-Mask Chase",
    kind: "pacman",
    category: "Arcade",
    difficulty: "Medium",
    thumbnail: "/games/thumbnails/xmaskedfreaks-game-library.png",
    thumbnailRegion: "middle",
    thumbnailAlt: "Masked arcade character navigating a glowing neon maze.",
    description: "Move through a compact neon maze, collect energy dots, and survive the chase.",
    featured: false,
    hidden: false,
    enabled: true,
    order: 2
  },
  {
    id: "slither",
    slug: "slither",
    title: "MASKED UP",
    kind: "slither",
    category: "Arcade",
    difficulty: "Hard",
    thumbnail: "/games/thumbnails/xmaskedfreaks-game-library.png",
    thumbnailRegion: "bottom",
    thumbnailAlt: "Glowing green serpent moving through a dark energy arena.",
    description: "SLIME THEM OUT. Consume energy orbs, avoid rival creatures, and become the longest in the arena.",
    featured: true,
    hidden: false,
    enabled: true,
    order: 3
  }
];

export const defaultCostProviders: CostProvider[] = [
  { category: "Website hosting", provider: "Vercel / hosting", fixedMonthly: 35, usageMonthly: 18, usagePercent: 42, freeRemaining: "58% bandwidth", feature: "Hosting" },
  { category: "Video streaming bandwidth", provider: "Mux / Bunny / Cloudflare", fixedMonthly: 60, usageMonthly: 340, usagePercent: 76, freeRemaining: "24% transfer", feature: "Streaming" },
  { category: "Database usage", provider: "Supabase Postgres", fixedMonthly: 25, usageMonthly: 44, usagePercent: 63, freeRemaining: "37% rows/API", feature: "Database" },
  { category: "File storage", provider: "Supabase Storage / CDN", fixedMonthly: 10, usageMonthly: 29, usagePercent: 58, freeRemaining: "42% storage", feature: "Storage" },
  { category: "AI API usage", provider: "OpenAI support assistants", fixedMonthly: 0, usageMonthly: 86, usagePercent: 69, freeRemaining: "31% budget", feature: "AI" },
  { category: "Email delivery", provider: "Resend / SendGrid", fixedMonthly: 20, usageMonthly: 16, usagePercent: 35, freeRemaining: "65% sends", feature: "Email" },
  { category: "Analytics services", provider: "Plausible / PostHog", fixedMonthly: 29, usageMonthly: 12, usagePercent: 44, freeRemaining: "56% events", feature: "Analytics" },
  { category: "Security services", provider: "Cloudflare WAF / bot checks", fixedMonthly: 25, usageMonthly: 22, usagePercent: 51, freeRemaining: "49% rules/events", feature: "Security" },
  { category: "Payment processing fees", provider: "Processor fees", fixedMonthly: 0, usageMonthly: 74, usagePercent: 48, freeRemaining: "No free tier", feature: "Payments" }
];

export const defaultRedirectOfflineBlocks: RedirectOfflineBlock[] = [
  { id: "morning-offline", label: "Morning offline", start: "00:00", end: "08:00", destination: "split" },
  { id: "midday-offline", label: "Midday offline", start: "11:00", end: "13:00", destination: "split" },
  { id: "evening-offline", label: "Evening offline", start: "16:00", end: "22:00", destination: "split" }
];

export const defaultCoinPackages: CoinPackage[] = [
  { id: "starter-5", name: "Starter", label: "$5 Starter", description: "Simple top-up", amount: 5, baseCoins: 10, bonusCoins: 0, bonusPercent: 0, badge: "", highlighted: false, enabled: true, order: 1 },
  { id: "quick-10", name: "Quick Refill", label: "$10 Quick Refill", description: "Quick refill", amount: 10, baseCoins: 20, bonusCoins: 0, bonusPercent: 0, badge: "", highlighted: false, enabled: true, order: 2 },
  { id: "hourly-16", name: "Hourly Credit", label: "$16 Hourly Credit", description: "One current hourly-credit unit", amount: 16, baseCoins: 32, bonusCoins: 0, bonusPercent: 0, badge: "", highlighted: false, enabled: true, order: 3 },
  { id: "refill-25", name: "Wallet Refill", label: "$25 Wallet Refill", description: "Larger wallet refill", amount: 25, baseCoins: 50, bonusCoins: 0, bonusPercent: 0, badge: "", highlighted: false, enabled: true, order: 4 },
  { id: "bundle-50", name: "Bundle", label: "$50 Bundle", description: "Base value bundle", amount: 50, baseCoins: 100, bonusCoins: 0, bonusPercent: 0, badge: "Popular", highlighted: false, enabled: true, order: 5 },
  { id: "bundle-100", name: "Best Value", label: "$100 Best Value", description: "Strongest six-slot bundle", amount: 100, baseCoins: 200, bonusCoins: 0, bonusPercent: 0, badge: "Best Value", highlighted: true, enabled: true, order: 6 }
];

export type CoinPackageQuote = {
  id: string;
  name: string;
  label: string;
  amount: number;
  amountCents: number;
  baseCoins: number;
  bonusCoins: number;
  totalCoins: number;
  bonusPercent: number;
};

export function quoteCoinPackage(item: CoinPackage): CoinPackageQuote {
  return {
    id: item.id,
    name: item.name,
    label: item.label,
    amount: item.amount,
    amountCents: Math.round(item.amount * 100),
    baseCoins: item.baseCoins,
    bonusCoins: item.bonusCoins,
    totalCoins: item.baseCoins + item.bonusCoins,
    bonusPercent: item.bonusPercent
  };
}

export function getCoinPackage(packageId: string) {
  return defaultCoinPackages.find((item) => item.id === packageId && item.enabled) || null;
}

export const appConfig = {
  siteName: "XMASKEDFREAKS.COM",
  streamTitle: "XMASKEDFREAKS TV TIPS ARE WELCOMED",
  coinValue: 0.5,
  viewerMultiplier: 10,
  firstLimitMinutes: 25,
  returnLimitMinutes: 25,
  tipProtectionThreshold: 2,
  accessWindowMinutes: 25,
  minimumAccessPayment: 5,
  minimumAccessCoins: 10,
  contributionReminderSeconds: 16,
  contributionReminderAtMinutes: 20,
  contributionGraceSeconds: 120,
  contributionLargeTipCoins: 20,
  checkoutTimerSeconds: 64,
  accessBlurStrength: 16,
  unlockDurationMinutes: 25,
  redirectClipsPercent: 60,
  redirectFanslyPercent: 40,
  clipsRedirectUrl: "https://www.clips4sale.com/studio/444327/xmaskedfreaks",
  fanslyRedirectUrl: "https://fansly.com/1SexualTension",
  accessRetryLimit: 1,
  accessControlNotice: "Requires authenticated ADMIN role, two-factor authentication, and optional secondary PIN confirmation.",
  retipWindowMinutes: 32,
  retentionCheckMinutes: 46,
  dailyGoal: 500,
  ownerCode: "MASKED-OWNER",
  depositEmail: "ustension@gmail.com",
  costMonthlyBudget: 1200,
  costWarningThreshold: 80,
  redirectClipsSplitPercent: 60,
  redirectFanslySplitPercent: 40,
  redirectManualDestination: "automatic",
  walletMaxPurchase: 1000
};

export const defaultVideoProviderConfig: VideoProviderConfig = {
  provider: "mux",
  muxPlaybackId: "",
  bunnyLibraryId: "",
  bunnyVideoId: "",
  bunnyHostname: "iframe.mediadelivery.net",
  cloudflareCustomerSubdomain: "",
  cloudflareVideoId: "",
  fallbackUrl: ""
};

export function resolveVideoSource(config: VideoProviderConfig) {
  if (config.provider === "mux" && config.muxPlaybackId) {
    return `https://stream.mux.com/${config.muxPlaybackId}.m3u8`;
  }

  if (config.provider === "bunny" && config.bunnyLibraryId && config.bunnyVideoId) {
    return `https://${config.bunnyHostname}/${config.bunnyLibraryId}/${config.bunnyVideoId}/playlist.m3u8`;
  }

  if (config.provider === "cloudflare" && config.cloudflareCustomerSubdomain && config.cloudflareVideoId) {
    return `https://${config.cloudflareCustomerSubdomain}.cloudflarestream.com/${config.cloudflareVideoId}/manifest/video.m3u8`;
  }

  return config.fallbackUrl;
}

export function getProviderLabel(provider: VideoProvider) {
  const labels: Record<VideoProvider, string> = {
    mux: "Mux",
    bunny: "Bunny Stream",
    cloudflare: "Cloudflare Stream"
  };

  return labels[provider];
}
