import type { Metadata } from "next";
import FanslyPage from "@/components/external/FanslyPage";
import { getExternalPlatforms } from "@/lib/external-platforms";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Fansly | XMASKEDFREAKS", description: "Join Crazy 8 and discover a rotating monthly XMASKEDFREAKS collection." };
export default async function Page() { const data = await getExternalPlatforms(false); return <FanslyPage settings={data.settings} />; }

