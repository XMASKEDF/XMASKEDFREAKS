import { NextResponse } from "next/server";
import { getPublicHealthStatus } from "@/lib/infrastructure";

export const dynamic = "force-dynamic";

export async function GET() {
  const status = await getPublicHealthStatus();
  return NextResponse.json({
    status: status.status,
    checkedAt: status.checkedAt
  }, {
    headers: {
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow"
    }
  });
}
