import { createHash, randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { serviceCredentials, serviceHeaders } from "@/lib/api-user";
import { filterSearchRecords, publicSearchCatalog } from "@/lib/site-search";
import { extractClientIp } from "@/lib/security";

export const dynamic = "force-dynamic";
const rates = new Map<string, { count: number; resetAt: number }>();
const allowedFilters = new Set(["all","merch","audio","painting","feet","clips4sale","upcoming","announcement","available","sold-out","digital","physical"]);
const allowedSorts = new Set(["newest","oldest","price-low","price-high"]);

function clean(value: string, max = 80) {
  return value.normalize("NFKC").replace(/[^\p{L}\p{N}\s_'&-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

async function logSearch(request: NextRequest, term: string, filter: string, resultCount: number, eventType = "search", contentType?: string, contentId?: string) {
  const service = serviceCredentials();
  if (!service) return;
  const sessionHash = createHash("sha256").update(`${extractClientIp(request.headers)}:${request.headers.get("user-agent") || ""}`).digest("hex");
  await fetch(`${service.url}/rest/v1/analytics_events`, {
    method: "POST", headers: serviceHeaders(service, "return=minimal"),
    body: JSON.stringify({ event_type: eventType, event_key: randomUUID(), anonymous_session_hash: sessionHash, page_path: "/search", search_term: term, result_count: resultCount, filter_value: filter, content_type: contentType || null, content_id: contentId || null, language_code: request.headers.get("accept-language")?.slice(0, 12) || null })
  }).catch(() => undefined);
}

export async function GET(request: NextRequest) {
  const ip = extractClientIp(request.headers);
  const now = Date.now();
  if (rates.size > 5_000) for (const [key, value] of rates) if (value.resetAt < now) rates.delete(key);
  const current = rates.get(ip);
  if (!current || current.resetAt < now) rates.set(ip, { count: 1, resetAt: now + 60_000 });
  else if (++current.count > 60) return NextResponse.json({ error: "Search is receiving too many requests. Try again shortly." }, { status: 429 });
  const query = clean(request.nextUrl.searchParams.get("q") || "");
  const filterValue = request.nextUrl.searchParams.get("filter") || "all";
  const sortValue = request.nextUrl.searchParams.get("sort") || "newest";
  const filter = allowedFilters.has(filterValue) ? filterValue : "all";
  const sort = allowedSorts.has(sortValue) ? sortValue : "newest";
  const page = Math.max(1, Math.min(100, Number(request.nextUrl.searchParams.get("page")) || 1));
  const pageSize = 12;
  const results = filterSearchRecords(await publicSearchCatalog(), query, filter, sort);
  await logSearch(request, query, filter, results.length);
  return NextResponse.json({ query, filter, sort, page, pageSize, total: results.length, pages: Math.max(1, Math.ceil(results.length / pageSize)), results: results.slice((page - 1) * pageSize, page * pageSize) });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  await logSearch(request, clean(String(body.query || "")), clean(String(body.filter || "all"), 30), Number(body.resultCount || 0), "search_result_click", clean(String(body.contentType || ""), 30), clean(String(body.contentId || ""), 160));
  return NextResponse.json({ ok: true });
}
