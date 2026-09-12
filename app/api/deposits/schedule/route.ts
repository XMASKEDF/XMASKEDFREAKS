import { NextRequest, NextResponse } from "next/server";
import { adminSessionCookie, auditAdminEvent, getAdminBySession } from "@/lib/admin-auth";
import { calculateNextDepositAt, depositScheduleOptions, DepositFrequency, formatDepositScheduleLabel } from "@/lib/deposit-schedule";
import { extractClientIp } from "@/lib/security";

type DepositScheduleRequest = {
  frequency?: DepositFrequency;
  lastDepositAt?: string;
};

export async function POST(request: NextRequest) {
  const admin = await getAdminBySession(request.cookies.get(adminSessionCookie)?.value);
  const ipAddress = extractClientIp(request.headers);
  const userAgent = request.headers.get("user-agent") || "unknown";

  if (!admin || admin.role !== "ADMIN") {
    return NextResponse.json({ ok: false, message: "ADMIN role required." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({} as DepositScheduleRequest));
  const frequency = body.frequency || "manual";
  const supported = depositScheduleOptions.some((option) => option.value === frequency);

  if (!supported) {
    return NextResponse.json({ ok: false, message: "Unsupported deposit frequency." }, { status: 422 });
  }

  const nextDepositAt = calculateNextDepositAt({
    frequency,
    lastDepositAt: body.lastDepositAt || new Date().toISOString()
  });

  await auditAdminEvent({
    adminUserId: admin.id,
    eventType: "deposit_schedule_saved",
    ipAddress,
    userAgent,
    metadata: {
      frequency,
      label: formatDepositScheduleLabel(frequency),
      nextDepositAt
    }
  });

  return NextResponse.json({
    ok: true,
    frequency,
    label: formatDepositScheduleLabel(frequency),
    nextDepositAt,
    message: nextDepositAt ? `Next scheduled payout is ${nextDepositAt}.` : "Manual deposits require administrator release."
  });
}
