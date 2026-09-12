export type GeoVisitor = {
  id: string;
  countryCode: string;
  country: string;
  region: string;
  city: string;
  timeZone: string;
  language: string;
  browser: string;
  operatingSystem: string;
  deviceType: "Mobile" | "Desktop" | "Tablet";
  referralSource: string;
  campaign: string;
  currentPage: string;
  sessionSeconds: number;
  pagesViewed: number;
  returning: boolean;
  active: boolean;
  conversions: {
    registrations: number;
    deposits: number;
    purchases: number;
    tips: number;
  };
};

export type GeoCountrySummary = {
  countryCode: string;
  country: string;
  timeZone: string;
  activeVisitors: number;
  uniqueVisitors: number;
  returningVisitors: number;
  historicalVisits: number;
  averageSessionSeconds: number;
  pagesViewed: number;
  languagePreference: string;
  topReferral: string;
  deviceBreakdown: Record<string, number>;
  browserUsage: Record<string, number>;
  conversions: GeoVisitor["conversions"];
};

export const geoVisitors: GeoVisitor[] = [
  {
    id: "GEO-1042",
    countryCode: "US",
    country: "United States",
    region: "Texas",
    city: "Dallas",
    timeZone: "America/Chicago",
    language: "English",
    browser: "Chrome",
    operatingSystem: "iOS",
    deviceType: "Mobile",
    referralSource: "Direct",
    campaign: "live-loop",
    currentPage: "/#live",
    sessionSeconds: 1820,
    pagesViewed: 6,
    returning: true,
    active: true,
    conversions: { registrations: 1, deposits: 1, purchases: 0, tips: 3 }
  },
  {
    id: "GEO-1091",
    countryCode: "GB",
    country: "United Kingdom",
    region: "England",
    city: "London",
    timeZone: "Europe/London",
    language: "English",
    browser: "Safari",
    operatingSystem: "macOS",
    deviceType: "Desktop",
    referralSource: "Clips4Sale",
    campaign: "clips-444327",
    currentPage: "/#clips",
    sessionSeconds: 940,
    pagesViewed: 4,
    returning: false,
    active: true,
    conversions: { registrations: 1, deposits: 0, purchases: 1, tips: 1 }
  },
  {
    id: "GEO-1178",
    countryCode: "BR",
    country: "Brazil",
    region: "Sao Paulo",
    city: "Sao Paulo",
    timeZone: "America/Sao_Paulo",
    language: "Portuguese",
    browser: "Chrome",
    operatingSystem: "Android",
    deviceType: "Mobile",
    referralSource: "Campaign",
    campaign: "green-tip-night",
    currentPage: "/#tips",
    sessionSeconds: 620,
    pagesViewed: 5,
    returning: true,
    active: true,
    conversions: { registrations: 0, deposits: 1, purchases: 0, tips: 2 }
  },
  {
    id: "GEO-1204",
    countryCode: "DE",
    country: "Germany",
    region: "Berlin",
    city: "Berlin",
    timeZone: "Europe/Berlin",
    language: "German",
    browser: "Firefox",
    operatingSystem: "Windows",
    deviceType: "Desktop",
    referralSource: "Fansly",
    campaign: "fansly-rotation",
    currentPage: "/#fansly",
    sessionSeconds: 1310,
    pagesViewed: 7,
    returning: false,
    active: true,
    conversions: { registrations: 1, deposits: 0, purchases: 0, tips: 0 }
  },
  {
    id: "GEO-1233",
    countryCode: "JP",
    country: "Japan",
    region: "Tokyo",
    city: "Tokyo",
    timeZone: "Asia/Tokyo",
    language: "Japanese",
    browser: "Edge",
    operatingSystem: "Windows",
    deviceType: "Desktop",
    referralSource: "Search",
    campaign: "organic-live",
    currentPage: "/#games",
    sessionSeconds: 410,
    pagesViewed: 3,
    returning: false,
    active: true,
    conversions: { registrations: 0, deposits: 0, purchases: 0, tips: 1 }
  },
  {
    id: "GEO-0988",
    countryCode: "CA",
    country: "Canada",
    region: "Ontario",
    city: "Toronto",
    timeZone: "America/Toronto",
    language: "English",
    browser: "Chrome",
    operatingSystem: "Android",
    deviceType: "Mobile",
    referralSource: "Direct",
    campaign: "returning-live",
    currentPage: "/#live",
    sessionSeconds: 0,
    pagesViewed: 9,
    returning: true,
    active: false,
    conversions: { registrations: 1, deposits: 2, purchases: 0, tips: 5 }
  }
];

export const geoDateFilters = ["Today", "Yesterday", "Last 7 days", "Last 30 days", "Custom range"];
export const geoTrafficSources = ["All sources", "Direct", "Campaign", "Clips4Sale", "Fansly", "Search"];
export const geoReportCadence = ["Daily", "Weekly", "Monthly"];

export type ReferralEvent = {
  source: string;
  referrerUrl: string;
  landingPage: string;
  visitors: number;
  uniqueVisitors: number;
  clicks: number;
  conversions: {
    tips: number;
    registrations: number;
    purchases: number;
  };
  sessionSeconds: number;
  bounces: number;
  trend: number[];
};

export const referralDateFilters = ["Today", "Yesterday", "Last 7 days", "Last 30 days", "Custom range"];
export const referralSourceTypes = ["All sources", "Ads", "Social", "Search", "Direct", "Other websites"];
export const referralConversionFilters = ["All conversions", "Tips", "Registrations", "Purchases"];

export const referralEvents: ReferralEvent[] = [
  { source: "JuicyAds", referrerUrl: "https://www.juicyads.com/campaign/live-mask", landingPage: "/#live", visitors: 148, uniqueVisitors: 92, clicks: 188, conversions: { tips: 18, registrations: 14, purchases: 7 }, sessionSeconds: 840, bounces: 38, trend: [22, 24, 27, 31, 34, 39, 41] },
  { source: "X (Twitter)", referrerUrl: "https://x.com/1SexualTension", landingPage: "/#fansly", visitors: 96, uniqueVisitors: 71, clicks: 122, conversions: { tips: 9, registrations: 11, purchases: 3 }, sessionSeconds: 710, bounces: 29, trend: [10, 12, 15, 19, 18, 23, 27] },
  { source: "Google", referrerUrl: "https://www.google.com/search?q=xmaskedfreaks", landingPage: "/#clips", visitors: 74, uniqueVisitors: 66, clicks: 88, conversions: { tips: 4, registrations: 8, purchases: 6 }, sessionSeconds: 530, bounces: 26, trend: [6, 8, 11, 12, 14, 16, 17] },
  { source: "Direct Traffic", referrerUrl: "", landingPage: "/#live", visitors: 61, uniqueVisitors: 49, clicks: 70, conversions: { tips: 13, registrations: 6, purchases: 2 }, sessionSeconds: 1120, bounces: 12, trend: [7, 8, 8, 9, 10, 9, 10] },
  { source: "Reddit", referrerUrl: "https://www.reddit.com/r/adultcreatorpromo", landingPage: "/#games", visitors: 42, uniqueVisitors: 35, clicks: 55, conversions: { tips: 3, registrations: 5, purchases: 1 }, sessionSeconds: 390, bounces: 19, trend: [4, 5, 6, 6, 7, 7, 7] },
  { source: "Other websites", referrerUrl: "https://partner.example/ref/xmasked", landingPage: "/#access", visitors: 31, uniqueVisitors: 26, clicks: 36, conversions: { tips: 2, registrations: 3, purchases: 1 }, sessionSeconds: 460, bounces: 13, trend: [2, 3, 4, 4, 5, 6, 7] }
];

export function normalizeReferralSource(referrer = "", campaign = "") {
  const value = `${referrer} ${campaign}`.toLowerCase();
  if (!value.trim()) return "Direct Traffic";
  if (value.includes("juicy")) return "JuicyAds";
  if (value.includes("twitter") || value.includes("x.com")) return "X (Twitter)";
  if (value.includes("google")) return "Google";
  if (value.includes("reddit")) return "Reddit";
  if (value.includes("direct")) return "Direct Traffic";
  return "Other websites";
}

export function summarizeReferrals(events: ReferralEvent[]) {
  const enriched = events.map((event) => {
    const source = normalizeReferralSource(event.referrerUrl, event.source);
    const totalConversions = event.conversions.tips + event.conversions.registrations + event.conversions.purchases;
    return {
      ...event,
      source,
      totalConversions,
      bounceRate: Math.round((event.bounces / Math.max(1, event.visitors)) * 100),
      averageSessionSeconds: Math.round(event.sessionSeconds / Math.max(1, event.uniqueVisitors))
    };
  });
  const totalTraffic = enriched.reduce((sum, item) => sum + item.visitors, 0);
  return enriched.map((item) => ({
    ...item,
    trafficPercent: Math.round((item.visitors / Math.max(1, totalTraffic)) * 100)
  }));
}

export function summarizeGeoVisitors(visitors: GeoVisitor[]) {
  const summaries = new Map<string, GeoCountrySummary>();

  visitors.forEach((visitor) => {
    const existing = summaries.get(visitor.countryCode) || {
      countryCode: visitor.countryCode,
      country: visitor.country,
      timeZone: visitor.timeZone,
      activeVisitors: 0,
      uniqueVisitors: 0,
      returningVisitors: 0,
      historicalVisits: 0,
      averageSessionSeconds: 0,
      pagesViewed: 0,
      languagePreference: visitor.language,
      topReferral: visitor.referralSource,
      deviceBreakdown: {},
      browserUsage: {},
      conversions: { registrations: 0, deposits: 0, purchases: 0, tips: 0 }
    };

    existing.activeVisitors += visitor.active ? 1 : 0;
    existing.uniqueVisitors += 1;
    existing.returningVisitors += visitor.returning ? 1 : 0;
    existing.historicalVisits += visitor.returning ? 4 : 1;
    existing.averageSessionSeconds += visitor.sessionSeconds;
    existing.pagesViewed += visitor.pagesViewed;
    existing.deviceBreakdown[visitor.deviceType] = (existing.deviceBreakdown[visitor.deviceType] || 0) + 1;
    existing.browserUsage[visitor.browser] = (existing.browserUsage[visitor.browser] || 0) + 1;
    existing.conversions.registrations += visitor.conversions.registrations;
    existing.conversions.deposits += visitor.conversions.deposits;
    existing.conversions.purchases += visitor.conversions.purchases;
    existing.conversions.tips += visitor.conversions.tips;
    summaries.set(visitor.countryCode, existing);
  });

  return [...summaries.values()].map((summary) => ({
    ...summary,
    averageSessionSeconds: Math.round(summary.averageSessionSeconds / Math.max(1, summary.uniqueVisitors))
  }));
}

export function formatGeoClock(timeZone: string, locale = "en") {
  const now = new Date();
  const hour = Number(new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    hour12: false
  }).format(now));
  return {
    time: new Intl.DateTimeFormat(locale, {
      timeZone,
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      timeZoneName: "short"
    }).format(now),
    daylight: hour >= 7 && hour < 19
  };
}
