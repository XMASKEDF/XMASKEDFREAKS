import { getPaintingAuctions } from "@/lib/auctions/catalog";
import { getAudioProducts } from "@/lib/audio-store/catalog";
import { getMerchCatalog, getVerticalCatalog } from "@/lib/commerce/catalog";
import { getExternalPlatforms } from "@/lib/external-platforms";
import { getFeetPresets } from "@/lib/feet/server";

export type SearchRecord = {
  id: string;
  type: "merch" | "audio" | "painting" | "feet" | "clips4sale" | "upcoming" | "announcement";
  title: string;
  description: string;
  category: string;
  tags: string[];
  available: boolean;
  digital: boolean;
  physical: boolean;
  coinPrice: number | null;
  imageUrl: string;
  href: string;
  badge: string | null;
  publishedAt: string;
};

export async function publicSearchCatalog(): Promise<SearchRecord[]> {
  const [merch, audio, paintings, catalog, external, feet] = await Promise.all([
    getMerchCatalog(false),
    getAudioProducts(false),
    getPaintingAuctions(false),
    getVerticalCatalog(false),
    getExternalPlatforms(false),
    getFeetPresets(false)
  ]);
  const records: SearchRecord[] = [];
  for (const product of merch.products.filter((item) => item.active && item.published)) records.push({
    id: product.id, type: "merch", title: product.name, description: product.shortDescription, category: product.categoryName,
    tags: [product.sku, product.categoryName], available: product.inventoryQuantity > 0 || product.variants.some((item) => item.active && item.inventoryQuantity > 0),
    digital: false, physical: true, coinPrice: product.coinPrice, imageUrl: product.imageUrl, href: "/merch", badge: product.featured ? "Featured" : null, publishedAt: ""
  });
  for (const product of audio.filter((item) => item.active && item.published)) records.push({
    id: product.id, type: "audio", title: product.name, description: product.description, category: "AudioClips", tags: [product.mediaType, product.fileExtension || ""],
    available: true, digital: true, physical: false, coinPrice: product.coinPrice, imageUrl: product.thumbnailUrl, href: "/audio-clips", badge: null, publishedAt: ""
  });
  for (const painting of paintings.auctions.filter((item) => item.published)) records.push({
    id: painting.id, type: "painting", title: painting.title, description: painting.shortDescription, category: "Paintings", tags: [painting.artist, painting.medium],
    available: !["sold", "delivered", "cancelled"].includes(painting.status), digital: false, physical: true, coinPrice: painting.buyNowPrice || painting.currentBid,
    imageUrl: painting.images[painting.coverImageIndex] || painting.images[0] || "", href: `/paintings/${painting.slug}`, badge: painting.featured ? "Featured" : null, publishedAt: painting.startsAt
  });
  for (const preset of feet.presets.filter((item) => item.status === "ACTIVE")) records.push({
    id: preset.id, type: "feet", title: preset.name, description: preset.description, category: "Feet", tags: ["feet", "request"],
    available: true, digital: Boolean(preset.downloadMediaId || preset.downloadFilePath), physical: false, coinPrice: preset.coinPrice,
    imageUrl: preset.thumbnailUrl || "", href: `/feet?preset=${encodeURIComponent(preset.id)}`, badge: null, publishedAt: preset.createdAt || ""
  });
  for (const item of catalog.entries.filter((entry) => entry.status === "published")) records.push({
    id: item.id, type: item.category === "News" ? "announcement" : "upcoming", title: item.title, description: item.description, category: item.category,
    tags: [item.category], available: true, digital: false, physical: false, coinPrice: null, imageUrl: item.imageUrl, href: item.destinationUrl || "/upcoming",
    badge: item.pinned ? "Featured" : null, publishedAt: item.publishAt || ""
  });
  for (const clip of external.clips.filter((item) => item.published && item.productUrl)) records.push({
    id: clip.id, type: "clips4sale", title: clip.title, description: clip.description, category: "Clips4Sale", tags: ["clip", clip.duration],
    available: true, digital: true, physical: false, coinPrice: null, imageUrl: clip.thumbnailUrl, href: "/clips4sale", badge: clip.featured ? "Featured" : null, publishedAt: ""
  });
  return records;
}

export function filterSearchRecords(records: SearchRecord[], query: string, filter: string, sort: string) {
  const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const filtered = records.filter((record) => {
    if (filter !== "all" && filter !== "available" && filter !== "sold-out" && filter !== "digital" && filter !== "physical" && record.type !== filter) return false;
    if (filter === "available" && !record.available) return false;
    if (filter === "sold-out" && record.available) return false;
    if (filter === "digital" && !record.digital) return false;
    if (filter === "physical" && !record.physical) return false;
    const haystack = `${record.title} ${record.description} ${record.category} ${record.tags.join(" ")}`.toLocaleLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
  return filtered.sort((a, b) => {
    if (sort === "oldest") return a.publishedAt.localeCompare(b.publishedAt);
    if (sort === "price-low") return (a.coinPrice ?? Number.MAX_SAFE_INTEGER) - (b.coinPrice ?? Number.MAX_SAFE_INTEGER);
    if (sort === "price-high") return (b.coinPrice ?? -1) - (a.coinPrice ?? -1);
    if (query) {
      const exactA = a.title.toLocaleLowerCase() === query.toLocaleLowerCase() ? 1 : 0;
      const exactB = b.title.toLocaleLowerCase() === query.toLocaleLowerCase() ? 1 : 0;
      if (exactA !== exactB) return exactB - exactA;
    }
    return b.publishedAt.localeCompare(a.publishedAt);
  });
}
