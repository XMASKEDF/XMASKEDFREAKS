import type { Metadata } from "next";
import StoreHeader from "@/components/store/StoreHeader";
import VerticalCatalog from "@/components/catalog/VerticalCatalog";
import UpcomingHero from "@/components/catalog/UpcomingHero";
import { getVerticalCatalog } from "@/lib/commerce/catalog";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Upcoming | XMASKEDFREAKS", description: "Upcoming merchandise, audio, paintings, video releases, and platform news." };
export default async function UpcomingPage() { const data = await getVerticalCatalog(false); return <main className="upcoming-page"><StoreHeader /><UpcomingHero /><VerticalCatalog entries={data.entries} speedSeconds={data.settings.speedSeconds} pausedByAdmin={data.settings.paused} /></main>; }
