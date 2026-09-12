import { NextRequest, NextResponse } from "next/server";
import { decideRedirect, getChicagoMinute, isMinuteInBlock, parseClockToMinute, parseOfflineBlocks } from "@/lib/redirect-manager";
import { readOperationalState } from "@/lib/admin-operationalization";

async function readObsLive() {
  const statusEndpoint = process.env.OBS_STATUS_ENDPOINT;
  if (statusEndpoint) {
    try {
      const response = await fetch(statusEndpoint, { cache: "no-store" });
      if (!response.ok) return false;
      const status = await response.json();
      return status.live === true || status.active === true || status.streaming === true;
    } catch {
      return false;
    }
  }
  return process.env.OBS_LIVE === "true" || process.env.OBS_STREAM_ACTIVE === "true";
}

function readManualDestination() {
  const value = (process.env.REDIRECT_MANUAL_DESTINATION || "").toLowerCase();
  return value === "clips4sale" || value === "fansly" ? value : "";
}

async function readConfiguredDestination(pathname: string) {
  const { state } = await readOperationalState();
  const minute = getChicagoMinute();
  const rule = state.redirects
    .filter((item) => item.enabled && (item.source === pathname || item.source === "/go"))
    .sort((left, right) => left.priority - right.priority)
    .find((item) => !item.condition.offlineOnly || isMinuteInBlock(minute, { id: item.id, label: item.name, startMinute: parseClockToMinute(item.condition.start), endMinute: parseClockToMinute(item.condition.end), destination: item.destination === "live" ? "split" : item.destination }));
  return rule?.destination || "";
}

async function logRedirect(input: {
  destination: string;
  destinationUrl: string;
  reason: string;
  obsLive: boolean;
  bucket: number;
  chicagoMinute: number;
  matchedBlock?: string;
  referrer: string;
  campaignId: string;
  userAgent: string;
}) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return;

  try {
    await fetch(`${supabaseUrl}/rest/v1/redirect_manager_logs`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
        "content-type": "application/json",
        prefer: "return=minimal"
      },
      body: JSON.stringify({
        destination: input.destination,
        destination_url: input.destinationUrl,
        reason: input.reason,
        obs_live: input.obsLive,
        bucket: input.bucket,
        chicago_minute: input.chicagoMinute,
        matched_block: input.matchedBlock || null,
        referrer: input.referrer,
        campaign_id: input.campaignId || null,
        user_agent: input.userAgent || null
      })
    });
  } catch {
    // Redirects should never fail because analytics logging is unavailable.
  }
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const fanslyUrl = process.env.FANSLY_URL || "https://fansly.com/1SexualTension";
  const clipsUrl = process.env.CLIPS4SALE_URL || "https://www.clips4sale.com/studio/444327/xmaskedfreaks";
  const liveUrl = new URL("/#live", url.origin).toString();
  const referrer = request.headers.get("referer") || "Direct";
  const campaignId = url.searchParams.get("campaign") || url.searchParams.get("utm_campaign") || "";
  const userAgent = request.headers.get("user-agent") || "";
  const seed = [
    request.headers.get("x-forwarded-for") || "",
    userAgent,
    campaignId,
    url.searchParams.get("ad") || "",
    url.searchParams.get("utm_source") || ""
  ].join("|");

  const decision = decideRedirect({
    obsLive: await readObsLive(),
    liveUrl,
    clipsUrl,
    fanslyUrl,
    seed,
    manualDestination: (await readConfiguredDestination(url.pathname)) || readManualDestination(),
    clipsPercent: Number(process.env.REDIRECT_CLIPS_PERCENT || 60),
    offlineBlocks: parseOfflineBlocks(process.env.REDIRECT_OFFLINE_BLOCKS)
  });

  await logRedirect({
    destination: decision.destination,
    destinationUrl: decision.destinationUrl,
    reason: decision.reason,
    obsLive: decision.obsLive,
    bucket: decision.bucket,
    chicagoMinute: decision.chicagoMinute,
    matchedBlock: decision.matchedBlock,
    referrer,
    campaignId,
    userAgent
  });

  const response = NextResponse.redirect(decision.destinationUrl);
  response.headers.set("x-redirect-destination", decision.destination);
  response.headers.set("x-redirect-reason", decision.reason);
  response.headers.set("x-redirect-bucket", String(decision.bucket));
  response.headers.set("x-redirect-obs-live", String(decision.obsLive));
  response.headers.set("x-redirect-chicago-minute", String(decision.chicagoMinute));
  response.headers.set("x-redirect-referrer", referrer);
  response.headers.set("x-redirect-timestamp", new Date().toISOString());
  return response;
}
