import MerchStorefront from "@/components/merch/MerchStorefront";
import { getMerchCatalog } from "@/lib/commerce/catalog";

export const dynamic = "force-dynamic";

export default async function MerchPage() {
  const merch = await getMerchCatalog(false);
  return <MerchStorefront categories={merch.categories} products={merch.products} languages={merch.languages} />;
}
