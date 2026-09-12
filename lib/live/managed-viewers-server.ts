import { createHash } from "node:crypto";
import { serviceCredentials, serviceHeaders } from "@/lib/api-user";
import { appConfig } from "@/lib/config";
import { updateManagedViewerPresence, type ManagedViewerAction, type ManagedViewerRecord, type ManagedViewerSnapshot } from "@/lib/live/managed-viewers";

const localStores = new Map<string, Map<string, ManagedViewerRecord>>();

function hashIdentifier(value: string) {
  const salt = process.env.CONTRIBUTION_IDENTITY_SALT || "xmf-development-presence";
  return createHash("sha256").update(`${salt}:${value}`).digest("hex");
}

function broadcastId() {
  return String(process.env.LIVE_BROADCAST_SESSION_ID || process.env.LIVE_BROADCAST_STARTED_AT || "daily-live").slice(0, 120);
}

function multiplier() {
  const configured = Number(process.env.VIEWER_DISPLAY_MULTIPLIER);
  return Number.isFinite(configured) && configured >= 1 && configured <= 100 ? Math.floor(configured) : appConfig.viewerMultiplier;
}

function liveStateAllowsPresence() {
  if (process.env.LIVE_BROADCAST_MODE !== "true-live") return true;
  return !(process.env.OBS_LIVE === "false" && process.env.OBS_STREAM_ACTIVE === "false");
}

export async function updateLiveViewerPresence({
  visitorKey,
  tabId,
  action,
  now = Date.now()
}: {
  visitorKey: string;
  tabId: string;
  action: ManagedViewerAction;
  now?: number;
}): Promise<ManagedViewerSnapshot & { broadcastId: string }> {
  const currentBroadcastId = broadcastId();
  if (!liveStateAllowsPresence()) return { realLiveViewerCount: 0, publicViewerDisplayValue: 0, entryDelta: 0, leaveDelta: 0, broadcastId: currentBroadcastId };

  const hashedVisitorKey = hashIdentifier(visitorKey);
  const hashedTabId = hashIdentifier(`${visitorKey}:${tabId}`);
  const service = serviceCredentials();

  if (service) {
    const response = await fetch(`${service.url}/rest/v1/rpc/update_live_viewer_presence`, {
      method: "POST",
      cache: "no-store",
      headers: serviceHeaders(service),
      body: JSON.stringify({
        p_broadcast_id: currentBroadcastId,
        p_visitor_key_hash: hashedVisitorKey,
        p_tab_key_hash: hashedTabId,
        p_action: action,
        p_multiplier: multiplier()
      })
    }).catch(() => null);
    if (response?.ok) {
      const result = await response.json().catch(() => ({})) as Partial<ManagedViewerSnapshot> & { real_live_viewer_count?: number; public_viewer_display_value?: number; entry_delta?: number; leave_delta?: number };
      return {
        realLiveViewerCount: Math.max(0, Math.floor(Number(result.realLiveViewerCount ?? result.real_live_viewer_count ?? 0))),
        publicViewerDisplayValue: Math.max(0, Math.floor(Number(result.publicViewerDisplayValue ?? result.public_viewer_display_value ?? 0))),
        entryDelta: Math.max(0, Math.floor(Number(result.entryDelta ?? result.entry_delta ?? 0))),
        leaveDelta: Math.max(0, Math.floor(Number(result.leaveDelta ?? result.leave_delta ?? 0))),
        broadcastId: currentBroadcastId
      };
    }
    if (process.env.NODE_ENV === "production") {
      return { realLiveViewerCount: 0, publicViewerDisplayValue: 0, entryDelta: 0, leaveDelta: 0, broadcastId: currentBroadcastId };
    }
  }

  let records = localStores.get(currentBroadcastId);
  if (!records) {
    records = new Map();
    localStores.set(currentBroadcastId, records);
  }
  return { ...updateManagedViewerPresence({ records, visitorKey: hashedVisitorKey, tabId: hashedTabId, action, now, multiplier: multiplier() }), broadcastId: currentBroadcastId };
}
