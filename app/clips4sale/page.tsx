import type { Metadata } from "next";
import Clips4SalePage from "@/components/external/Clips4SalePage";
import { getExternalPlatforms } from "@/lib/external-platforms";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Clips4Sale | XMASKEDFREAKS", description: "Browse XMASKEDFREAKS video releases on Clips4Sale." };
export default async function Page() { const data = await getExternalPlatforms(false); return <Clips4SalePage settings={data.settings} clips={data.clips} />; }

