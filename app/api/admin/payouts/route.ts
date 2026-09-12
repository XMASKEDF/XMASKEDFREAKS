import { NextRequest, NextResponse } from "next/server";
import { adminSessionCookie, auditAdminEvent, getAdminBySession, hasAdminPermission, hasRecentAdminReauthentication } from "@/lib/admin-auth";
import { serviceCredentials, serviceHeaders } from "@/lib/api-user";
import { extractClientIp } from "@/lib/security";
import { submitPayout, type PayoutProvider } from "@/lib/payouts/provider";

export const dynamic = "force-dynamic";

function auth(request: NextRequest) { return getAdminBySession(request.cookies.get(adminSessionCookie)?.value); }
function safeNumber(value: unknown, fallback = 0) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }

async function readJson<T>(response: Response, fallback: T): Promise<T> { return response.ok ? response.json().catch(() => fallback) : fallback; }

export async function GET(request: NextRequest) {
  const admin = await auth(request);
  if (!admin || !hasAdminPermission(admin, "admin.operations.manage")) return NextResponse.json({ ok: false, error: "ADMIN session required." }, { status: 401 });
  const service = serviceCredentials();
  if (!service) return NextResponse.json({ ok: true, configured: false, sandbox: true, wallet: { current_balance_minor: 0, lifetime_gross_earnings_minor: 0, lifetime_net_earnings_minor: 0, deposited_total_minor: 0, pending_processor_minor: 0, reserve_minor: 0 }, settings: { provider: "provider_controlled", automatic_enabled: false, internal_sweep_hours: 1, minimum_payout_minor: 10000, destination_status: "not_configured", sandbox_mode: true }, requests: [] });
  const headers = serviceHeaders(service);
  const [settingsResponse, requestsResponse, walletResponse, ledgerResponse] = await Promise.all([
    fetch(`${service.url}/rest/v1/admin_payout_settings?select=*&id=eq.true&limit=1`, { headers, cache: "no-store" }),
    fetch(`${service.url}/rest/v1/admin_payout_requests?select=id,provider,mode,amount_minor,fee_minor,net_amount_minor,currency,destination_last4,status,provider_reference,failure_reason,requested_at,submitted_at,confirmed_at&order=created_at.desc&limit=100`, { headers, cache: "no-store" }),
    fetch(`${service.url}/rest/v1/admin_earnings_wallet?select=current_balance_minor,lifetime_gross_earnings_minor,lifetime_net_earnings_minor,deposited_total_minor,pending_processor_minor,reserve_minor,updated_at&id=eq.1&limit=1`, { headers, cache: "no-store" }),
    fetch(`${service.url}/rest/v1/admin_earnings_ledger?select=category,gross_amount_minor,verified_at,status&order=verified_at.desc&limit=5000`, { headers, cache: "no-store" })
  ]);
  const ledger = await readJson(ledgerResponse, []) as Array<{ category: string; gross_amount_minor: number; verified_at: string; status: string }>;
  const now = Date.now();
  const sumSince = (days: number) => ledger.filter((entry) => entry.status === "verified" && now - new Date(entry.verified_at).getTime() <= days * 86400000).reduce((sum, entry) => sum + Number(entry.gross_amount_minor || 0), 0);
  const categories = ledger.reduce<Record<string, number>>((result, entry) => { result[entry.category] = (result[entry.category] || 0) + Number(entry.gross_amount_minor || 0); return result; }, {});
  return NextResponse.json({ ok: true, configured: true, wallet: (await readJson(walletResponse, []))[0] || null, analytics: { today_minor: sumSince(1), seven_day_minor: sumSince(7), thirty_day_minor: sumSince(30), categories }, settings: (await readJson(settingsResponse, []))[0] || null, requests: await readJson(requestsResponse, []) });
}

export async function POST(request: NextRequest) {
  const ipAddress = extractClientIp(request.headers);
  const userAgent = request.headers.get("user-agent") || "unknown";
  const admin = await auth(request);
  if (!admin || !hasAdminPermission(admin, "admin.operations.manage")) return NextResponse.json({ ok: false, error: "ADMIN session required." }, { status: 401 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = String(body.action || "");
  const service = serviceCredentials();
  if (action === "request") {
    if (!await hasRecentAdminReauthentication(request.cookies.get(adminSessionCookie)?.value, 10)) return NextResponse.json({ ok: false, error: "Recent administrator reauthentication is required." }, { status: 403 });
    const amountMinor = Math.floor(safeNumber(body.amountMinor));
    if (amountMinor <= 0 || amountMinor > 100_000_000) return NextResponse.json({ ok: false, error: "Enter a valid payout amount." }, { status: 400 });
    const idempotencyKey = String(body.idempotencyKey || crypto.randomUUID());
    if (!service) return NextResponse.json({ ok: true, sandbox: true, status: "action_required", message: "Sandbox request recorded locally; no bank or provider transfer was attempted." });
    const settingsResponse = await fetch(`${service.url}/rest/v1/admin_payout_settings?select=*&id=eq.true&limit=1`, { headers: serviceHeaders(service), cache: "no-store" });
    const settings = ((await readJson(settingsResponse, [])) as Array<Record<string, unknown>>)[0];
    const minimum = safeNumber(settings?.minimum_payout_minor, 10000);
    if (amountMinor < minimum) return NextResponse.json({ ok: false, error: "The requested payout is below the configured minimum." }, { status: 400 });
    const provider = String(settings?.provider || "provider_controlled") as PayoutProvider;
    const result = await submitPayout({ provider, mode: settings?.sandbox_mode === false ? "production" : "sandbox", amountMinor, currency: "USD", destinationToken: String(settings?.provider_destination_token || "") || null, idempotencyKey });
    const response = await fetch(`${service.url}/rest/v1/admin_payout_requests`, { method: "POST", headers: serviceHeaders(service, "return=representation,resolution=ignore-duplicates"), body: JSON.stringify({ idempotency_key: idempotencyKey, provider, mode: settings?.sandbox_mode === false ? "production" : "sandbox", amount_minor: amountMinor, fee_minor: 0, net_amount_minor: amountMinor, currency: "USD", destination_last4: settings?.destination_last4 || null, status: result.status, provider_reference: result.providerReference || null, failure_reason: result.message, requested_by: admin.id }) });
    await auditAdminEvent({ adminUserId: admin.id, eventType: "admin_payout_requested", ipAddress, userAgent, metadata: { amountMinor, provider, status: result.status, idempotencyKey } });
    if (!response.ok) return NextResponse.json({ ok: false, error: "Payout request could not be recorded." }, { status: 502 });
    return NextResponse.json({ ok: true, payout: (await response.json())[0], message: result.message });
  }
  if (action === "settings") {
    const internalSweepHours = Math.max(1, Math.min(8, Math.floor(safeNumber(body.internalSweepHours, 1))));
    const update = { automatic_enabled: body.automaticEnabled === true, internal_sweep_hours: internalSweepHours, minimum_payout_minor: Math.max(0, Math.floor(safeNumber(body.minimumPayoutMinor, 10000))), updated_by: admin.id, updated_at: new Date().toISOString() };
    if (!service) return NextResponse.json({ ok: true, sandbox: true, settings: update });
    const response = await fetch(`${service.url}/rest/v1/admin_payout_settings?on_conflict=id`, { method: "POST", headers: serviceHeaders(service, "resolution=merge-duplicates,return=representation"), body: JSON.stringify({ id: true, ...update }) });
    await auditAdminEvent({ adminUserId: admin.id, eventType: "admin_payout_settings_updated", ipAddress, userAgent, metadata: { automaticEnabled: update.automatic_enabled, internalSweepHours } });
    return NextResponse.json({ ok: response.ok, settings: response.ok ? (await response.json())[0] : null }, { status: response.ok ? 200 : 502 });
  }
  if (action === "confirm") {
    if (!await hasRecentAdminReauthentication(request.cookies.get(adminSessionCookie)?.value, 10)) return NextResponse.json({ ok: false, error: "Recent administrator reauthentication is required." }, { status: 403 });
    if (!service || body.sandbox !== true) return NextResponse.json({ ok: false, error: "Provider confirmation must come from the approved settlement callback." }, { status: 409 });
    const payoutId = String(body.payoutId || "");
    if (!payoutId) return NextResponse.json({ ok: false, error: "Payout request is required." }, { status: 400 });
    const response = await fetch(`${service.url}/rest/v1/rpc/confirm_admin_payout`, { method: "POST", headers: serviceHeaders(service), body: JSON.stringify({ p_payout_request_id: payoutId, p_provider_reference: `sandbox-${payoutId.slice(0, 8)}` }) });
    const result = await response.json().catch(() => ({}));
    await auditAdminEvent({ adminUserId: admin.id, eventType: response.ok ? "admin_payout_confirmed_sandbox" : "admin_payout_confirmation_failed", ipAddress, userAgent, metadata: { payoutId } });
    return NextResponse.json({ ok: response.ok, result }, { status: response.ok ? 200 : 502 });
  }
  return NextResponse.json({ ok: false, error: "Unknown payout action." }, { status: 400 });
}
