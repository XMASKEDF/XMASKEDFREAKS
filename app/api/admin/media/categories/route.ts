import { NextRequest, NextResponse } from "next/server";
import { adminSessionCookie, auditAdminEvent, getAdminBySession } from "@/lib/admin-auth";
import { mediaCredentials, mediaHeaders, safeMediaSlug } from "@/lib/media/server";
import { extractClientIp } from "@/lib/security";

async function authorize(request: NextRequest) { const admin = await getAdminBySession(request.cookies.get(adminSessionCookie)?.value); return admin?.role === "ADMIN" && admin.two_factor_required ? admin : null; }

export async function POST(request: NextRequest) {
  const admin = await authorize(request); if (!admin) return NextResponse.json({ ok: false, error: "ADMIN access with 2FA is required." }, { status: 401 });
  const service = mediaCredentials(); if (!service) return NextResponse.json({ ok: false, error: "Supabase is not configured." }, { status: 503 });
  const body = await request.json().catch(() => ({})); const name = String(body.name || "").trim().slice(0, 80); const slug = safeMediaSlug(String(body.slug || name), "");
  if (!name || !slug) return NextResponse.json({ ok: false, error: "Category name is required." }, { status: 400 });
  const row = { id: slug, name, slug, description: String(body.description || "").trim().slice(0, 500), icon: String(body.icon || "○").slice(0, 16), enabled: true, archived: false, display_order: Number(body.displayOrder || 100) };
  const response = await fetch(`${service.url}/rest/v1/media_categories`, { method: "POST", headers: mediaHeaders(service, { prefer: "return=representation" }), body: JSON.stringify(row) });
  if (!response.ok) return NextResponse.json({ ok: false, error: "Category name or slug is already in use." }, { status: 409 });
  await auditAdminEvent({ adminUserId: admin.id, eventType: "admin_media_category_created", ipAddress: extractClientIp(request.headers), userAgent: request.headers.get("user-agent") || "unknown", metadata: { slug } });
  return NextResponse.json({ ok: true, category: (await response.json())[0] });
}

export async function PATCH(request: NextRequest) {
  const admin = await authorize(request); if (!admin) return NextResponse.json({ ok: false, error: "ADMIN access with 2FA is required." }, { status: 401 });
  const service = mediaCredentials(); if (!service) return NextResponse.json({ ok: false, error: "Supabase is not configured." }, { status: 503 });
  const body = await request.json().catch(() => ({})); const id = safeMediaSlug(String(body.id || ""), ""); if (!id) return NextResponse.json({ ok: false, error: "Category is required." }, { status: 400 });
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.name === "string") patch.name = body.name.trim().slice(0, 80);
  if (typeof body.description === "string") patch.description = body.description.trim().slice(0, 500);
  if (typeof body.icon === "string") patch.icon = body.icon.slice(0, 16);
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
  if (typeof body.archived === "boolean") patch.archived = body.archived;
  if (Number.isInteger(body.displayOrder)) patch.display_order = body.displayOrder;
  const response = await fetch(`${service.url}/rest/v1/media_categories?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", headers: mediaHeaders(service, { prefer: "return=minimal" }), body: JSON.stringify(patch) });
  if (!response.ok) return NextResponse.json({ ok: false, error: "Unable to update category." }, { status: 400 });
  await auditAdminEvent({ adminUserId: admin.id, eventType: "admin_media_category_updated", ipAddress: extractClientIp(request.headers), userAgent: request.headers.get("user-agent") || "unknown", metadata: { id, fields: Object.keys(patch) } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const admin = await authorize(request); if (!admin) return NextResponse.json({ ok: false, error: "ADMIN access with 2FA is required." }, { status: 401 });
  const service = mediaCredentials(); if (!service) return NextResponse.json({ ok: false, error: "Supabase is not configured." }, { status: 503 });
  const id = safeMediaSlug(request.nextUrl.searchParams.get("id") || "", ""); const replacementId = safeMediaSlug(request.nextUrl.searchParams.get("replacementId") || "", "");
  const countResponse = await fetch(`${service.url}/rest/v1/media_assets?category_id=eq.${encodeURIComponent(id)}&status=neq.archived&select=id`, { headers: mediaHeaders(service) }); const assets = countResponse.ok ? await countResponse.json() : [];
  if (assets.length && !replacementId) return NextResponse.json({ ok: false, error: `Reassign ${assets.length} active image${assets.length === 1 ? "" : "s"} before deleting this category.` }, { status: 409 });
  if (assets.length) await fetch(`${service.url}/rest/v1/media_assets?category_id=eq.${encodeURIComponent(id)}`, { method: "PATCH", headers: mediaHeaders(service), body: JSON.stringify({ category_id: replacementId }) });
  const response = await fetch(`${service.url}/rest/v1/media_categories?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: mediaHeaders(service) });
  return response.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, error: "Unable to delete category." }, { status: 400 });
}

