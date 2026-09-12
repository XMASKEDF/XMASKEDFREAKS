import { NextRequest, NextResponse } from "next/server";
import { adminSessionCookie, auditAdminEvent, getAdminBySession } from "@/lib/admin-auth";
import { extractClientIp } from "@/lib/security";

type BanRequest = {
  displayName?: string;
  userId?: string;
  reason?: string;
  durationHours?: number | "indefinitely";
  appealStatus?: string;
  action?: "ban" | "unban";
  banId?: string;
};

export async function POST(request: NextRequest) {
  const admin = await getAdminBySession(request.cookies.get(adminSessionCookie)?.value);
  const ipAddress = extractClientIp(request.headers);
  const userAgent = request.headers.get("user-agent") || "unknown";

  if (!admin || admin.role !== "ADMIN") {
    return NextResponse.json({ ok: false, message: "ADMIN role required." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({} as BanRequest));
  const action = body.action || "ban";

  if (action === "unban") {
    await auditAdminEvent({
      adminUserId: admin.id,
      eventType: "moderation_manual_unban",
      ipAddress,
      userAgent,
      metadata: { banId: body.banId || null, displayName: body.displayName || null }
    });

    return NextResponse.json({
      ok: true,
      action,
      message: "Manual unban recorded. Production should clear the matching moderation_bans row and related session blocks."
    });
  }

  const permanent = body.durationHours === "indefinitely";
  const hours = typeof body.durationHours === "number" ? Math.max(1, Math.min(8760, body.durationHours)) : null;

  if (!permanent && !hours) {
    return NextResponse.json({ ok: false, message: "Temporary bans require a valid duration." }, { status: 422 });
  }

  const expiresAt = permanent ? null : new Date(Date.now() + Number(hours) * 60 * 60 * 1000).toISOString();

  await auditAdminEvent({
    adminUserId: admin.id,
    eventType: permanent ? "moderation_permanent_ban" : "moderation_temporary_ban",
    ipAddress,
    userAgent,
    metadata: {
      displayName: body.displayName || null,
      reason: body.reason || "Policy violation",
      permanent,
      expiresAt,
      appealStatus: body.appealStatus || "not requested"
    }
  });

  return NextResponse.json({
    ok: true,
    action,
    ban: {
      displayName: body.displayName || "Unknown",
      reason: body.reason || "Policy violation",
      permanent,
      expiresAt,
      label: permanent ? "Banned Indefinitely" : "Temporary Ban"
    }
  });
}
