import { NextResponse } from "next/server";
import { getGameAssetPack } from "@/lib/games/assets/registry";
import { gameServiceCredentials } from "@/lib/games/catalog";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: { slug: string } }) {
  const pack = getGameAssetPack(params.slug);
  if (!pack) return NextResponse.json({ assets: [] }, { status: 404 });
  const service = gameServiceCredentials();
  if (!service) return NextResponse.json({ assets: [] });
  const response = await fetch(`${service.url}/rest/v1/game_assets?select=slot_id,public_url,mime_type,file_name,updated_at&game_slug=eq.${encodeURIComponent(params.slug)}&enabled=eq.true`, {
    cache: "no-store",
    headers: { apikey: service.key, authorization: `Bearer ${service.key}` }
  });
  if (!response.ok) return NextResponse.json({ assets: [] });
  const rows = await response.json();
  return NextResponse.json({ assets: Array.isArray(rows) ? rows.map((row) => ({ slotId: row.slot_id, url: row.public_url, mimeType: row.mime_type, fileName: row.file_name, updatedAt: row.updated_at })) : [] });
}
