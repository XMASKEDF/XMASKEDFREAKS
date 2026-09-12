import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getApiUser, serviceCredentials, serviceHeaders } from "@/lib/api-user";
import { createLiveGuestCookie, LIVE_GUEST_COOKIE, liveSubjectReference } from "@/lib/live/guest-identity";

export const dynamic = "force-dynamic";

const MAX_MESSAGE_LENGTH = 280;
const MAX_EVENTS = 40;
const RATE_WINDOW_MS = 10_000;
const MAX_MESSAGES_PER_WINDOW = 4;
const rateBuckets = new Map<string, { startedAt: number; count: number }>();

type FeedEvent = {
  id: string;
  type: "comment" | "tip";
  displayName: string;
  message: string;
  coins?: number;
  createdAt: string;
};

function safeEnvironment(value: unknown) {
  return value === "sandbox" ? "sandbox" : "production";
}

function safeSessionId(value: unknown) {
  const sessionId = String(value || "daily-live").trim();
  return /^[a-zA-Z0-9:_-]{1,120}$/.test(sessionId) ? sessionId : "daily-live";
}

function cleanMessage(value: unknown) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, MAX_MESSAGE_LENGTH);
}

function cleanDisplayName(value: unknown, fallback: string) {
  return String(value || "")
    .replace(/[^a-z0-9_ -]/gi, "")
    .trim()
    .slice(0, 32) || fallback;
}

function guestDisplayName(subjectRef: string) {
  return `Guest-${createHash("sha256").update(subjectRef).digest("hex").slice(0, 4).toUpperCase()}`;
}

function blockedByRateLimit(subjectRef: string) {
  const now = Date.now();
  if (rateBuckets.size > 2000) {
    for (const [key, bucket] of rateBuckets) {
      if (now - bucket.startedAt > RATE_WINDOW_MS) rateBuckets.delete(key);
    }
  }
  const bucket = rateBuckets.get(subjectRef);
  if (!bucket || now - bucket.startedAt >= RATE_WINDOW_MS) {
    rateBuckets.set(subjectRef, { startedAt: now, count: 1 });
    return false;
  }
  bucket.count += 1;
  return bucket.count > MAX_MESSAGES_PER_WINDOW;
}

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store, private" } });
}

function setGuestCookie(response: NextResponse, guestCookie: string | null, existingGuest: string | null) {
  if (!guestCookie || existingGuest) return response;
  response.cookies.set(LIVE_GUEST_COOKIE, guestCookie, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });
  return response;
}

async function getProfileName(service: NonNullable<ReturnType<typeof serviceCredentials>>, userId: string) {
  const response = await fetch(`${service.url}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=display_name&limit=1`, {
    cache: "no-store",
    headers: serviceHeaders(service)
  }).catch(() => null);
  if (!response?.ok) return "";
  const [profile] = await response.json() as Array<{ display_name?: string }>;
  return cleanDisplayName(profile?.display_name, "");
}

async function resolveIdentity(request: NextRequest, service: NonNullable<ReturnType<typeof serviceCredentials>>) {
  const user = await getApiUser(request);
  const existingGuest = request.cookies.get(LIVE_GUEST_COOKIE)?.value || null;
  const guestCookie = user ? null : (existingGuest || createLiveGuestCookie());
  const subjectRef = liveSubjectReference(user?.id || null, guestCookie);
  if (!subjectRef) return null;
  const fallbackName = user ? `Member-${user.id.slice(0, 4).toUpperCase()}` : guestDisplayName(subjectRef);
  const displayName = user ? await getProfileName(service, user.id) || fallbackName : fallbackName;
  return { user, existingGuest, guestCookie, subjectRef, displayName };
}

export async function GET(request: NextRequest) {
  const service = serviceCredentials();
  if (!service) return json({ configured: false, events: [] });
  const sessionId = safeSessionId(request.nextUrl.searchParams.get("sessionId"));
  const environment = safeEnvironment(request.nextUrl.searchParams.get("environment"));
  const commentsUrl = `${service.url}/rest/v1/live_comments?select=id,display_name,body,created_at&environment=eq.${environment}&live_session_id=eq.${encodeURIComponent(sessionId)}&status=eq.visible&order=created_at.desc&limit=40`;
  const tipsUrl = `${service.url}/rest/v1/public_live_tip_events?select=id,public_display_name,tip_coins,approved_message,created_at&order=created_at.desc&limit=20`;
  const [commentsResponse, tipsResponse] = await Promise.all([
    fetch(commentsUrl, { cache: "no-store", headers: serviceHeaders(service) }).catch(() => null),
    environment === "production" ? fetch(tipsUrl, { cache: "no-store", headers: serviceHeaders(service) }).catch(() => null) : Promise.resolve(null)
  ]);
  const comments = commentsResponse?.ok ? await commentsResponse.json() as Array<Record<string, unknown>> : [];
  const tips = tipsResponse?.ok ? await tipsResponse.json() as Array<Record<string, unknown>> : [];
  const events: FeedEvent[] = [
    ...comments.map((row) => ({
      id: `comment:${String(row.id)}`,
      type: "comment" as const,
      displayName: cleanDisplayName(row.display_name, "Guest"),
      message: String(row.body || "").slice(0, MAX_MESSAGE_LENGTH),
      createdAt: String(row.created_at || "")
    })),
    ...tips.map((row) => ({
      id: `tip:${String(row.id)}`,
      type: "tip" as const,
      displayName: cleanDisplayName(row.public_display_name, "Guest"),
      message: String(row.approved_message || "").slice(0, 120),
      coins: Math.max(1, Math.floor(Number(row.tip_coins || 1))),
      createdAt: String(row.created_at || "")
    }))
  ].sort((left, right) => left.createdAt.localeCompare(right.createdAt)).slice(-MAX_EVENTS);
  return json({ configured: true, events });
}

export async function POST(request: NextRequest) {
  const service = serviceCredentials();
  if (!service) return json({ error: "Live comments are not configured yet." }, 503);
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = String(body.action || "comment");
  const sessionId = safeSessionId(body.liveSessionId);
  const environment = safeEnvironment(body.environment);

  if (["presence", "away", "leave"].includes(action)) {
    const identity = await resolveIdentity(request, service);
    if (!identity) return json({ error: "Live identity could not be established." }, 503);
    if (blockedByRateLimit(identity.subjectRef)) return json({ error: "Please wait a moment before reconnecting." }, 429);
    const status = action === "leave" ? "left" : action === "away" ? "away" : "present";
    const participantResponse = await fetch(`${service.url}/rest/v1/live_chat_participants`, {
      method: "POST",
      headers: serviceHeaders(service, "resolution=merge-duplicates,return=minimal"),
      body: JSON.stringify({
        live_session_id: sessionId,
        environment,
        subject_ref: identity.subjectRef,
        user_id: identity.user?.id || null,
        display_name: identity.displayName,
        identity_type: identity.user ? "user" : "guest",
        status,
        last_seen_at: new Date().toISOString()
      })
    }).catch(() => null);
    if (!participantResponse?.ok) return json({ error: "Chat presence is temporarily unavailable." }, 503);
    return setGuestCookie(json({ ok: true, status }), identity.guestCookie, identity.existingGuest);
  }

  const message = cleanMessage(body.message);
  const clientMessageId = String(body.clientMessageId || "").trim();
  if (!message || message.length > MAX_MESSAGE_LENGTH || /<\/?[a-z][^>]*>/i.test(message)) {
    return json({ error: "Enter a text-only comment up to 280 characters." }, 400);
  }
  if (!/^[A-Za-z0-9:_-]{16,160}$/.test(clientMessageId)) {
    return json({ error: "A unique comment key is required." }, 400);
  }

  const identity = await resolveIdentity(request, service);
  if (!identity) return json({ error: "Live identity could not be established." }, 503);
  const { user, existingGuest, guestCookie, subjectRef, displayName } = identity;
  if (blockedByRateLimit(subjectRef)) return json({ error: "Please wait a moment before sending another comment." }, 429);

  const blockResponse = await fetch(`${service.url}/rest/v1/live_chat_blocks?select=blocked_until&environment=eq.${environment}&live_session_id=eq.${encodeURIComponent(sessionId)}&subject_ref=eq.${encodeURIComponent(subjectRef)}&active=eq.true&limit=1`, {
    cache: "no-store",
    headers: serviceHeaders(service)
  }).catch(() => null);
  if (!blockResponse?.ok) return json({ error: "Chat availability could not be verified." }, 503);
  const [block] = await blockResponse.json() as Array<{ blocked_until?: string | null }>;
  if (block && (!block.blocked_until || new Date(block.blocked_until).getTime() > Date.now())) {
    return json({ error: "Chat is unavailable for this session." }, 403);
  }

  const participant = await fetch(`${service.url}/rest/v1/live_chat_participants`, {
    method: "POST",
    headers: serviceHeaders(service, "resolution=merge-duplicates,return=minimal"),
    body: JSON.stringify({
      live_session_id: sessionId,
      environment,
      subject_ref: subjectRef,
      user_id: user?.id || null,
      display_name: displayName,
      identity_type: user ? "user" : "guest",
      status: "present",
      last_seen_at: new Date().toISOString()
    })
  }).catch(() => null);
  if (!participant?.ok) return json({ error: "Chat is temporarily unavailable." }, 503);

  const commentResponse = await fetch(`${service.url}/rest/v1/live_comments`, {
    method: "POST",
    headers: serviceHeaders(service, "resolution=ignore-duplicates,return=representation"),
    body: JSON.stringify({
      live_session_id: sessionId,
      environment,
      subject_ref: subjectRef,
      user_id: user?.id || null,
      identity_type: user ? "user" : "guest",
      display_name: displayName,
      body: message,
      client_message_id: clientMessageId,
      status: "visible"
    })
  }).catch(() => null);
  if (!commentResponse?.ok) return json({ error: "Comment could not be saved." }, 503);
  const [comment] = await commentResponse.json() as Array<Record<string, unknown>>;
  if (!comment?.id) return json({ error: "That comment was already sent." }, 409);

  const response = json({
    event: {
      id: `comment:${String(comment.id)}`,
      type: "comment",
      displayName,
      message,
      createdAt: String(comment.created_at || new Date().toISOString())
    }
  });
  return setGuestCookie(response, guestCookie, existingGuest);
}
