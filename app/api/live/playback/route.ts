import { NextResponse } from "next/server";
import { getLivePlaybackRuntime } from "@/lib/infrastructure/live-playback";

export const dynamic = "force-dynamic";

function responseBody(body: Awaited<ReturnType<typeof getLivePlaybackRuntime>>) {
  return NextResponse.json(body, {
    headers: {
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow"
    }
  });
}

export async function GET() {
  return responseBody(await getLivePlaybackRuntime());
}
