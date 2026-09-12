import { NextRequest, NextResponse } from "next/server";
import {
  completeAdminPasswordReset,
  requestAdminPasswordReset
} from "@/lib/admin-auth";
import { extractClientIp } from "@/lib/security";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const context = {
    ipAddress: extractClientIp(request.headers),
    userAgent: request.headers.get("user-agent") || ""
  };
  const token = String(form.get("token") || "");
  if (token) {
    try {
      await completeAdminPasswordReset(token, String(form.get("password") || ""), context);
      return NextResponse.redirect(new URL("/admin/login?reset=complete", request.url), { status: 303 });
    } catch (error) {
      const url = new URL("/admin/reset-password", request.url);
      url.searchParams.set("token", token);
      url.searchParams.set("error", error instanceof Error ? error.message : "Reset failed.");
      return NextResponse.redirect(url, { status: 303 });
    }
  }
  await requestAdminPasswordReset(String(form.get("email") || "").trim().toLowerCase(), context);
  return NextResponse.redirect(new URL("/admin/login?reset=requested", request.url), { status: 303 });
}
