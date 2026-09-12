import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { adminSessionCookie, getAdminBySession, hasAdminPermission } from "@/lib/admin-auth";
import { serviceCredentials, serviceHeaders } from "@/lib/api-user";
import { COIN_VALUE_USD } from "@/lib/contribution-policy";

export const dynamic = "force-dynamic";

const cohorts = [
  [0, 120, "0-2 minutes"], [120, 300, "2-5 minutes"], [300, 600, "5-10 minutes"],
  [600, 900, "10-15 minutes"], [900, 1800, "15-30 minutes"], [1800, 3600, "30-60 minutes"],
  [3600, 5400, "60-90 minutes"], [5400, 7200, "90-120 minutes"], [7200, Infinity, "120+ minutes"]
] as const;

function number(value: unknown) { return Math.max(0, Number(value || 0)); }

export async function GET(_request: NextRequest) {
  const admin = await getAdminBySession(cookies().get(adminSessionCookie)?.value);
  if (!admin || !hasAdminPermission(admin, "admin.operations.manage")) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  const service = serviceCredentials();
  if (!service) return NextResponse.json({ configured: false, message: "Live economics data source is not configured." });
  const headers = serviceHeaders(service);
  const [sessionResponse, costResponse, tipResponse] = await Promise.all([
    fetch(`${service.url}/rest/v1/live_viewer_sessions?environment=eq.production&select=playback_session_id,active_watch_seconds,cumulative_tip_coins,qualifying_contribution_at&limit=10000`, { headers, cache: "no-store" }).catch(() => null),
    fetch(`${service.url}/rest/v1/live_delivery_cost_settings?provider=eq.cloudflare-stream&enabled=eq.true&select=delivered_minutes_per_unit,unit_price_minor,currency&limit=1`, { headers, cache: "no-store" }).catch(() => null),
    fetch(`${service.url}/rest/v1/live_viewer_tip_correlations?environment=eq.production&select=playback_session_id,watch_seconds_before_tip,watch_minute,coins_tipped,qualifying&limit=20000`, { headers, cache: "no-store" }).catch(() => null)
  ]);
  if (!sessionResponse?.ok) return NextResponse.json({ configured: true, error: "Live session analytics is unavailable." }, { status: 503 });
  const sessions = await sessionResponse.json() as Array<Record<string, unknown>>;
  const [cost] = costResponse?.ok ? await costResponse.json() as Array<Record<string, unknown>> : [];
  const tips = tipResponse?.ok ? await tipResponse.json() as Array<Record<string, unknown>> : [];
  const real = sessions.filter((row) => number(row.active_watch_seconds) > 0);
  const deliveredMinutes = real.reduce((sum, row) => sum + number(row.active_watch_seconds) / 60, 0);
  const pricePerUnit = number(cost?.unit_price_minor) / 100;
  const minutesPerUnit = Math.max(1, number(cost?.delivered_minutes_per_unit) || 1000);
  const economics = (rows: Array<Record<string, unknown>>) => {
    const watched = rows.filter((row) => number(row.active_watch_seconds) > 0);
    const coins = watched.reduce((sum, row) => sum + number(row.cumulative_tip_coins), 0);
    const tipperCount = watched.filter((row) => number(row.cumulative_tip_coins) > 0).length;
    const minutes = watched.reduce((sum, row) => sum + number(row.active_watch_seconds) / 60, 0);
    const costUsd = minutes / minutesPerUnit * pricePerUnit;
    const revenueUsd = coins * COIN_VALUE_USD;
    return { realViewers: watched.length, averageActiveWatchMinutes: watched.length ? minutes / watched.length : 0, qualifyingTippers: tipperCount, tipConversionPercent: watched.length ? tipperCount / watched.length * 100 : 0, tipRevenueUsd: revenueUsd, estimatedCloudflareCostUsd: costUsd, revenueMinusDeliveryCostUsd: revenueUsd - costUsd };
  };
  const cohortMetrics = cohorts.map(([start, end, label]) => ({ label, ...economics(real.filter((row) => {
    const seconds = number(row.active_watch_seconds);
    return seconds >= start && seconds < end;
  })) }));
  return NextResponse.json({ configured: true, source: "live_viewer_sessions", activeVideoViewers: real.length, deliveredViewerMinutes: deliveredMinutes, averageVideoMinutesPerViewer: real.length ? deliveredMinutes / real.length : 0, tipsPer100ActualViewers: real.length ? real.filter((row) => number(row.cumulative_tip_coins) > 0).length / real.length * 100 : 0, tipRevenuePer1000DeliveredMinutesUsd: deliveredMinutes ? real.reduce((sum, row) => sum + number(row.cumulative_tip_coins), 0) * COIN_VALUE_USD / deliveredMinutes * 1000 : 0, estimatedCloudflareCostUsd: deliveredMinutes / minutesPerUnit * pricePerUnit, providerPricing: cost || null, sessions: economics(real), cohorts: cohortMetrics, tipEvents: tips.length });
}
