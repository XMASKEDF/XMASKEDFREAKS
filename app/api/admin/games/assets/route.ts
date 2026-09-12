import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { adminSessionCookie, auditAdminEvent, getAdminBySession } from "@/lib/admin-auth";
import { getGameAssetPack } from "@/lib/games/assets/registry";
import { gameServiceCredentials } from "@/lib/games/catalog";
import { extractClientIp } from "@/lib/security";
import { getObjectStorageProvider, storageAvailableForProduction } from "@/lib/infrastructure/storage";

const limits = new Map<string, { count: number; resetAt: number }>();
const extensions: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/avif": "avif", "image/gif": "gif",
  "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/aac": "aac", "audio/wav": "wav", "audio/ogg": "ogg"
};

async function authorize(request: NextRequest) {
  const admin = await getAdminBySession(request.cookies.get(adminSessionCookie)?.value);
  return admin?.role === "ADMIN" && admin.two_factor_required ? admin : null;
}

function isLimited(key: string) {
  const now = Date.now(); const item = limits.get(key);
  if (!item || item.resetAt < now) { limits.set(key, { count: 1, resetAt: now + 60_000 }); return false; }
  item.count += 1; return item.count > 10;
}

export async function POST(request: NextRequest) {
  const admin = await authorize(request); const ipAddress = extractClientIp(request.headers); const userAgent = request.headers.get("user-agent") || "unknown";
  if (!admin) return NextResponse.json({ error: "Authenticated ADMIN account with 2FA is required." }, { status: 401 });
  if (isLimited(`${admin.id}:${ipAddress}`)) return NextResponse.json({ error: "Too many asset operations." }, { status: 429 });
  const form = await request.formData(); const gameSlug = String(form.get("gameSlug") || ""); const slotId = String(form.get("slotId") || ""); const operation = String(form.get("operation") || "upload");
  const pack = getGameAssetPack(gameSlug); const slot = pack?.slots.find((item) => item.id === slotId); const service = gameServiceCredentials();
  if (!pack || !slot) return NextResponse.json({ error: "Unknown game asset slot." }, { status: 404 });
  if (!service) return NextResponse.json({ error: "Supabase service credentials are required for asset publishing." }, { status: 503 });
  if (!storageAvailableForProduction()) return NextResponse.json({ error: "An approved production storage provider is required for asset publishing." }, { status: 503 });
  try {
    if (operation === "restore") {
      const current = await fetch(`${service.url}/rest/v1/game_assets?select=storage_path&game_slug=eq.${encodeURIComponent(gameSlug)}&slot_id=eq.${encodeURIComponent(slotId)}`, { headers: { apikey: service.key, authorization: `Bearer ${service.key}` } }).then((response) => response.ok ? response.json() : []);
      await fetch(`${service.url}/rest/v1/game_assets?game_slug=eq.${encodeURIComponent(gameSlug)}&slot_id=eq.${encodeURIComponent(slotId)}`, { method: "DELETE", headers: { apikey: service.key, authorization: `Bearer ${service.key}` } });
      if (current[0]?.storage_path) await getObjectStorageProvider().delete(String(current[0].storage_path), "game-assets");
      await auditAdminEvent({ adminUserId: admin.id, eventType: "admin_game_asset_restored", ipAddress, userAgent, metadata: { gameSlug, slotId } });
      return NextResponse.json({ ok: true });
    }
    const file = form.get("asset");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose an asset file." }, { status: 400 });
    const extension = extensions[file.type];
    if (!extension || !slot.accept.split(",").includes(file.type)) return NextResponse.json({ error: `Unsupported file type for ${slot.label}.` }, { status: 400 });
    const max = slot.kind === "audio" ? 15 * 1024 * 1024 : 8 * 1024 * 1024;
    if (!file.size || file.size > max) return NextResponse.json({ error: `File must be under ${max / 1024 / 1024} MB.` }, { status: 400 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const objectPath = `${gameSlug}/${slot.category}/${slotId}/${Date.now()}-${randomUUID()}.${extension}`;
    const storage = getObjectStorageProvider();
    try {
      await storage.upload({ bucket: "game-assets", key: objectPath, body: bytes, originalFilename: file.name, mimeType: file.type, visibility: "PUBLIC", ownerId: admin.id, reference: `game_asset:${gameSlug}:${slotId}` });
    } catch {
      throw new Error("Asset upload failed. Apply the latest Supabase schema first.");
    }
    const publicUrl = storage.publicUrl?.(objectPath, "game-assets");
    if (!publicUrl) { await storage.delete(objectPath, "game-assets"); throw new Error("Asset public delivery is not configured."); }
    const record = { game_slug: gameSlug, pack_id: pack.id, slot_id: slotId, category: slot.category, asset_kind: slot.kind, file_name: file.name.slice(0, 180), mime_type: file.type, file_size: file.size, storage_path: objectPath, public_url: publicUrl, enabled: true, updated_by: admin.id, updated_at: new Date().toISOString() };
    const save = await fetch(`${service.url}/rest/v1/game_assets?on_conflict=game_slug,slot_id`, { method: "POST", headers: { apikey: service.key, authorization: `Bearer ${service.key}`, "content-type": "application/json", prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(record) });
    if (!save.ok) { await storage.delete(objectPath, "game-assets"); throw new Error("Asset registry update failed."); }
    await auditAdminEvent({ adminUserId: admin.id, eventType: "admin_game_asset_published", ipAddress, userAgent, metadata: { gameSlug, slotId, mimeType: file.type, fileSize: file.size } });
    return NextResponse.json({ ok: true, asset: { slotId, url: publicUrl, mimeType: file.type, fileName: file.name, updatedAt: record.updated_at } });
  } catch (error) {
    await auditAdminEvent({ adminUserId: admin.id, eventType: "admin_game_asset_failed", ipAddress, userAgent, metadata: { gameSlug, slotId, reason: error instanceof Error ? error.message : "unknown" } });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Asset operation failed." }, { status: 400 });
  }
}
