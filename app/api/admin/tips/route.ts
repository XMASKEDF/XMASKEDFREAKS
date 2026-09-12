import { NextRequest, NextResponse } from "next/server";
import { adminSessionCookie, auditAdminEvent, getAdminBySession } from "@/lib/admin-auth";
import { serviceCredentials, serviceHeaders } from "@/lib/api-user";
import { DEFAULT_TIP_MENU_SETTINGS, DEFAULT_TIP_OPTIONS, normalizeTipMenuSettings, normalizeTipOptions } from "@/lib/tips";
import { extractClientIp } from "@/lib/security";
import { findMediaAsset, mediaCredentials, mediaHeaders, replaceMediaUsage } from "@/lib/media/server";

async function authorize(request: NextRequest) {
  const admin = await getAdminBySession(request.cookies.get(adminSessionCookie)?.value).catch(() => null);
  return admin?.role === "ADMIN" ? admin : null;
}

export async function GET(request: NextRequest) {
  const admin = await authorize(request);
  if (!admin) return NextResponse.json({ ok: false, error: "ADMIN access required." }, { status: 403 });
  const service = serviceCredentials();
  if (!service) return NextResponse.json({ ok: true, persisted: false, options: DEFAULT_TIP_OPTIONS, settings: DEFAULT_TIP_MENU_SETTINGS });
  const [optionsResponse, settingsResponse] = await Promise.all([
    fetch(`${service.url}/rest/v1/tip_options?select=*&order=display_order.asc`, { cache: "no-store", headers: serviceHeaders(service) }),
    fetch(`${service.url}/rest/v1/tip_menu_settings?id=eq.1&select=*&limit=1`, { cache: "no-store", headers: serviceHeaders(service) })
  ]);
  const rows = optionsResponse.ok ? await optionsResponse.json() as Array<Record<string, unknown>> : [];
  const options = normalizeTipOptions(rows.map((row) => ({ id: row.id, emoji: row.emoji, phrase: row.phrase, tokenCost: row.token_cost, enabled: row.enabled, displayOrder: row.display_order, featured: row.featured, temporaryAvailable: row.temporary_available, liveOnly: row.live_only, alertStyle: row.alert_style, soundStyle: row.sound_style, mediaId: row.media_id, artworkUrl: row.artwork_url })));
  const [settingsRow] = settingsResponse.ok ? await settingsResponse.json() as Array<Record<string, unknown>> : [];
  return NextResponse.json({ ok: true, persisted: true, options, settings: normalizeTipMenuSettings(settingsRow || DEFAULT_TIP_MENU_SETTINGS) });
}

export async function PATCH(request: NextRequest) {
  const admin = await authorize(request);
  if (!admin) return NextResponse.json({ ok: false, error: "ADMIN access required." }, { status: 403 });
  const service = serviceCredentials();
  if (!service) return NextResponse.json({ ok: false, error: "Production tip storage is not configured." }, { status: 503 });
  const body = await request.json().catch(() => ({}));
  const option = DEFAULT_TIP_OPTIONS.find((item) => item.id === String(body.option?.id || ""));
  let response: Response | null = null;
  if (option) {
    const update = normalizeTipOptions([{ ...option, ...body.option }])[0];
    let mediaId: string | null = null; let artworkUrl = "";
    if (update.mediaId) {
      const asset = await findMediaAsset(update.mediaId);
      if (!asset || asset.status !== "published" || !asset.is_public) return NextResponse.json({ ok: false, error: "Tip artwork must be a published public Media Library image." }, { status: 400 });
      mediaId = String(asset.id); artworkUrl = String(asset.public_url);
    }
    response = await fetch(`${service.url}/rest/v1/tip_options?id=eq.${option.id}`, {
      method: "PATCH",
      headers: serviceHeaders(service, "return=minimal"),
      body: JSON.stringify({ emoji: update.emoji, phrase: update.phrase, token_cost: update.tokenCost, enabled: update.enabled, display_order: update.displayOrder, featured: update.featured, temporary_available: update.temporaryAvailable, live_only: update.liveOnly, alert_style: update.alertStyle, sound_style: update.soundStyle, media_id: mediaId, artwork_url: artworkUrl || null, updated_by: admin.id, updated_at: new Date().toISOString() })
    }).catch(() => null);
    if (response?.ok && mediaId) await replaceMediaUsage({ mediaId, usageType: "Tip Menu", resourceId: option.id, route: "/#live", fieldName: "artwork" });
    if (response?.ok && !mediaId) { const mediaService = mediaCredentials(); if (mediaService) await fetch(`${mediaService.url}/rest/v1/media_usage?usage_type=eq.Tip%20Menu&resource_id=eq.${encodeURIComponent(option.id)}&field_name=eq.artwork`, { method: "DELETE", headers: mediaHeaders(mediaService) }); }
  } else if (body.settings) {
    const settings = body.settings as Record<string, unknown>;
    response = await fetch(`${service.url}/rest/v1/tip_menu_settings?id=eq.1`, {
      method: "PATCH",
      headers: serviceHeaders(service, "return=minimal"),
      body: JSON.stringify({ low_balance_threshold: Math.max(0, Math.floor(Number(settings.lowBalanceThreshold || 20))), custom_tips_enabled: settings.customTipsEnabled !== false, minimum_custom_tokens: Math.max(1, Math.floor(Number(settings.minimumCustomTokens || 4))), maximum_custom_tokens: Math.max(1, Math.min(1000, Math.floor(Number(settings.maximumCustomTokens || 1000)))), refill_entry_point: String(settings.refillEntryPoint || "#coin-packages").slice(0, 160), require_confirmation: settings.requireConfirmation === true, updated_by: admin.id, updated_at: new Date().toISOString() })
    }).catch(() => null);
  }
  await auditAdminEvent({ adminUserId: admin.id, eventType: "tip_menu_configuration_updated", ipAddress: extractClientIp(request.headers), userAgent: request.headers.get("user-agent") || "unknown", metadata: { optionId: option?.id || null, success: Boolean(response?.ok) } });
  return NextResponse.json({ ok: Boolean(response?.ok) }, { status: response?.ok ? 200 : 503 });
}
