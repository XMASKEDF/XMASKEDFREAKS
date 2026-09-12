import { serviceCredentials, serviceHeaders } from "@/lib/api-user";

export type ExternalPlatformSettings = {
  fanslyUrl: string;
  fanslyEnabled: boolean;
  fanslyButtonLabel: string;
  fanslyHandle: string;
  fanslyBiography: string;
  fanslyHeroImage: string;
  clipsStoreUrl: string;
  clipsButtonLabel: string;
  clipsBiography: string;
};

export type Clips4SaleItem = {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  duration: string;
  productUrl: string | null;
  sortOrder: number;
  published: boolean;
  featured: boolean;
};

export const fallbackExternalPlatformSettings: ExternalPlatformSettings = {
  // The public handle is a presentation setting; preserve the currently configured account destination.
  fanslyUrl: "https://fansly.com/1SexualTension",
  fanslyEnabled: true,
  fanslyButtonLabel: "JOIN CRAZY 8 ON FANSLY",
  fanslyHandle: "@XMASKEDFREAKS",
  fanslyBiography: "Ready to join Crazy 8? Our Fansly subscription gives you eight randomly selected videos every month, creating a new mix of XMASKEDFREAKS content each time. The selection is designed to keep the subscription unpredictable, entertaining, and worth returning to. Members can discover videos they may have missed, revisit standout moments, and experience a rotating monthly collection without having to choose every title individually. Join Crazy 8 and let us choose the eight videos waiting for you this month.",
  fanslyHeroImage: "/branding/optimized/mask-logo-1024.png",
  clipsStoreUrl: "https://www.clips4sale.com/studio/444327/xmaskedfreaks",
  clipsButtonLabel: "VIEW THE FULL STORE",
  clipsBiography: "That video was good, wasn’t it? The full experience is waiting for you on our Clips4Sale store. We add downloadable videos regularly and new releases can appear at any time. Clips4Sale is where our newest full-length videos usually arrive first, so you may find something there that has not appeared in the live experience yet. Browse the collection, choose the video that catches your attention, and download it directly through Clips4Sale."
};

export const fallbackClips4SaleItems: Clips4SaleItem[] = Array.from({ length: 6 }, (_, index) => ({
  id: `clip-${index + 1}`,
  title: `Masked Preview ${String(index + 1).padStart(2, "0")}`,
  description: "Preview this release, then use the exact product link once it is configured in ADMIN.",
  thumbnailUrl: `/assets/preview-${String(index % 4 + 1).padStart(2, "0")}.svg`,
  duration: ["08:44", "10:12", "06:35", "12:09", "09:18", "11:27"][index],
  productUrl: null,
  sortOrder: index + 1,
  published: true,
  featured: index === 0
}));

export function safeExternalUrl(value: string, expectedHost?: "fansly.com" | "clips4sale.com") {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    const hostname = url.hostname.toLowerCase();
    if (expectedHost && hostname !== expectedHost && !hostname.endsWith(`.${expectedHost}`)) return null;
    return url.toString();
  } catch { return null; }
}

function mapSettings(row: Record<string, unknown>): ExternalPlatformSettings {
  return {
    fanslyUrl: String(row.fansly_url || fallbackExternalPlatformSettings.fanslyUrl),
    fanslyEnabled: row.fansly_enabled !== false,
    fanslyButtonLabel: String(row.fansly_button_label || fallbackExternalPlatformSettings.fanslyButtonLabel),
    fanslyHandle: String(row.fansly_handle || fallbackExternalPlatformSettings.fanslyHandle),
    fanslyBiography: String(row.fansly_biography || fallbackExternalPlatformSettings.fanslyBiography),
    fanslyHeroImage: String(row.fansly_hero_image || fallbackExternalPlatformSettings.fanslyHeroImage),
    clipsStoreUrl: String(row.clips_store_url || fallbackExternalPlatformSettings.clipsStoreUrl),
    clipsButtonLabel: String(row.clips_button_label || fallbackExternalPlatformSettings.clipsButtonLabel),
    clipsBiography: String(row.clips_biography || fallbackExternalPlatformSettings.clipsBiography)
  };
}

export async function getExternalPlatforms(includeUnpublished = false) {
  const service = serviceCredentials();
  if (!service) return { configured: false, settings: fallbackExternalPlatformSettings, clips: fallbackClips4SaleItems };
  const headers = serviceHeaders(service);
  const [settingsResponse, clipsResponse] = await Promise.all([
    fetch(`${service.url}/rest/v1/external_platform_settings?select=*&id=eq.primary&limit=1`, { cache: "no-store", headers }),
    fetch(`${service.url}/rest/v1/clips4sale_items?select=*&order=sort_order.asc${includeUnpublished ? "" : "&published=eq.true"}`, { cache: "no-store", headers })
  ]).catch(() => [null, null] as const);
  if (!settingsResponse?.ok || !clipsResponse?.ok) return { configured: false, settings: fallbackExternalPlatformSettings, clips: fallbackClips4SaleItems };
  const settingsRows = await settingsResponse.json() as Record<string, unknown>[];
  const clipRows = await clipsResponse.json() as Record<string, unknown>[];
  return {
    configured: true,
    settings: settingsRows[0] ? mapSettings(settingsRows[0]) : fallbackExternalPlatformSettings,
    clips: clipRows.map((row) => ({ id: String(row.id), title: String(row.title), description: String(row.description || ""), thumbnailUrl: String(row.thumbnail_url || "/branding/optimized/mask-logo-512.png"), duration: String(row.duration || ""), productUrl: row.product_url ? String(row.product_url) : null, sortOrder: Number(row.sort_order || 0), published: Boolean(row.published), featured: Boolean(row.featured) }))
  };
}
