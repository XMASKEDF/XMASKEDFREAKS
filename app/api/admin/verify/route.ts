import { NextRequest, NextResponse } from "next/server";
import {
  adminChallengeCookie,
  adminSessionCookie,
  completeAdminTwoFactor,
  createAdminSession
} from "@/lib/admin-auth";
import { extractClientIp } from "@/lib/security";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const challengeToken = request.cookies.get(adminChallengeCookie)?.value || "";
  try {
    const result = await completeAdminTwoFactor({
      challengeToken,
      code: String(form.get("code") || ""),
      ipAddress: extractClientIp(request.headers),
      userAgent: request.headers.get("user-agent") || ""
    });
    const token = await createAdminSession(
      result.admin,
      extractClientIp(request.headers),
      request.headers.get("user-agent") || "",
      result.rememberDevice
    );
    const response = NextResponse.redirect(new URL(result.admin.first_setup_completed ? "/admin" : "/admin/welcome", request.url), { status: 303 });
    response.cookies.set(adminSessionCookie, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: result.rememberDevice ? 30 * 86400 : 12 * 3600
    });
    response.cookies.set(adminChallengeCookie, "", { httpOnly: true, path: "/admin", maxAge: 0 });
    return response;
  } catch (error) {
    const url = new URL("/admin/verify", request.url);
    url.searchParams.set("error", error instanceof Error ? error.message : "Verification failed.");
    return NextResponse.redirect(url, { status: 303 });
  }
}
