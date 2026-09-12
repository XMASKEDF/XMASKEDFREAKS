import { NextRequest, NextResponse } from "next/server";
import { adminSessionCookie, auditAdminEvent, getAdminBySession } from "@/lib/admin-auth";
import { mediaCredentials, mediaHeaders, safeMediaSlug } from "@/lib/media/server";
import { extractClientIp } from "@/lib/security";

async function authorize(request: NextRequest) { const admin = await getAdminBySession(request.cookies.get(adminSessionCookie)?.value); return admin?.role === "ADMIN" && admin.two_factor_required ? admin : null; }

async function parentPath(service: { url: string; key: string }, parentId: string | null) {
  if (!parentId) return ""; const response = await fetch(`${service.url}/rest/v1/media_folders?id=eq.${encodeURIComponent(parentId)}&select=path&limit=1`, { headers: mediaHeaders(service) }); const rows = response.ok ? await response.json() : []; if (!rows[0]) throw new Error("Parent folder not found."); return String(rows[0].path);
}

export async function POST(request: NextRequest) {
  const admin = await authorize(request); if (!admin) return NextResponse.json({ ok: false, error: "ADMIN access with 2FA is required." }, { status: 401 });
  const service = mediaCredentials(); if (!service) return NextResponse.json({ ok: false, error: "Supabase is not configured." }, { status: 503 });
  try {
    const body = await request.json().catch(() => ({})); const name = String(body.name || "").trim().slice(0, 80); const slug = safeMediaSlug(name, ""); if (!name || !slug) throw new Error("Folder name is required.");
    const parentId = body.parentId ? String(body.parentId) : null; const prefix = await parentPath(service, parentId); const path = prefix ? `${prefix}/${slug}` : slug;
    const response = await fetch(`${service.url}/rest/v1/media_folders`, { method: "POST", headers: mediaHeaders(service, { prefer: "return=representation" }), body: JSON.stringify({ name, slug, parent_id: parentId, path, created_by: admin.id }) });
    if (!response.ok) throw new Error("That folder path already exists.");
    await auditAdminEvent({ adminUserId: admin.id, eventType: "admin_media_folder_created", ipAddress: extractClientIp(request.headers), userAgent: request.headers.get("user-agent") || "unknown", metadata: { path } });
    return NextResponse.json({ ok: true, folder: (await response.json())[0] });
  } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to create folder." }, { status: 400 }); }
}

export async function PATCH(request: NextRequest) {
  const admin = await authorize(request); if (!admin) return NextResponse.json({ ok: false, error: "ADMIN access with 2FA is required." }, { status: 401 });
  const service = mediaCredentials(); if (!service) return NextResponse.json({ ok: false, error: "Supabase is not configured." }, { status: 503 });
  const body = await request.json().catch(() => ({})); const id = String(body.id || ""); const name = String(body.name || "").trim().slice(0, 80); const slug = safeMediaSlug(name, "");
  if (!/^[0-9a-f-]{36}$/i.test(id) || !slug) return NextResponse.json({ ok: false, error: "Valid folder and name are required." }, { status: 400 });
  const prefix = await parentPath(service, body.parentId ? String(body.parentId) : null); const path = prefix ? `${prefix}/${slug}` : slug;
  const response = await fetch(`${service.url}/rest/v1/media_folders?id=eq.${id}`, { method: "PATCH", headers: mediaHeaders(service), body: JSON.stringify({ name, slug, parent_id: body.parentId || null, path, archived: Boolean(body.archived), updated_at: new Date().toISOString() }) });
  return response.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, error: "Unable to rename or move folder." }, { status: 400 });
}

export async function DELETE(request: NextRequest) {
  const admin = await authorize(request); if (!admin) return NextResponse.json({ ok: false, error: "ADMIN access with 2FA is required." }, { status: 401 });
  const service = mediaCredentials(); if (!service) return NextResponse.json({ ok: false, error: "Supabase is not configured." }, { status: 503 });
  const id = request.nextUrl.searchParams.get("id") || "";
  const [assetsResponse, childrenResponse] = await Promise.all([fetch(`${service.url}/rest/v1/media_assets?folder_id=eq.${id}&select=id&limit=1`, { headers: mediaHeaders(service) }), fetch(`${service.url}/rest/v1/media_folders?parent_id=eq.${id}&select=id&limit=1`, { headers: mediaHeaders(service) })]);
  const assets = assetsResponse.ok ? await assetsResponse.json() : []; const children = childrenResponse.ok ? await childrenResponse.json() : [];
  if (assets.length || children.length) return NextResponse.json({ ok: false, error: "Only empty folders with no child folders can be deleted." }, { status: 409 });
  const response = await fetch(`${service.url}/rest/v1/media_folders?id=eq.${id}`, { method: "DELETE", headers: mediaHeaders(service) });
  return response.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, error: "Unable to delete folder." }, { status: 400 });
}

