import { mediaCredentials, mediaHeaders } from "@/lib/media/server";

export type SiteBrandingSettings = { logoMediaId: string | null; logoUrl: string };
export const DEFAULT_SITE_BRANDING: SiteBrandingSettings = { logoMediaId: null, logoUrl: "/branding/mask-logo.png" };

export async function getSiteBrandingSettings(): Promise<SiteBrandingSettings> {
  const service = mediaCredentials(); if (!service) return DEFAULT_SITE_BRANDING;
  const response = await fetch(`${service.url}/rest/v1/site_branding_settings?id=eq.default&select=*&limit=1`, { cache: "no-store", headers: mediaHeaders(service) }).catch(() => null);
  if (!response?.ok) return DEFAULT_SITE_BRANDING; const rows = await response.json(); const row = rows[0];
  return row ? { logoMediaId: row.logo_media_id || null, logoUrl: row.logo_url || DEFAULT_SITE_BRANDING.logoUrl } : DEFAULT_SITE_BRANDING;
}

