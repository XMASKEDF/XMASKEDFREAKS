import { NextRequest, NextResponse } from "next/server";
import {
  adminSessionCookie,
  completeAdminFirstSetup,
  getAdminBySession
} from "@/lib/admin-auth";
import { extractClientIp } from "@/lib/security";

export async function POST(request: NextRequest) {
  const admin = await getAdminBySession(request.cookies.get(adminSessionCookie)?.value);
  if (!admin) return NextResponse.json({ message: "Administrator session required." }, { status: 401 });
  const form = await request.formData();
  try {
    const recoveryCodes = await completeAdminFirstSetup({
      admin,
      displayName: String(form.get("displayName") || ""),
      recoveryEmail: String(form.get("recoveryEmail") || ""),
      currentPassword: String(form.get("currentPassword") || ""),
      newPassword: String(form.get("newPassword") || "") || undefined,
      ipAddress: extractClientIp(request.headers),
      userAgent: request.headers.get("user-agent") || ""
    });
    return NextResponse.json({ ok: true, recoveryCodes });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Setup failed." }, { status: 400 });
  }
}
