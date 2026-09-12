import { NextRequest, NextResponse } from "next/server";
import { adminSessionCookie, getAdminBySession } from "@/lib/admin-auth";
import {
  defaultReferralHeatmapFilters,
  getReferralHeatmap,
  type HeatmapRange,
  type ReferralHeatmapFilters
} from "@/lib/analytics/referral-heatmap";

export const dynamic = "force-dynamic";

const ranges = new Set<HeatmapRange>(["today", "7d", "30d", "90d", "custom"]);
const attributions = new Set(["session", "first_touch", "latest_touch"]);
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function timeZoneParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
}

function localDate(date: Date, timezone: string) {
  const parts = timeZoneParts(date, timezone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function localMidnight(dateValue: string, timezone: string): string {
  const [year, month, day] = dateValue.split("-").map(Number);
  const guess = Date.UTC(year, month - 1, day);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(guess));
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  const observedAsUtc = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute), Number(values.second));
  return new Date(guess - (observedAsUtc - guess)).toISOString();
}

function validTimezone(value: string | null) {
  if (!value) return defaultReferralHeatmapFilters.timezone;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return value;
  } catch {
    return defaultReferralHeatmapFilters.timezone;
  }
}

function buildFilters(request: NextRequest): ReferralHeatmapFilters {
  const query = request.nextUrl.searchParams;
  const timezone = validTimezone(query.get("timezone"));
  const rangeValue = query.get("range") as HeatmapRange | null;
  const range = rangeValue && ranges.has(rangeValue) ? rangeValue : defaultReferralHeatmapFilters.range;
  const today = localDate(new Date(), timezone);
  let startDate = today;
  let endDate = shiftDate(today, 1);
  if (range === "7d") startDate = shiftDate(today, -6);
  if (range === "30d") startDate = shiftDate(today, -29);
  if (range === "90d") startDate = shiftDate(today, -89);
  if (range === "custom") {
    const requestedStart = query.get("start") || "";
    const requestedEnd = query.get("end") || "";
    if (datePattern.test(requestedStart) && datePattern.test(requestedEnd) && requestedEnd >= requestedStart) {
      startDate = requestedStart;
      endDate = shiftDate(requestedEnd, 1);
    }
  }
  const attributionValue = query.get("attribution") || defaultReferralHeatmapFilters.attribution;
  return {
    range,
    start: localMidnight(startDate, timezone),
    end: localMidnight(endDate, timezone),
    timezone,
    source: (query.get("source") || "all").slice(0, 120).toLowerCase(),
    referrer: (query.get("referrer") || "").slice(0, 180).toLowerCase(),
    attribution: attributions.has(attributionValue) ? attributionValue as ReferralHeatmapFilters["attribution"] : "session",
    purchaseCategory: (query.get("purchaseCategory") || "all").slice(0, 40).toLowerCase(),
    pageSection: (query.get("pageSection") || "all").slice(0, 40).toLowerCase()
  };
}

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(data: Awaited<ReturnType<typeof getReferralHeatmap>>, filters: ReferralHeatmapFilters) {
  const lines = ["Day,Time Bucket,Impressions,Sessions,Unique Visitors,Purchases,Revenue,Average Order,Source,Purchase Category"];
  for (let day = 0; day < 7; day += 1) {
    for (let bucket = 0; bucket < 12; bucket += 1) {
      const visitor = data.visitorCells.find((cell) => cell.day === day && cell.bucket === bucket);
      const purchase = data.purchaseCells.find((cell) => cell.day === day && cell.bucket === bucket);
      lines.push([
        ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][day],
        ["12 AM", "2 AM", "4 AM", "6 AM", "8 AM", "10 AM", "12 PM", "2 PM", "4 PM", "6 PM", "8 PM", "10 PM"][bucket],
        visitor?.impressions || 0,
        visitor?.sessions || 0,
        visitor?.unique_visitors || 0,
        purchase?.purchases || 0,
        ((purchase?.revenue_minor || 0) / 100).toFixed(2),
        ((purchase?.average_order_minor || 0) / 100).toFixed(2),
        filters.source,
        filters.purchaseCategory
      ].map(csvEscape).join(","));
    }
  }
  return lines.join("\n");
}

export async function GET(request: NextRequest) {
  const admin = await getAdminBySession(request.cookies.get(adminSessionCookie)?.value);
  if (!admin || admin.role !== "ADMIN") return NextResponse.json({ ok: false, error: "Admin access required." }, { status: 403 });
  const filters = buildFilters(request);
  const data = await getReferralHeatmap(filters);
  if (request.nextUrl.searchParams.get("format") === "csv") {
    return new NextResponse(toCsv(data, filters), { status: 200, headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=referral-heatmaps.csv", "cache-control": "no-store" } });
  }
  return NextResponse.json({ ok: true, filters, data }, { headers: { "cache-control": "private, no-store" } });
}
