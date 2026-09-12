import { NextRequest, NextResponse } from "next/server";
import { adminChallengeCookie, adminSessionCookie, beginAdminLogin, createAdminSession } from "@/lib/admin-auth";
import { extractClientIp } from "@/lib/security";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const ipAddress = extractClientIp(request.headers);
  const userAgent = request.headers.get("user-agent") || "";

  try {
    const login = await beginAdminLogin({
      identifier: String(form.get("identifier") || "").trim(),
      password: String(form.get("password") || ""),
      rememberDevice: form.get("rememberDevice") === "on",
      ipAddress,
      userAgent
    });
    if (login.requiresTwoFactor) {
      const response = NextResponse.redirect(new URL("/admin/verify", request.url), { status: 303 });
      response.cookies.set(adminChallengeCookie, login.challengeToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/admin",
        maxAge: 10 * 60
      });
      return response;
    }
    const rememberDevice = form.get("rememberDevice") === "on";
    const token = await createAdminSession(login.admin, ipAddress, userAgent, rememberDevice);
    const response = NextResponse.redirect(new URL(login.admin.first_setup_completed ? "/admin" : "/admin/welcome", request.url), { status: 303 });
    response.cookies.set(adminSessionCookie, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: rememberDevice ? 30 * 24 * 60 * 60 : 12 * 60 * 60
    });
    return response;
  } catch {
    const url = new URL("/admin/login", request.url);
    url.searchParams.set("error", "Invalid admin credentials.");
    return NextResponse.redirect(url, { status: 303 });
  }
}
