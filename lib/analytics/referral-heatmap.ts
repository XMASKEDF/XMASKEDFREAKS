import { serviceCredentials, serviceHeaders } from "@/lib/api-user";

export const HEATMAP_TIMEZONES = [
  "America/Chicago",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Asia/Tokyo",
  "UTC"
] as const;

export const HEATMAP_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
export const HEATMAP_BUCKETS = ["12 AM", "2 AM", "4 AM", "6 AM", "8 AM", "10 AM", "12 PM", "2 PM", "4 PM", "6 PM", "8 PM", "10 PM"] as const;

export type HeatmapRange = "today" | "7d" | "30d" | "90d" | "custom";
export type VisitorHeatmapMetric = "impressions" | "sessions" | "unique_visitors";
export type PurchaseHeatmapMetric = "purchase_count" | "revenue" | "average_order" | "conversion";
export type AttributionModel = "session" | "first_touch" | "latest_touch";

export type ReferralHeatmapFilters = {
  range: HeatmapRange;
  start: string;
  end: string;
  timezone: string;
  source: string;
  referrer: string;
  attribution: AttributionModel;
  purchaseCategory: string;
  pageSection: string;
};

export type HeatmapCell = {
  day: number;
  bucket: number;
  impressions?: number;
  sessions?: number;
  unique_visitors?: number;
  purchases?: number;
  revenue_minor?: number;
  average_order_minor?: number;
  conversion_rate?: number;
};

export type ReferralHeatmapData = {
  configured: boolean;
  timezone: string;
  message?: string;
  visitorCells: HeatmapCell[];
  purchaseCells: HeatmapCell[];
  visitorTotals: { impressions: number; sessions: number; uniqueVisitors: number };
  purchaseTotals: { purchases: number; revenueMinor: number; averageOrderMinor: number };
};

export type HeatmapSummary = { day: string; bucket: string };

export const defaultReferralHeatmapFilters: ReferralHeatmapFilters = {
  range: "7d",
  start: "",
  end: "",
  timezone: "America/Chicago",
  source: "all",
  referrer: "",
  attribution: "session",
  purchaseCategory: "all",
  pageSection: "all"
};

function emptyCells(): HeatmapCell[] {
  return Array.from({ length: 84 }, (_, index) => ({ day: Math.floor(index / 12), bucket: index % 12, impressions: 0, sessions: 0, unique_visitors: 0, purchases: 0, revenue_minor: 0, average_order_minor: 0 }));
}

export function createEmptyHeatmapCells(): HeatmapCell[] {
  return emptyCells();
}

export function heatmapMetricValue(cell: HeatmapCell, metric: VisitorHeatmapMetric | PurchaseHeatmapMetric): number {
  if (metric === "impressions") return cell.impressions || 0;
  if (metric === "sessions") return cell.sessions || 0;
  if (metric === "unique_visitors") return cell.unique_visitors || 0;
  if (metric === "revenue") return (cell.revenue_minor || 0) / 100;
  if (metric === "average_order") return (cell.average_order_minor || 0) / 100;
  if (metric === "conversion") return cell.conversion_rate || 0;
  return cell.purchases || 0;
}

export function summarizeHeatmap(cells: HeatmapCell[], metric: VisitorHeatmapMetric | PurchaseHeatmapMetric): HeatmapSummary {
  const byDay = HEATMAP_DAYS.map((_, day) => cells.filter((cell) => cell.day === day).reduce((total, cell) => total + heatmapMetricValue(cell, metric), 0));
  const byBucket = HEATMAP_BUCKETS.map((_, bucket) => cells.filter((cell) => cell.bucket === bucket).reduce((total, cell) => total + heatmapMetricValue(cell, metric), 0));
  const bestDay = Math.max(...byDay, 0);
  const bestBucket = Math.max(...byBucket, 0);
  return { day: bestDay > 0 ? HEATMAP_DAYS[byDay.indexOf(bestDay)] : "—", bucket: bestBucket > 0 ? HEATMAP_BUCKETS[byBucket.indexOf(bestBucket)] : "—" };
}

export function heatmapScaleMaximum(cells: HeatmapCell[], metric: VisitorHeatmapMetric | PurchaseHeatmapMetric): number {
  const values = cells.map((cell) => heatmapMetricValue(cell, metric)).filter((value) => value > 0).sort((left, right) => left - right);
  if (!values.length) return 0;
  const percentileIndex = Math.min(values.length - 1, Math.floor((values.length - 1) * 0.95));
  return values[percentileIndex];
}

export function heatmapIntensity(value: number, scaleMaximum: number): number {
  if (value <= 0 || scaleMaximum <= 0) return 0;
  return Math.min(5, Math.max(1, Math.ceil(value / scaleMaximum * 5)));
}

export function emptyReferralHeatmap(timezone = "America/Chicago", message = "Analytics data is not configured."): ReferralHeatmapData {
  return {
    configured: false,
    timezone,
    message,
    visitorCells: emptyCells(),
    purchaseCells: emptyCells(),
    visitorTotals: { impressions: 0, sessions: 0, uniqueVisitors: 0 },
    purchaseTotals: { purchases: 0, revenueMinor: 0, averageOrderMinor: 0 }
  };
}

function asNumber(value: unknown): number {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function normalizeCells(value: unknown, purchase: boolean): HeatmapCell[] {
  const source = Array.isArray(value) ? value : [];
  const cells = source.map((item) => {
    const row = item as Record<string, unknown>;
    return purchase
      ? { day: asNumber(row.day), bucket: asNumber(row.bucket), purchases: asNumber(row.purchases), revenue_minor: asNumber(row.revenue_minor), average_order_minor: asNumber(row.average_order_minor), conversion_rate: asNumber(row.conversion_rate) }
      : { day: asNumber(row.day), bucket: asNumber(row.bucket), impressions: asNumber(row.impressions), sessions: asNumber(row.sessions), unique_visitors: asNumber(row.unique_visitors) };
  }).filter((cell) => cell.day >= 0 && cell.day < 7 && cell.bucket >= 0 && cell.bucket < 12);
  return cells.length === 84 ? cells : emptyCells().map((empty) => ({ ...empty, ...(cells.find((cell) => cell.day === empty.day && cell.bucket === empty.bucket) || {}) }));
}

export function normalizeReferralHeatmap(payload: unknown, timezone: string): ReferralHeatmapData {
  const value = payload as Record<string, unknown>;
  const visitorTotals = (value.visitorTotals || {}) as Record<string, unknown>;
  const purchaseTotals = (value.purchaseTotals || {}) as Record<string, unknown>;
  return {
    configured: value.configured === true,
    timezone: typeof value.timezone === "string" ? value.timezone : timezone,
    message: typeof value.message === "string" ? value.message : undefined,
    visitorCells: normalizeCells(value.visitorCells, false),
    purchaseCells: normalizeCells(value.purchaseCells, true),
    visitorTotals: { impressions: asNumber(visitorTotals.impressions), sessions: asNumber(visitorTotals.sessions), uniqueVisitors: asNumber(visitorTotals.uniqueVisitors) },
    purchaseTotals: { purchases: asNumber(purchaseTotals.purchases), revenueMinor: asNumber(purchaseTotals.revenueMinor), averageOrderMinor: asNumber(purchaseTotals.averageOrderMinor) }
  };
}

export async function getReferralHeatmap(filters: ReferralHeatmapFilters): Promise<ReferralHeatmapData> {
  const service = serviceCredentials();
  if (!service) return emptyReferralHeatmap(filters.timezone);
  const response = await fetch(`${service.url}/rest/v1/rpc/get_referral_heatmap`, {
    method: "POST",
    cache: "no-store",
    headers: serviceHeaders(service),
    body: JSON.stringify({
      p_start: filters.start,
      p_end: filters.end,
      p_time_zone: filters.timezone,
      p_source: filters.source,
      p_referrer_host: filters.referrer,
      p_attribution_model: filters.attribution,
      p_purchase_category: filters.purchaseCategory,
      p_page_section: filters.pageSection
    })
  }).catch(() => null);
  if (!response?.ok) return emptyReferralHeatmap(filters.timezone, "No aggregate analytics are available for this filter set.");
  const payload = await response.json().catch(() => null);
  return normalizeReferralHeatmap(payload, filters.timezone);
}
