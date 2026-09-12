import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { defaultVideoProviderConfig, VideoProviderConfig } from "@/lib/config";

function getAdminSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}

function normalizeSettings(body: Partial<VideoProviderConfig>) {
  return {
    provider: body.provider || defaultVideoProviderConfig.provider,
    mux_playback_id: body.muxPlaybackId || "",
    bunny_library_id: body.bunnyLibraryId || "",
    bunny_video_id: body.bunnyVideoId || "",
    bunny_hostname: body.bunnyHostname || defaultVideoProviderConfig.bunnyHostname,
    cloudflare_customer_subdomain: body.cloudflareCustomerSubdomain || "",
    cloudflare_video_id: body.cloudflareVideoId || "",
    fallback_url: body.fallbackUrl || "",
    updated_at: new Date().toISOString()
  };
}

export async function GET() {
  const supabase = getAdminSupabase();
  if (!supabase) {
    return NextResponse.json({ settings: defaultVideoProviderConfig });
  }

  const { data, error } = await supabase.from("stream_settings").select("*").eq("id", 1).single();
  if (error || !data) {
    return NextResponse.json({ settings: defaultVideoProviderConfig });
  }

  return NextResponse.json({
    settings: {
      provider: data.provider,
      muxPlaybackId: data.mux_playback_id || "",
      bunnyLibraryId: data.bunny_library_id || "",
      bunnyVideoId: data.bunny_video_id || "",
      bunnyHostname: data.bunny_hostname || defaultVideoProviderConfig.bunnyHostname,
      cloudflareCustomerSubdomain: data.cloudflare_customer_subdomain || "",
      cloudflareVideoId: data.cloudflare_video_id || "",
      fallbackUrl: data.fallback_url || ""
    }
  });
}

export async function POST(request: NextRequest) {
  const supabase = getAdminSupabase();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase service role key is not configured." }, { status: 503 });
  }

  const body = (await request.json()) as Partial<VideoProviderConfig>;
  const { error } = await supabase
    .from("stream_settings")
    .upsert({ id: 1, ...normalizeSettings(body) });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
