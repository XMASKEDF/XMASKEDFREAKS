import { NextResponse } from "next/server";
import { getMaintenanceSettings, publicMaintenanceSettings } from "@/lib/maintenance";

export const dynamic = "force-dynamic";
export async function GET() {
  return NextResponse.json(publicMaintenanceSettings(await getMaintenanceSettings()), {
    headers: { "cache-control": "no-store, max-age=0" }
  });
}

export async function PATCH() {
  return NextResponse.json({ message: "Not found." }, { status: 404 });
}
