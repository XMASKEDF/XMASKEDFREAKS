import { NextResponse } from "next/server";
import { getReadinessStatus } from "@/lib/infrastructure";

export const dynamic = "force-dynamic";

export async function GET() {
  const readiness = await getReadinessStatus();
  return NextResponse.json({ ready: readiness.ready, status: readiness.status, checkedAt: readiness.checkedAt }, {
    status: readiness.ready ? 200 : 503,
    headers: { "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" }
  });
}
