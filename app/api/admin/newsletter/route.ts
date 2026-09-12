import { NextRequest, NextResponse } from "next/server";
import { adminSessionCookie, getAdminBySession, hasAdminPermission } from "@/lib/admin-auth";
import { serviceCredentials, serviceHeaders } from "@/lib/api-user";

async function authorize(request: NextRequest) {
  const admin = await getAdminBySession(request.cookies.get(adminSessionCookie)?.value);
  return admin && hasAdminPermission(admin, "admin.content.manage") ? admin : null;
}

export async function GET(request: NextRequest) {
  const admin = await authorize(request); const service = serviceCredentials();
  if (!admin) return NextResponse.json({ ok: false, error: "Admin access required." }, { status: 401 });
  if (!service) return NextResponse.json({ ok: true, subscribers: [] });
  const response = await fetch(`${service.url}/rest/v1/newsletter_subscribers?select=id,email,language_code,consent_status,source,subscribed_at,last_email_sent_at,delivery_status&order=subscribed_at.desc&limit=1000`, { headers: serviceHeaders(service) });
  return NextResponse.json({ ok: response.ok, subscribers: response.ok ? await response.json() : [] });
}
