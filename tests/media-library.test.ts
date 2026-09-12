import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { MEDIA_MAX_FILE_SIZE, validateMediaImage } from "../lib/media/image-validation.ts";
import { safeMediaSlug, safeStoragePath } from "../lib/media/server.ts";

function png(width = 1280, height = 720) {
  const bytes = new Uint8Array(24); bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(bytes.buffer); view.setUint32(16, width); view.setUint32(20, height); return bytes;
}

test("validates real image signatures and dimensions", async () => {
  const result = await validateMediaImage(new File([png()], "approved.png", { type: "image/png" }));
  assert.equal(result.mimeType, "image/png"); assert.equal(result.width, 1280); assert.equal(result.height, 720); assert.match(result.contentHash, /^[a-f0-9]{64}$/);
});

test("rejects extension spoofing and corrupted image data", async () => {
  await assert.rejects(() => validateMediaImage(new File([png()], "spoofed.jpg", { type: "image/jpeg" })), /does not match/);
  await assert.rejects(() => validateMediaImage(new File([new Uint8Array([1, 2, 3])], "broken.png", { type: "image/png" })), /could not be decoded/);
});

test("enforces the 15 MB media limit", async () => {
  assert.equal(MEDIA_MAX_FILE_SIZE, 15 * 1024 * 1024);
  const oversized = new File([new Uint8Array(MEDIA_MAX_FILE_SIZE + 1)], "large.png", { type: "image/png" });
  await assert.rejects(() => validateMediaImage(oversized), /15 MB/);
});

test("generates safe slugs and non-user-controlled storage paths", () => {
  assert.equal(safeMediaSlug("../../Live Banner<script>"), "live-banner-script");
  const path = safeStoragePath("Game Thumbnails", "webp");
  assert.match(path, /^game-thumbnails\/\d{4}\/\d{2}\/\d+-[a-f0-9-]{36}\.webp$/);
  assert.equal(path.includes(".."), false);
});

test("media APIs enforce ADMIN sessions and server-side storage", async () => {
  const source = await readFile(new URL("../app/api/admin/media/route.ts", import.meta.url), "utf8");
  assert.match(source, /getAdminBySession/); assert.match(source, /two_factor_required/); assert.match(source, /SUPABASE_SERVICE_ROLE_KEY|mediaCredentials/);
  assert.match(source, /validateMediaImage/); assert.match(source, /content_hash/); assert.match(source, /DUPLICATE/); assert.doesNotMatch(source, /form\.get\("uploadedBy"\)/);
});

test("schema keeps originals private and tracks variants, usage, and audits", async () => {
  const schema = await readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8");
  for (const table of ["media_assets", "media_variants", "media_usage", "media_categories", "media_folders", "media_action_logs"]) assert.match(schema, new RegExp(`create table if not exists public\\.${table}`));
  assert.match(schema, /values \('media', 'media', false/); assert.match(schema, /content_hash text not null/); assert.match(schema, /unique \(usage_type, resource_id, field_name\)/);
});

test("connected image consumers record usage instead of copying files", async () => {
  const game = await readFile(new URL("../app/api/admin/games/[gameId]/route.ts", import.meta.url), "utf8"); const tips = await readFile(new URL("../app/api/admin/tips/route.ts", import.meta.url), "utf8");
  assert.match(game, /replaceMediaUsage/); assert.match(game, /Game Thumbnail/); assert.match(tips, /replaceMediaUsage/); assert.match(tips, /Tip Menu/);
});

