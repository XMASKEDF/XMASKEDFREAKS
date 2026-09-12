import "server-only";
import { serviceCredentials, serviceHeaders } from "@/lib/api-user";
import { fallbackFeetPresets, type FeetRequest, type FeetRequestPreset, safeFeetPresetStatus, safeFeetStatus } from "@/lib/feet/types";

function mapPreset(row: Record<string, unknown>): FeetRequestPreset {
  return { id: String(row.id), name: String(row.name || "Feet Request"), slug: String(row.slug || row.id), thumbnailUrl: row.thumbnail_url ? String(row.thumbnail_url) : null, description: String(row.description || ""), coinPrice: Math.max(1, Math.floor(Number(row.coin_price || 0))), status: safeFeetPresetStatus(row.status), displayOrder: Math.max(1, Math.floor(Number(row.display_order || 1))), createdAt: String(row.created_at || ""), updatedAt: String(row.updated_at || ""), downloadMediaId: row.download_media_asset_id ? String(row.download_media_asset_id) : null, downloadFilePath: row.download_file_path ? String(row.download_file_path) : null, downloadMimeType: row.download_mime_type ? String(row.download_mime_type) : null, downloadExtension: row.download_extension ? String(row.download_extension) : null, downloadFileSize: row.download_file_size == null ? null : Number(row.download_file_size), thumbnailMediaId: row.thumbnail_media_asset_id ? String(row.thumbnail_media_asset_id) : null };
}

function mapRequest(row: Record<string, unknown>): FeetRequest {
  return { id: String(row.id), presetId: row.preset_id ? String(row.preset_id) : null, customerId: row.customer_id ? String(row.customer_id) : null, customerReference: String(row.customer_reference || row.customer_id || "Customer"), presetName: String(row.preset_name_snapshot || "Feet Request"), presetDescription: String(row.preset_description_snapshot || ""), thumbnailUrl: row.thumbnail_url_snapshot ? String(row.thumbnail_url_snapshot) : null, requestDetails: String(row.request_details || ""), coinsPaid: Math.max(0, Math.floor(Number(row.coins_paid || 0))), usdValueMinor: Math.max(0, Math.floor(Number(row.usd_value_minor || 0))), status: safeFeetStatus(row.status), createdAt: String(row.created_at || ""), updatedAt: String(row.updated_at || "") };
}

export async function getFeetPresets(includeAll = false) {
  const service = serviceCredentials();
  if (!service) return { configured: false, presets: fallbackFeetPresets.filter((preset) => includeAll || preset.status === "ACTIVE") };
  const visibility = includeAll ? "" : "&status=eq.ACTIVE";
  const response = await fetch(`${service.url}/rest/v1/feet_request_presets?select=*&order=display_order.asc${visibility}`, { cache: "no-store", headers: serviceHeaders(service) }).catch(() => null);
  if (!response?.ok) return { configured: false, presets: fallbackFeetPresets.filter((preset) => includeAll || preset.status === "ACTIVE") };
  return { configured: true, presets: (await response.json() as Record<string, unknown>[]).map(mapPreset) };
}

export async function getFeetRequests(customerId?: string) {
  const service = serviceCredentials();
  if (!service) return { configured: false, requests: [] as FeetRequest[] };
  const filter = customerId ? `&customer_id=eq.${encodeURIComponent(customerId)}` : "";
  const response = await fetch(`${service.url}/rest/v1/feet_requests?select=*&order=created_at.desc&limit=200${filter}`, { cache: "no-store", headers: serviceHeaders(service) }).catch(() => null);
  if (!response?.ok) return { configured: false, requests: [] as FeetRequest[] };
  return { configured: true, requests: (await response.json() as Record<string, unknown>[]).map(mapRequest) };
}
