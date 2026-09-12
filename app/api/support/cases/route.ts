import { NextRequest, NextResponse } from "next/server";
import { createSupportCase, type SupportCategory, type SupportPriority } from "@/lib/support/cases";
import { getApiUser, serviceCredentials, serviceHeaders } from "@/lib/api-user";
import { extractClientIp } from "@/lib/security";

export const dynamic = "force-dynamic";
const categories = new Set<SupportCategory>(["ACCOUNT", "BILLING", "DOWNLOAD", "LIVE", "MERCHANDISE", "PAINTING", "SUBSCRIPTION", "WALLET", "OTHER"]);
const priorities = new Set<SupportPriority>(["LOW", "NORMAL", "HIGH", "URGENT"]);
const rateLimits = new Map<string, { count: number; resetAt: number }>();

function limited(key: string) {
  const now = Date.now();
  const current = rateLimits.get(key);
  if (!current || current.resetAt <= now) { rateLimits.set(key, { count: 1, resetAt: now + 60 * 60 * 1000 }); return false; }
  current.count += 1;
  return current.count > 5;
}

export async function GET(request: NextRequest) {
  const user = await getApiUser(request);
  if (!user) return NextResponse.json({ code: "AUTH_REQUIRED", message: "Sign in to view support cases." }, { status: 401 });
  const service = serviceCredentials();
  if (!service) return NextResponse.json({ cases: [], configured: false }, { headers: { "cache-control": "no-store" } });
  const response = await fetch(`${service.url}/rest/v1/support_cases?customer_id=eq.${encodeURIComponent(user.id)}&select=id,category,priority,status,subject,created_at,updated_at,first_response_at,resolved_at&order=updated_at.desc&limit=100`, { cache: "no-store", headers: serviceHeaders(service) }).catch(() => null);
  return NextResponse.json({ configured: true, cases: response?.ok ? await response.json() : [] }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const user = await getApiUser(request);
  if (!user) return NextResponse.json({ code: "AUTH_REQUIRED", message: "Sign in before opening a support case." }, { status: 401 });
  const ip = extractClientIp(request.headers);
  if (limited(`${user.id}:${ip}`)) return NextResponse.json({ code: "RATE_LIMITED", message: "Please wait before opening another case." }, { status: 429 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const category = String(body.category || "OTHER") as SupportCategory;
  const priority = String(body.priority || "NORMAL") as SupportPriority;
  const subject = String(body.subject || "").trim();
  const description = String(body.description || "").trim();
  if (!categories.has(category) || !priorities.has(priority) || subject.length < 3 || description.length < 10) return NextResponse.json({ code: "INVALID_CASE", message: "Choose a category and provide a subject and description." }, { status: 400 });
  const result = await createSupportCase({ customerId: user.id, category, priority, subject, description, language: String(body.language || "en").slice(0, 12), relatedOrderId: body.relatedOrderId ? String(body.relatedOrderId) : null, relatedProductId: body.relatedProductId ? String(body.relatedProductId) : null, relatedEntitlementId: body.relatedEntitlementId ? String(body.relatedEntitlementId) : null });
  if (!result.persisted) return NextResponse.json({ code: "SUPPORT_UNAVAILABLE", message: "Support cases are temporarily unavailable." }, { status: 503 });
  return NextResponse.json({ ok: true, caseId: result.id }, { status: 201 });
}
