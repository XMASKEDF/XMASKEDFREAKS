import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import BrandLogo from "@/components/BrandLogo";
import AdminTipMenu from "@/components/admin/AdminTipMenu";
import { adminSessionCookie, getAdminBySession } from "@/lib/admin-auth";
import { serviceCredentials, serviceHeaders } from "@/lib/api-user";
import { DEFAULT_TIP_MENU_SETTINGS, DEFAULT_TIP_OPTIONS, normalizeTipMenuSettings, normalizeTipOptions, type TipMenuSettings } from "@/lib/tips";

export const dynamic = "force-dynamic";

export default async function AdminTipsPage() {
  const admin = await getAdminBySession(cookies().get(adminSessionCookie)?.value);
  if (!admin || admin.role !== "ADMIN") redirect("/admin/login");
  const service = serviceCredentials();
  let options = DEFAULT_TIP_OPTIONS;
  let settings: TipMenuSettings = DEFAULT_TIP_MENU_SETTINGS;
  if (service) {
    const [optionsResponse, settingsResponse] = await Promise.all([
      fetch(`${service.url}/rest/v1/tip_options?select=*&order=display_order.asc`, { cache: "no-store", headers: serviceHeaders(service) }),
      fetch(`${service.url}/rest/v1/tip_menu_settings?id=eq.1&select=*&limit=1`, { cache: "no-store", headers: serviceHeaders(service) })
    ]);
    if (optionsResponse.ok) {
      const rows = await optionsResponse.json() as Array<Record<string, unknown>>;
      options = normalizeTipOptions(rows.map((row) => ({ id: row.id, emoji: row.emoji, phrase: row.phrase, tokenCost: row.token_cost, enabled: row.enabled, displayOrder: row.display_order, featured: row.featured, temporaryAvailable: row.temporary_available, liveOnly: row.live_only, alertStyle: row.alert_style, soundStyle: row.sound_style, mediaId: row.media_id, artworkUrl: row.artwork_url })));
    }
    if (settingsResponse.ok) {
      const [row] = await settingsResponse.json() as Array<Record<string, unknown>>;
      if (row) settings = normalizeTipMenuSettings(row);
    }
  }
  return <main className="admin-page admin-tips-page"><header className="admin-header"><BrandLogo href="/admin" priority /><div><p className="kicker">ADMIN · Payments</p><h1>Tip Menu</h1><p>Token options, custom limits, refill behavior, alert styling, and availability. Signed in as {admin.username}.</p></div></header><AdminTipMenu initialOptions={options} initialSettings={settings} /></main>;
}
