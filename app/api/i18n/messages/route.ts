import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { normalizeLocale } from "@/lib/i18n";

export async function GET(request: NextRequest) {
  const locale = normalizeLocale(request.nextUrl.searchParams.get("locale"));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return NextResponse.json({ messages: {} });
  const supabase = createClient(url, serviceKey);
  const { data } = await supabase.from("translation_entries").select("translation_key,value").eq("locale", locale).eq("status", "published");
  const messages = Object.fromEntries((data || []).map((item) => [item.translation_key, item.value]));
  return NextResponse.json({ messages }, { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } });
}
