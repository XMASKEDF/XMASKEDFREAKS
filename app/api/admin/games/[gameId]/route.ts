import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { adminSessionCookie, auditAdminEvent, getAdminBySession } from "@/lib/admin-auth";
import { extractClientIp } from "@/lib/security";
import { gameServiceCredentials, getDefaultGame, getGameById } from "@/lib/games/catalog";
import { validateGameThumbnail } from "@/lib/games/image-validation";
import { findMediaAsset, mediaCredentials, mediaHeaders, replaceMediaUsage } from "@/lib/media/server";
import { getObjectStorageProvider, storageAvailableForProduction } from "@/lib/infrastructure/storage";

const limits = new Map<string, { count: number; resetAt: number }>();

async function authorize(request: NextRequest) {
  const admin = await getAdminBySession(request.cookies.get(adminSessionCookie)?.value);
  return admin?.role === "ADMIN" && admin.two_factor_required ? admin : null;
}

function limited(key: string) {
  const now = Date.now(); const current = limits.get(key);
  if (!current || current.resetAt < now) { limits.set(key, { count: 1, resetAt: now + 60_000 }); return false; }
  current.count += 1; return current.count > 12;
}

async function saveCatalogRow(gameId: string, patch: Record<string, unknown>) {
  const service = gameServiceCredentials();
  const game = await getGameById(gameId) || getDefaultGame(gameId);
  if (!service) throw new Error("Supabase service credentials are required to save game settings.");
  if (!game) throw new Error("Unknown game.");
  const body = {
    id: game.id, slug: game.slug, title: game.title, kind: game.kind, category: game.category || "Arcade",
    difficulty: game.difficulty || "Medium", description: game.description || "", thumbnail_url: game.thumbnail || null,
    thumbnail_alt: game.thumbnailAlt, featured: Boolean(game.featured), hidden: Boolean(game.hidden), enabled: game.enabled,
    display_order: game.order, updated_at: new Date().toISOString(), ...patch
  };
  const response = await fetch(`${service.url}/rest/v1/game_catalog?on_conflict=id`, {
    method: "POST",
    headers: { apikey: service.key, authorization: `Bearer ${service.key}`, "content-type": "application/json", prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error("Unable to save the game record. Apply the latest Supabase schema first.");
}

export async function PATCH(request: NextRequest, { params }: { params: { gameId: string } }) {
  const admin = await authorize(request); const ipAddress = extractClientIp(request.headers); const userAgent = request.headers.get("user-agent") || "unknown";
  if (!admin) return NextResponse.json({ ok: false, error: "Authenticated ADMIN account with 2FA is required." }, { status: 401 });
  if (limited(`${admin.id}:${ipAddress}`)) return NextResponse.json({ ok: false, error: "Too many game-management requests." }, { status: 429 });
  const body = await request.json().catch(() => ({}));
  const allowed: Record<string, unknown> = {};
  if (typeof body.enabled === "boolean") allowed.enabled = body.enabled;
  if (typeof body.hidden === "boolean") allowed.hidden = body.hidden;
  if (typeof body.featured === "boolean") allowed.featured = body.featured;
  if (Number.isInteger(body.displayOrder) && body.displayOrder > 0 && body.displayOrder < 100) allowed.display_order = body.displayOrder;
  if (typeof body.category === "string") allowed.category = body.category.trim().slice(0, 40);
  if (typeof body.difficulty === "string") allowed.difficulty = body.difficulty.trim().slice(0, 24);
  try {
    await saveCatalogRow(params.gameId, allowed);
    await auditAdminEvent({ adminUserId: admin.id, eventType: "admin_game_updated", ipAddress, userAgent, metadata: { gameId: params.gameId, fields: Object.keys(allowed) } });
    return NextResponse.json({ ok: true });
  } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to update game." }, { status: 503 }); }
}

export async function POST(request: NextRequest, { params }: { params: { gameId: string } }) {
  const admin = await authorize(request); const ipAddress = extractClientIp(request.headers); const userAgent = request.headers.get("user-agent") || "unknown";
  if (!admin) return NextResponse.json({ ok: false, error: "Authenticated ADMIN account with 2FA is required." }, { status: 401 });
  if (limited(`${admin.id}:${ipAddress}`)) return NextResponse.json({ ok: false, error: "Too many thumbnail requests." }, { status: 429 });
  const form = await request.formData(); const operation = String(form.get("operation") || "save"); const game = await getGameById(params.gameId) || getDefaultGame(params.gameId);
  if (!game) return NextResponse.json({ ok: false, error: "Unknown game." }, { status: 404 });
  const alt = String(form.get("alt") || game.thumbnailAlt).trim().slice(0, 180);
  if (!alt) return NextResponse.json({ ok: false, error: "Thumbnail alt text is required." }, { status: 400 });
  try {
    if (operation === "remove") {
      const service = gameServiceCredentials();
      if (!service) throw new Error("Supabase service credentials are required.");
      const marker = "/storage/v1/object/public/game-thumbnails/";
      if (game.thumbnail?.includes(marker)) {
        const objectPath = decodeURIComponent(game.thumbnail.split(marker)[1]);
        if (objectPath.startsWith(`${game.slug}/`)) await getObjectStorageProvider().delete(objectPath, "game-thumbnails");
      }
      await saveCatalogRow(game.id, { thumbnail_url: null, thumbnail_alt: alt, thumbnail_width: null, thumbnail_height: null, thumbnail_mime_type: null, thumbnail_file_size: null, thumbnail_updated_at: new Date().toISOString(), thumbnail_updated_by: admin.id });
      const mediaService = mediaCredentials();
      if (mediaService) await fetch(`${mediaService.url}/rest/v1/media_usage?usage_type=eq.Game%20Thumbnail&resource_id=eq.${encodeURIComponent(game.id)}&field_name=eq.thumbnail`, { method: "DELETE", headers: mediaHeaders(mediaService) });
      await auditAdminEvent({ adminUserId: admin.id, eventType: "admin_game_thumbnail_removed", ipAddress, userAgent, metadata: { gameId: game.id } });
      return NextResponse.json({ ok: true, thumbnailUrl: getDefaultGame(game.id)?.thumbnail });
    }
    if (operation === "library") {
      const mediaId = String(form.get("mediaId") || ""); const asset = await findMediaAsset(mediaId);
      if (!asset || asset.status !== "published" || !asset.is_public) throw new Error("Choose a published public image from the Media Library.");
      if (!String(asset.mime_type).startsWith("image/")) throw new Error("The selected media record is not an image.");
      await saveCatalogRow(game.id, { thumbnail_url: asset.public_url, thumbnail_alt: alt, thumbnail_width: asset.width, thumbnail_height: asset.height, thumbnail_mime_type: asset.mime_type, thumbnail_file_size: asset.file_size, thumbnail_updated_at: new Date().toISOString(), thumbnail_updated_by: admin.id });
      await replaceMediaUsage({ mediaId, usageType: "Game Thumbnail", resourceId: game.id, route: `/games/${game.slug}`, fieldName: "thumbnail" });
      await auditAdminEvent({ adminUserId: admin.id, eventType: "admin_game_thumbnail_library_assigned", ipAddress, userAgent, metadata: { gameId: game.id, mediaId } });
      return NextResponse.json({ ok: true, thumbnailUrl: asset.public_url, width: asset.width, height: asset.height });
    }
    const file = form.get("thumbnail");
    if (!(file instanceof File)) {
      await saveCatalogRow(game.id, { thumbnail_alt: alt, thumbnail_updated_at: new Date().toISOString(), thumbnail_updated_by: admin.id });
      return NextResponse.json({ ok: true, thumbnailUrl: game.thumbnail });
    }
    const image = await validateGameThumbnail(file); const service = gameServiceCredentials();
    if (!service) throw new Error("Supabase service credentials are required for thumbnail uploads.");
    if (!storageAvailableForProduction()) throw new Error("An approved production storage provider is required for thumbnail uploads.");
    const objectPath = `${game.slug}/${Date.now()}-${randomUUID()}.${image.extension}`;
    const storage = getObjectStorageProvider();
    try {
      await storage.upload({ bucket: "game-thumbnails", key: objectPath, body: image.bytes, originalFilename: file.name, mimeType: image.mimeType, visibility: "PUBLIC", ownerId: admin.id, reference: `game_thumbnail:${game.id}` });
    } catch {
      throw new Error("Thumbnail storage upload failed. Confirm the game-thumbnails bucket exists.");
    }
    const thumbnailUrl = storage.publicUrl?.(objectPath, "game-thumbnails");
    if (!thumbnailUrl) { await storage.delete(objectPath, "game-thumbnails"); throw new Error("Thumbnail public delivery is not configured."); }
    try {
      await saveCatalogRow(game.id, { thumbnail_url: thumbnailUrl, thumbnail_alt: alt, thumbnail_width: image.width, thumbnail_height: image.height, thumbnail_mime_type: image.mimeType, thumbnail_file_size: image.fileSize, thumbnail_updated_at: new Date().toISOString(), thumbnail_updated_by: admin.id });
    } catch (error) {
      await storage.delete(objectPath, "game-thumbnails");
      throw error;
    }
    await auditAdminEvent({ adminUserId: admin.id, eventType: "admin_game_thumbnail_saved", ipAddress, userAgent, metadata: { gameId: game.id, width: image.width, height: image.height, mimeType: image.mimeType, fileSize: image.fileSize } });
    return NextResponse.json({ ok: true, thumbnailUrl, width: image.width, height: image.height });
  } catch (error) {
    await auditAdminEvent({ adminUserId: admin.id, eventType: "admin_game_thumbnail_failed", ipAddress, userAgent, metadata: { gameId: game.id, reason: error instanceof Error ? error.message : "unknown" } });
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Thumbnail operation failed." }, { status: 400 });
  }
}
