import { NextRequest, NextResponse } from "next/server";
import { adminSessionCookie, auditAdminEvent, getAdminBySession, revokeAllAdminSessions, revokeAdminSession } from "@/lib/admin-auth";
import { extractClientIp } from "@/lib/security";

export async function POST(request: NextRequest) {
  const token = request.cookies.get(adminSessionCookie)?.value;
  const admin = await getAdminBySession(token);
  if (admin) await revokeAllAdminSessions(admin);
  else await revokeAdminSession(token);
  await auditAdminEvent({
    adminUserId: admin?.id,
    eventType: "admin_logout_all_sessions",
    ipAddress: extractClientIp(request.headers),
    userAgent: request.headers.get("user-agent") || ""
  });
  const response = NextResponse.redirect(new URL("/admin/login?logout=1", request.url), { status: 303 });
  response.cookies.set(adminSessionCookie, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0
  });
  return response;
}
