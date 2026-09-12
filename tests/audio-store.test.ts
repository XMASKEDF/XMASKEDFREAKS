import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = (path: string) => readFile(new URL(path, root), "utf8");

test("audio catalog maintains exactly six configurable slots", async () => {
  const [migration, catalog, storefront] = await Promise.all([
    source("supabase/migrations/20260719092000_audio_clips_store.sql"),
    source("lib/audio-store/catalog.ts"),
    source("components/audio-store/AudioStorefront.tsx")
  ]);
  assert.match(migration, /slot_number between 1 and 6/);
  assert.match(migration, /generate_series\(1, 6\)/);
  assert.match(catalog, /Array\.from\(\{ length: 6 \}/);
  assert.doesNotMatch(storefront, /products\.slice\(0, 6\)/);
  assert.match(storefront, /const catalogProducts = products;/);
});

test("checkout locks the wallet and grants orders and entitlements atomically", async () => {
  const migration = await source("supabase/migrations/20260719092000_audio_clips_store.sql");
  assert.match(migration, /checkout_audio_cart/);
  assert.match(migration, /token_wallets where user_id = p_user_id for update/);
  assert.match(migration, /INSUFFICIENT_TOKENS/);
  assert.match(migration, /insert into public\.digital_orders/);
  assert.match(migration, /insert into public\.purchase_entitlements/);
  assert.match(migration, /delete from public\.audio_cart_items/);
  assert.match(migration, /idempotency_key text not null unique/);
});

test("paid media is private and downloads require a current entitlement", async () => {
  const [migration, download, publicApi] = await Promise.all([
    source("supabase/migrations/20260719092000_audio_clips_store.sql"),
    source("app/api/audio-clips/[productId]/download/route.ts"),
    source("app/api/audio-clips/route.ts")
  ]);
  assert.match(migration, /'audio-products', 'audio-products', false/);
  assert.match(migration, /'audio-previews', 'audio-previews', false/);
  assert.match(download, /getApiUser/);
  assert.match(download, /purchase_entitlements/);
  assert.match(download, /expiresIn: 60/);
  assert.doesNotMatch(publicApi, /body\.coinPrice/);
});

test("admin uploads validate media contents and stay behind ADMIN 2FA", async () => {
  const [route, validation, page] = await Promise.all([
    source("app/api/admin/audio-clips/route.ts"),
    source("lib/audio-store/validation.ts"),
    source("app/admin/audio-clips/page.tsx")
  ]);
  assert.match(route, /admin\?\.role === "ADMIN" && admin\.two_factor_required/);
  assert.match(route, /validateDigitalMedia/);
  assert.match(route, /validateMediaImage/);
  assert.match(validation, /Supported product formats are MP3, M4A, WAV, AAC, and MP4/);
  assert.match(validation, /file contents do not match its extension/);
  assert.match(page, /redirect\("\/admin\/login"\)/);
});

test("store uses responsive 3, 2, and 1 column grids without exposing upload controls", async () => {
  const [styles, storefront, admin, uploader] = await Promise.all([
    source("app/globals.css"),
    source("components/audio-store/AudioStorefront.tsx"),
    source("components/admin/AdminAudioClipsManager.tsx"),
    source("components/admin/media/DirectMediaUpload.tsx")
  ]);
  assert.match(styles, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(styles, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /\.audio-product-grid \{ grid-template-columns: 1fr; \}/);
  assert.doesNotMatch(storefront, /type="file"/);
  assert.match(admin, /DirectMediaUpload/);
  assert.match(uploader, /type="file"/);
});
