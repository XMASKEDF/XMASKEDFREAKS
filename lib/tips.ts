export type TipOption = {
  id: string;
  emoji: string;
  phrase: string;
  tokenCost: number;
  enabled: boolean;
  displayOrder: number;
  featured: boolean;
  temporaryAvailable: boolean;
  liveOnly: boolean;
  alertStyle: string;
  soundStyle: string;
  mediaId?: string | null;
  artworkUrl?: string;
};

export function tipPhraseKey(id: string) {
  return `tipMenu.option.${id}`;
}

export type TipMenuSettings = {
  lowBalanceThreshold: number;
  customTipsEnabled: boolean;
  minimumCustomTokens: number;
  maximumCustomTokens: number;
  refillEntryPoint: string;
  requireConfirmation: boolean;
};

export const DEFAULT_TIP_MENU_SETTINGS: TipMenuSettings = {
  lowBalanceThreshold: 20,
  customTipsEnabled: true,
  minimumCustomTokens: 1,
  maximumCustomTokens: 1000,
  refillEntryPoint: "#coin-packages",
  requireConfirmation: false
};

export function normalizeTipMenuSettings(value: unknown): TipMenuSettings {
  const candidate = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    lowBalanceThreshold: Math.max(0, Math.floor(Number(candidate.lowBalanceThreshold ?? candidate.low_balance_threshold ?? DEFAULT_TIP_MENU_SETTINGS.lowBalanceThreshold))),
    customTipsEnabled: candidate.customTipsEnabled !== undefined ? candidate.customTipsEnabled === true : candidate.custom_tips_enabled !== false,
    minimumCustomTokens: Math.max(1, Math.min(1000, Math.floor(Number(candidate.minimumCustomTokens ?? candidate.minimum_custom_tokens ?? DEFAULT_TIP_MENU_SETTINGS.minimumCustomTokens)))),
    maximumCustomTokens: Math.max(1, Math.min(1000, Math.floor(Number(candidate.maximumCustomTokens ?? candidate.maximum_custom_tokens ?? DEFAULT_TIP_MENU_SETTINGS.maximumCustomTokens)))),
    refillEntryPoint: String(candidate.refillEntryPoint ?? candidate.refill_entry_point ?? DEFAULT_TIP_MENU_SETTINGS.refillEntryPoint).slice(0, 160),
    requireConfirmation: candidate.requireConfirmation !== undefined ? candidate.requireConfirmation === true : candidate.require_confirmation === true
  };
}

export const DEFAULT_TIP_OPTIONS: TipOption[] = [
  { id: "great-show", emoji: "😩", phrase: "Great Show", tokenCost: 8, enabled: true, displayOrder: 1, featured: false, temporaryAvailable: true, liveOnly: true, alertStyle: "glow", soundStyle: "ching" },
  { id: "need-more", emoji: "💦", phrase: "I Need More", tokenCost: 10, enabled: true, displayOrder: 2, featured: false, temporaryAvailable: true, liveOnly: true, alertStyle: "glow", soundStyle: "ching" },
  { id: "im-watching", emoji: "👀", phrase: "I’m Watching", tokenCost: 4, enabled: true, displayOrder: 10, featured: false, temporaryAvailable: true, liveOnly: true, alertStyle: "glow", soundStyle: "ching" },
  { id: "that-was-hot", emoji: "🔥", phrase: "That Was Hot", tokenCost: 6, enabled: true, displayOrder: 11, featured: false, temporaryAvailable: true, liveOnly: true, alertStyle: "glow", soundStyle: "ching" },
  { id: "keep-going", emoji: "😏", phrase: "Keep Going", tokenCost: 12, enabled: true, displayOrder: 12, featured: false, temporaryAvailable: true, liveOnly: true, alertStyle: "glow", soundStyle: "ching" },
  { id: "dont-stop", emoji: "🫦", phrase: "Don’t Stop", tokenCost: 16, enabled: true, displayOrder: 13, featured: false, temporaryAvailable: true, liveOnly: true, alertStyle: "glow", soundStyle: "ching" },
  { id: "okayyy-i-see-yall", emoji: "🥵", phrase: "Okayyy I See Y’all", tokenCost: 24, enabled: true, displayOrder: 14, featured: false, temporaryAvailable: true, liveOnly: true, alertStyle: "glow", soundStyle: "ching" },
  { id: "show-some-love", emoji: "❤️", phrase: "Show Some Love", tokenCost: 40, enabled: true, displayOrder: 15, featured: false, temporaryAvailable: true, liveOnly: true, alertStyle: "glow", soundStyle: "ching" },
  { id: "turn-it-up", emoji: "😈", phrase: "Turn It Up", tokenCost: 60, enabled: true, displayOrder: 16, featured: false, temporaryAvailable: true, liveOnly: true, alertStyle: "pulse", soundStyle: "bell" },
  { id: "keep-the-show-going", emoji: "💚", phrase: "Keep The Show Going", tokenCost: 80, enabled: true, displayOrder: 17, featured: false, temporaryAvailable: true, liveOnly: true, alertStyle: "glow", soundStyle: "ching" },
  { id: "vip-energy", emoji: "👑", phrase: "VIP Energy", tokenCost: 150, enabled: true, displayOrder: 18, featured: false, temporaryAvailable: true, liveOnly: true, alertStyle: "pulse", soundStyle: "bell" },
  { id: "yall-wild", emoji: "🚨", phrase: "Y’ALL WILD", tokenCost: 300, enabled: true, displayOrder: 19, featured: false, temporaryAvailable: true, liveOnly: true, alertStyle: "spark", soundStyle: "arcade" },
  { id: "favorite-creators", emoji: "😈", phrase: "You’re My Favorite Creators", tokenCost: 100, enabled: true, displayOrder: 7, featured: false, temporaryAvailable: true, liveOnly: true, alertStyle: "pulse", soundStyle: "bell" },
  { id: "cant-stop-watching", emoji: "👅", phrase: "Can’t Stop Watching", tokenCost: 50, enabled: true, displayOrder: 6, featured: false, temporaryAvailable: true, liveOnly: true, alertStyle: "glow", soundStyle: "ching" },
  { id: "worth-every-minute", emoji: "🤤", phrase: "Worth Every Minute", tokenCost: 30, enabled: true, displayOrder: 4, featured: false, temporaryAvailable: true, liveOnly: true, alertStyle: "glow", soundStyle: "ching" },
  { id: "doing-amazing", emoji: "💋", phrase: "You’re Doing Amazing", tokenCost: 32, enabled: true, displayOrder: 5, featured: false, temporaryAvailable: true, liveOnly: true, alertStyle: "spark", soundStyle: "bell" },
  { id: "appreciate-content", emoji: "💎", phrase: "Appreciate The Content", tokenCost: 20, enabled: true, displayOrder: 3, featured: false, temporaryAvailable: true, liveOnly: true, alertStyle: "glow", soundStyle: "pulse" },
  { id: "yall-nasty", emoji: "🙈", phrase: "YALL NASTY!!", tokenCost: 200, enabled: true, displayOrder: 8, featured: false, temporaryAvailable: true, liveOnly: true, alertStyle: "pulse", soundStyle: "arcade" },
  { id: "big-tipper", emoji: "💰", phrase: "BIG TIPPER!!!", tokenCost: 400, enabled: true, displayOrder: 9, featured: true, temporaryAvailable: true, liveOnly: true, alertStyle: "spark", soundStyle: "arcade" }
];

export function normalizeTipOptions(value: unknown): TipOption[] {
  if (!Array.isArray(value)) return DEFAULT_TIP_OPTIONS;
  const byId = new Map(DEFAULT_TIP_OPTIONS.map((option) => [option.id, option]));
  const configured = value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const candidate = entry as Partial<TipOption>;
    const fallback = byId.get(String(candidate.id || ""));
    if (!fallback) return [];
    return [{
      ...fallback,
      ...candidate,
      id: fallback.id,
      emoji: String(candidate.emoji || fallback.emoji).slice(0, 16),
      phrase: String(candidate.phrase || fallback.phrase).trim().slice(0, 80),
      tokenCost: Math.max(1, Math.min(1000, Math.floor(Number(candidate.tokenCost || fallback.tokenCost)))),
      displayOrder: Math.max(1, Math.floor(Number(candidate.displayOrder || fallback.displayOrder))),
      mediaId: candidate.mediaId ? String(candidate.mediaId) : null,
      artworkUrl: candidate.artworkUrl ? String(candidate.artworkUrl).slice(0, 500) : ""
    }];
  });
  const configuredById = new Map(configured.map((option) => [option.id, option]));
  return DEFAULT_TIP_OPTIONS.map((option) => configuredById.get(option.id) || option)
    .sort((a, b) => a.displayOrder - b.displayOrder || a.tokenCost - b.tokenCost);
}

export function validateCustomTipTokens(value: unknown, settings: TipMenuSettings = DEFAULT_TIP_MENU_SETTINGS) {
  const tokens = Number(value);
  if (!Number.isSafeInteger(tokens)) return { ok: false as const, error: "Enter a whole-coin amount." };
  if (tokens < settings.minimumCustomTokens || tokens > settings.maximumCustomTokens) {
    return { ok: false as const, error: `Enter between ${settings.minimumCustomTokens} and ${settings.maximumCustomTokens} coins.` };
  }
  return { ok: true as const, tokens };
}

export function calculateTokenDeduction(balance: number, tokenCost: number) {
  const safeBalance = Math.max(0, Math.floor(Number(balance) || 0));
  const safeCost = Math.max(1, Math.floor(Number(tokenCost) || 0));
  if (safeBalance < safeCost) return { ok: false as const, balanceBefore: safeBalance, balanceAfter: safeBalance, missingTokens: safeCost - safeBalance };
  return { ok: true as const, balanceBefore: safeBalance, balanceAfter: safeBalance - safeCost, missingTokens: 0 };
}

export function publicTipLabel(option: Pick<TipOption, "emoji" | "phrase" | "tokenCost">) {
  return `${option.emoji} ${option.phrase} — ${option.tokenCost} coins`;
}
