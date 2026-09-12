import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getApiUser, serviceCredentials, serviceHeaders } from "@/lib/api-user";
import { extractClientIp } from "@/lib/security";
import { detectFeedbackLanguage, feedbackCategory, isClearlyAbusiveFeedback, normalizeFeedbackText, translateFeedbackForAdmin } from "@/lib/feedback";

export const runtime = "nodejs";
const attempts = new Map<string, { count: number; resetAt: number }>();

function rateLimited(key: string) {
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.resetAt < now) { attempts.set(key, { count: 1, resetAt: now + 60_000 }); return false; }
  current.count += 1;
  return current.count > 5;
}

export async function POST(request: NextRequest) {
  const ip = extractClientIp(request.headers);
  if (rateLimited(ip)) return NextResponse.json({ ok: false, error: "Please wait before sending more feedback." }, { status: 429 });
  const service = serviceCredentials();
  if (!service) return NextResponse.json({ ok: false, error: "Feedback is temporarily unavailable." }, { status: 503 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const text = normalizeFeedbackText(body.text);
  if (!text) return NextResponse.json({ ok: false, error: "Write a short message first." }, { status: 422 });
  if (isClearlyAbusiveFeedback(text)) return NextResponse.json({ ok: false, error: "Please remove threats, harassment, links, or prohibited language and try again." }, { status: 422 });
  const user = await getApiUser(request);
  const language = detectFeedbackLanguage(text);
  const translated = translateFeedbackForAdmin(text, language);
  const submissionKey = String(body.submissionKey || request.headers.get("idempotency-key") || createHash("sha256").update(`${user?.id || ip}:${text}`).digest("hex")).slice(0, 220);
  const insert = await fetch(`${service.url}/rest/v1/customer_feedback`, {
    method: "POST",
    headers: serviceHeaders(service, "resolution=ignore-duplicates,return=minimal"),
    body: JSON.stringify({ user_id: user?.id || null, category: feedbackCategory(body.category), original_text: text, original_language: language, english_translation: translated.text, translation_status: translated.status, submission_key: submissionKey })
  });
  if (!insert.ok && insert.status !== 409) return NextResponse.json({ ok: false, error: "Feedback could not be saved. Please try again." }, { status: 422 });
  await fetch(`${service.url}/rest/v1/customer_feedback_events`, { method: "POST", headers: serviceHeaders(service, "return=minimal"), body: JSON.stringify({ event_type: "submitted", category: feedbackCategory(body.category), metadata: { language, authenticated: Boolean(user) } }) }).catch(() => undefined);
  return NextResponse.json({ ok: true, duplicate: insert.status === 409 });
}
