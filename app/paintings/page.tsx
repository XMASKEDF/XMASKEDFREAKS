import PaintingsStorefront from "@/components/paintings/PaintingsStorefront";
import { getPaintingAuctions } from "@/lib/auctions/catalog";
export const dynamic = "force-dynamic";
export default async function PaintingsPage() { const data = await getPaintingAuctions(false); return <PaintingsStorefront auctions={data.auctions} serverTime={data.serverTime} />; }
