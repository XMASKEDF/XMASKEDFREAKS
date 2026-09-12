import { NextResponse } from "next/server";
import { getPublicLiveOperationalSettings } from "@/lib/admin-operationalization";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true, settings: await getPublicLiveOperationalSettings() }, { headers: { "cache-control": "no-store" } });
}
