import { NextRequest, NextResponse } from "next/server";
import { createFirstAdmin } from "@/lib/admin-auth";
import { extractClientIp } from "@/lib/security";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const ipAddress = extractClientIp(request.headers);
  const userAgent = request.headers.get("user-agent") || "";

  try {
    await createFirstAdmin({
      username: String(form.get("username") || "").trim(),
      email: String(form.get("email") || "").trim().toLowerCase(),
      password: String(form.get("password") || ""),
      setupSecret: String(form.get("setupSecret") || ""),
      ipAddress,
      userAgent
    });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Setup failed." }, { status: 400 });
  }

  return NextResponse.redirect(new URL("/admin/login?setup=complete", request.url), { status: 303 });
}
