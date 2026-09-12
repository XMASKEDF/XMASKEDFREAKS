import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = (path: string) => readFile(new URL(path, root), "utf8");

test("one immutable navigation source preserves the requested route order", async () => {
  const [navigation, header, publicNavigation, merch, live] = await Promise.all([
    source("lib/public-navigation.ts"), source("components/store/StoreHeader.tsx"), source("components/PublicNavigation.tsx"), source("components/merch/MerchStorefront.tsx"), source("components/LiveRoom.tsx")
  ]);
  const routes = ["/live", "/fansly", "/upcoming", "/merch", "/audio-clips", "/games", "/feet", "/paintings", "/feedback"];
  let previous = -1;
  for (const route of routes) {
    const position = navigation.indexOf(`href: \"${route}\"`);
    assert.ok(position > previous, `${route} must follow the requested order`);
    previous = position;
  }
  assert.equal(navigation.includes('href: "/clips4sale"'), false);
  assert.match(navigation, /as const/);
  assert.match(header, /PublicNavigation/);
  assert.ok(publicNavigation.indexOf("PUBLIC_NAVIGATION.map") < publicNavigation.indexOf("nav-search-link"), "Search must remain the final navigation control");
  assert.match(live, /PublicNavigation/);
  assert.doesNotMatch(merch, /PUBLIC_NAVIGATION\.(?:splice|pop|shift|sort)/);
});

test("every top-level destination has a directly loadable route", async () => {
  await Promise.all(["live", "fansly", "upcoming", "merch", "audio-clips", "games", "feet", "paintings", "feedback", "search"].map((route) => access(new URL(`app/${route}/page.tsx`, root))));
  await access(new URL("app/clips4sale/page.tsx", root));
});

test("Subscribe is the visitor label while the existing Fansly route remains unchanged", async () => {
  const [navigation, english] = await Promise.all([
    source("lib/public-navigation.ts"),
    source("public/locales/en.json").then(JSON.parse) as Promise<Record<string, string>>
  ]);
  assert.equal(english["nav.fansly"], "Subscribe");
  assert.match(navigation, /id: "fansly", href: "\/fansly", translationKey: "nav\.fansly"/);
});

test("external destinations are admin controlled and host validated", async () => {
  const [library, admin, clips, fansly] = await Promise.all([
    source("lib/external-platforms.ts"), source("components/admin/AdminExternalPlatforms.tsx"), source("components/external/Clips4SalePage.tsx"), source("components/external/FanslyPage.tsx")
  ]);
  assert.match(library, /url\.protocol !== "https:"/);
  assert.match(library, /expectedHost/);
  assert.match(admin, /Exact product URL/);
  assert.match(admin, /ImagePicker/);
  assert.match(clips, /clip\.productUrl/);
  assert.match(clips, /noopener noreferrer/);
  assert.match(fansly, /settings\.fanslyUrl/);
  assert.match(fansly, /settings\.fanslyHandle/);
  assert.match(library, /fanslyHandle: "@XMASKEDFREAKS"/);
});

test("painting auctions use server tiering, worldwide availability, and private fulfillment notes", async () => {
  const [types, publicCatalog, admin, migration, storefront] = await Promise.all([
    source("lib/auctions/types.ts"), source("lib/auctions/catalog.ts"), source("components/admin/AdminPaintingAuctions.tsx"), source("supabase/migrations/20260722090500_storefront_navigation_platforms_paintings.sql"), source("components/paintings/PaintingsStorefront.tsx")
  ]);
  assert.match(types, /automaticBidIncrement/);
  assert.match(migration, /increment_amount:=case/);
  assert.match(migration, /international_shipping = true/);
  assert.match(publicCatalog, /shippingNotes: includePrivate \?/);
  assert.match(admin, /Private fulfillment notes/);
  assert.match(admin, /ImagePicker/);
  assert.doesNotMatch(admin, />\s*Reserve\s*</);
  assert.doesNotMatch(admin, />\s*Increment\s*</);
  assert.doesNotMatch(storefront, /oneOfOne|1 of 1|One of one/i);
});

test("Upcoming Reel is isolated from MERCH and has persistent admin controls", async () => {
  const [merch, upcoming, admin, catalog] = await Promise.all([
    source("components/merch/MerchStorefront.tsx"), source("app/upcoming/page.tsx"), source("components/admin/AdminVerticalCatalog.tsx"), source("lib/commerce/catalog.ts")
  ]);
  assert.doesNotMatch(merch, /VerticalCatalog/);
  assert.match(upcoming, /VerticalCatalog/);
  assert.match(admin, /save-settings/);
  assert.match(admin, /Pause public reel/);
  assert.match(admin, /ImagePicker/);
  assert.match(catalog, /vertical_catalog_settings/);
});

test("shared Media Library powers new painting, external, reel, and MERCH controls", async () => {
  const sources = await Promise.all(["AdminPaintingAuctions", "AdminExternalPlatforms", "AdminVerticalCatalog", "AdminMerchManager"].map((name) => source(`components/admin/${name}.tsx`)));
  for (const value of sources) assert.match(value, /components\/admin\/media\/ImagePicker/);
});
