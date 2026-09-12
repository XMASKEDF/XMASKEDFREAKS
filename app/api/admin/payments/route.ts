import { NextRequest, NextResponse } from "next/server";
import { adminSessionCookie, getAdminBySession, hasAdminPermission } from "@/lib/admin-auth";
import { getHostedPaymentsAdminData } from "@/lib/payments/admin";

export async function GET(request: NextRequest) {
  const admin = await getAdminBySession(request.cookies.get(adminSessionCookie)?.value);
  if (!admin || !hasAdminPermission(admin, "admin.commerce.manage")) {
    return NextResponse.json({ message: "Not found." }, { status: 404 });
  }
  return NextResponse.json(await getHostedPaymentsAdminData(), { headers: { "cache-control": "no-store" } });
}
