import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { adminSessionCookie, auditAdminEvent, getAdminBySession } from "@/lib/admin-auth";
import { languageOptions, normalizeLocale } from "@/lib/i18n";

async function authorizedAdmin() {
  return getAdminBySession(cookies().get(adminSessionCookie)?.value);
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key) : null;
}

export async function GET() {
  const admin = await authorizedAdmin();
  if (!admin || admin.role !== "ADMIN") return NextResponse.json({ code: "ADMIN_UNAUTHORIZED" }, { status: 401 });
  const supabase = serviceClient();
  const { data: entries = [] } = supabase
    ? await supabase.from("translation_entries").select("translation_key,locale,value,status,updated_at,updated_by").order("translation_key")
    : { data: [] };
  const { data: missing = [] } = supabase
    ? await supabase.from("missing_translation_logs").select("translation_key,locale,route,created_at").order("created_at", { ascending: false }).limit(100)
    : { data: [] };
  return NextResponse.json({ locales: languageOptions, entries, missing });
}

export async function PATCH(request: NextRequest) {
  const admin = await authorizedAdmin();
  if (!admin || admin.role !== "ADMIN") return NextResponse.json({ code: "ADMIN_UNAUTHORIZED" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { key?: string; locale?: string; value?: string; status?: string };
  const translationKey = String(body.key || "").trim();
  const locale = normalizeLocale(body.locale);
  const value = String(body.value || "").trim();
  if (!/^[a-zA-Z0-9_.-]+$/.test(translationKey) || !value || value.length > 4000) {
    return NextResponse.json({ code: "TRANSLATION_INVALID" }, { status: 400 });
  }
  const supabase = serviceClient();
  if (!supabase) return NextResponse.json({ code: "TRANSLATION_STORAGE_UNAVAILABLE" }, { status: 503 });
  const { error } = await supabase.from("translation_entries").upsert({
    translation_key: translationKey,
    locale,
    value,
    status: body.status === "draft" ? "draft" : "published",
    updated_by: admin.id,
    updated_at: new Date().toISOString()
  }, { onConflict: "translation_key,locale" });
  if (error) return NextResponse.json({ code: "TRANSLATION_SAVE_FAILED" }, { status: 500 });
  await auditAdminEvent({ adminUserId: admin.id, eventType: "translation_updated", ipAddress: "server-recorded", userAgent: request.headers.get("user-agent") || "unknown", metadata: { translationKey, locale } });
  return NextResponse.json({ ok: true });
}
