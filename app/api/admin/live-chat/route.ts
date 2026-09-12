import { NextRequest, NextResponse } from "next/server";
import { adminSessionCookie, auditAdminEvent, getAdminBySession, hasAdminPermission } from "@/lib/admin-auth";
import { serviceCredentials, serviceHeaders } from "@/lib/api-user";
import { extractClientIp } from "@/lib/security";

export const dynamic = "force-dynamic";

async function authorized(request: NextRequest) {
  const admin = await getAdminBySession(request.cookies.get(adminSessionCookie)?.value);
  return admin && hasAdminPermission(admin, "admin.customers.manage") ? admin : null;
}

function safeSessionId(value: unknown) {
  const sessionId = String(value || "daily-live").trim();
  return /^[a-zA-Z0-9:_-]{1,120}$/.test(sessionId) ? sessionId : "daily-live";
}

function safeEnvironment(value: unknown) {
  return value === "sandbox" ? "sandbox" : "production";
}

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store, private" } });
}

export async function GET(request: NextRequest) {
  const admin = await authorized(request);
  if (!admin) return json({ error: "Not found." }, 404);
  const service = serviceCredentials();
  if (!service) return json({ configured: false, participants: [], blocks: [], comments: [] });
  const environment = safeEnvironment(request.nextUrl.searchParams.get("environment"));
  const sessionId = safeSessionId(request.nextUrl.searchParams.get("sessionId"));
  const filter = `environment=eq.${environment}&live_session_id=eq.${encodeURIComponent(sessionId)}`;
  const [participantsResponse, blocksResponse, commentsResponse] = await Promise.all([
    fetch(`${service.url}/rest/v1/live_chat_participants?select=subject_ref,display_name,identity_type,status,first_seen_at,last_seen_at&${filter}&order=last_seen_at.desc&limit=200`, { cache: "no-store", headers: serviceHeaders(service) }).catch(() => null),
    fetch(`${service.url}/rest/v1/live_chat_blocks?select=id,subject_ref,display_name,reason,active,blocked_until,created_at&${filter}&order=created_at.desc&limit=200`, { cache: "no-store", headers: serviceHeaders(service) }).catch(() => null),
    fetch(`${service.url}/rest/v1/live_comments?select=id,subject_ref,display_name,body,status,created_at&${filter}&order=created_at.desc&limit=100`, { cache: "no-store", headers: serviceHeaders(service) }).catch(() => null)
  ]);
  return json({
    configured: Boolean(participantsResponse?.ok && blocksResponse?.ok && commentsResponse?.ok),
    participants: participantsResponse?.ok ? await participantsResponse.json() : [],
    blocks: blocksResponse?.ok ? await blocksResponse.json() : [],
    comments: commentsResponse?.ok ? await commentsResponse.json() : []
  });
}

export async function POST(request: NextRequest) {
  const admin = await authorized(request);
  if (!admin) return json({ error: "Not found." }, 404);
  const service = serviceCredentials();
  if (!service) return json({ error: "Chat storage is not configured." }, 503);
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = String(body.action || "");
  const sessionId = safeSessionId(body.liveSessionId);
  const environment = safeEnvironment(body.environment);
  const subjectRef = String(body.subjectRef || "").trim();
  const displayName = String(body.displayName || "Guest").replace(/[^a-z0-9_ -]/gi, "").trim().slice(0, 32) || "Guest";
  const reason = String(body.reason || "Manual Admin chat decision.").trim().slice(0, 1000);
  if (!subjectRef || subjectRef.length > 200 || !["block", "unblock"].includes(action)) return json({ error: "A valid participant and action are required." }, 400);
  const filter = `environment=eq.${environment}&live_session_id=eq.${encodeURIComponent(sessionId)}&subject_ref=eq.${encodeURIComponent(subjectRef)}`;
  let response: Response | null = null;
  if (action === "block") {
    const until = body.permanent === true ? null : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    response = await fetch(`${service.url}/rest/v1/live_chat_blocks?on_conflict=environment,live_session_id,subject_ref`, {
      method: "POST",
      headers: serviceHeaders(service, "resolution=merge-duplicates,return=minimal"),
      body: JSON.stringify({ live_session_id: sessionId, environment, subject_ref: subjectRef, display_name: displayName, reason, active: true, blocked_until: until, created_by: admin.id, updated_at: new Date().toISOString() })
    }).catch(() => null);
  } else {
    response = await fetch(`${service.url}/rest/v1/live_chat_blocks?${filter}`, {
      method: "PATCH",
      headers: serviceHeaders(service, "return=minimal"),
      body: JSON.stringify({ active: false, blocked_until: new Date().toISOString(), updated_at: new Date().toISOString() })
    }).catch(() => null);
  }
  if (!response?.ok) return json({ error: "The manual chat decision could not be saved." }, 422);
  await auditAdminEvent({
    adminUserId: admin.id,
    eventType: action === "block" ? "live_chat_participant_blocked" : "live_chat_participant_unblocked",
    ipAddress: extractClientIp(request.headers),
    userAgent: request.headers.get("user-agent") || "unknown",
    metadata: { subjectRef, displayName, environment, sessionId, reason, permanent: body.permanent === true }
  });
  return json({ ok: true });
}
