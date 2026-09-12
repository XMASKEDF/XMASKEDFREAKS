import { NextRequest, NextResponse } from "next/server";
import { getApiUser, serviceCredentials, serviceHeaders } from "@/lib/api-user";

export const dynamic = "force-dynamic";

async function fetchRows(url: string, headers: Record<string, string>) {
  const response = await fetch(url, { cache: "no-store", headers }).catch(() => null);
  return response?.ok ? await response.json() as Record<string, unknown>[] : [];
}

export async function GET(request: NextRequest) {
  const service = serviceCredentials();
  if (!service) return NextResponse.json({ notifications: [], unread: 0, announcements: [] });
  const headers = serviceHeaders(service);
  const user = await getApiUser(request);
  const now = new Date().toISOString();
  const [notifications, announcements] = await Promise.all([
    user ? fetchRows(`${service.url}/rest/v1/customer_notifications?user_id=eq.${user.id}&dismissed_at=is.null&or=(expires_at.is.null,expires_at.gt.${now})&select=id,notification_type,title,message,image_url,destination_url,priority,read_at,created_at&order=read_at.asc.nullsfirst,created_at.desc&limit=50`, headers) : Promise.resolve([]),
    fetchRows(`${service.url}/rest/v1/site_announcements?published=eq.true&and=(or(starts_at.is.null,starts_at.lte.${now}),or(ends_at.is.null,ends_at.gt.${now}))&select=id,title,message,image_url,destination_url,priority,created_at&order=priority.desc,created_at.desc&limit=10`, headers)
  ]);
  return NextResponse.json({ notifications, unread: notifications.filter((item) => !item.read_at).length, announcements });
}

export async function PATCH(request: NextRequest) {
  const user = await getApiUser(request);
  if (!user) return NextResponse.json({ error: "Sign in to update notifications." }, { status: 401 });
  const service = serviceCredentials();
  if (!service) return NextResponse.json({ error: "Notifications are unavailable." }, { status: 503 });
  const body = await request.json().catch(() => ({})) as { action?: string; id?: string };
  const action = body.action || "";
  const idFilter = action === "read-all" ? "" : `&id=eq.${encodeURIComponent(body.id || "")}`;
  if (!["read","read-all","dismiss"].includes(action) || (action !== "read-all" && !body.id)) return NextResponse.json({ error: "Invalid notification action." }, { status: 400 });
  const patch = action === "dismiss" ? { dismissed_at: new Date().toISOString() } : { read_at: new Date().toISOString() };
  const response = await fetch(`${service.url}/rest/v1/customer_notifications?user_id=eq.${user.id}${idFilter}`, {
    method: "PATCH", headers: serviceHeaders(service, "return=minimal"), body: JSON.stringify(patch)
  }).catch(() => null);
  return response?.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Notification update failed." }, { status: 422 });
}
