import { NextRequest, NextResponse } from "next/server";
import { adminSessionCookie, reauthenticateAdminSession } from "@/lib/admin-auth";
import { extractClientIp } from "@/lib/security";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as { password?: unknown };
  if (typeof body.password !== "string" || body.password.length > 256) {
    return NextResponse.json({ message: "Reauthentication failed." }, { status: 400 });
  }
  try {
    await reauthenticateAdminSession({
      token: request.cookies.get(adminSessionCookie)?.value,
      password: body.password,
      ipAddress: extractClientIp(request.headers),
      userAgent: request.headers.get("user-agent") || "unknown"
    });
    return NextResponse.json({ ok: true, validForMinutes: Math.max(1, Math.min(30, Number(process.env.ADMIN_REAUTH_MAX_MINUTES || 10))) });
  } catch {
    return NextResponse.json({ message: "Reauthentication failed." }, { status: 401 });
  }
}
