import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { normalizeLocale } from "@/lib/i18n";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as { key?: string; locale?: string; route?: string };
  const key = String(body.key || "").trim().slice(0, 180);
  if (!/^[a-zA-Z0-9_.-]+$/.test(key)) return NextResponse.json({ ok: false }, { status: 400 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && serviceKey) {
    const supabase = createClient(url, serviceKey);
    await supabase.from("missing_translation_logs").insert({
      translation_key: key,
      locale: normalizeLocale(body.locale),
      route: String(body.route || "/").slice(0, 300)
    }).then(() => undefined, () => undefined);
  }
  return NextResponse.json({ ok: true });
}
