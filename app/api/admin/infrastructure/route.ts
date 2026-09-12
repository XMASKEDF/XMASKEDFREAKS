import { NextRequest, NextResponse } from "next/server";
import { adminSessionCookie, auditAdminEvent, getAdminBySession, hasAdminPermission } from "@/lib/admin-auth";
import { featureFlagNames, featureFlagStates, getFeatureFlagProvider, getInfrastructureSnapshot, getJobQueueProvider } from "@/lib/infrastructure";
import { extractClientIp } from "@/lib/security";

export const dynamic = "force-dynamic";

async function authorized(request: NextRequest) {
  const admin = await getAdminBySession(request.cookies.get(adminSessionCookie)?.value);
  return admin && hasAdminPermission(admin, "admin.operations.manage") ? admin : null;
}

export async function GET(request: NextRequest) {
  if (!await authorized(request)) return NextResponse.json({ message: "Not found." }, { status: 404 });
  const snapshot = await getInfrastructureSnapshot();
  return NextResponse.json({ snapshot, jobs: await getJobQueueProvider().list() }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const admin = await authorized(request);
  if (!admin) return NextResponse.json({ message: "Not found." }, { status: 404 });
  const body = await request.json().catch(() => ({})) as { action?: string; jobId?: string; confirmed?: boolean; name?: string; state?: string; percentage?: number };
  const queue = getJobQueueProvider();
  let result;
  if (body.action === "retry-job") result = await queue.retry(String(body.jobId || ""));
  else if (body.action === "cancel-job") {
    if (body.confirmed !== true) return NextResponse.json({ message: "Confirmation is required to cancel a queued job." }, { status: 400 });
    result = await queue.cancel(String(body.jobId || ""));
  } else if (body.action === "refresh") return NextResponse.json({ snapshot: await getInfrastructureSnapshot(), jobs: await queue.list() });
  else if (body.action === "set-feature-flag") {
    if (!featureFlagNames.includes(body.name as typeof featureFlagNames[number]) || !featureFlagStates.includes(body.state as typeof featureFlagStates[number])) return NextResponse.json({ message: "Invalid feature flag change." }, { status: 400 });
    try {
      const flag = getFeatureFlagProvider().set(body.name as typeof featureFlagNames[number], body.state as typeof featureFlagStates[number], { percentage: body.percentage, changedBy: admin.username || admin.email });
      await auditAdminEvent({ adminUserId: admin.id, eventType: "admin_infrastructure_feature_flag_changed", ipAddress: extractClientIp(request.headers), userAgent: request.headers.get("user-agent") || "unknown", metadata: { name: flag.name, state: flag.state, percentage: flag.percentage, environment: flag.environment } });
      return NextResponse.json({ ok: true, flag, snapshot: await getInfrastructureSnapshot(), jobs: await queue.list() });
    } catch (error) { return NextResponse.json({ message: error instanceof Error ? error.message : "Feature flag change was not completed." }, { status: 409 }); }
  }
  else return NextResponse.json({ message: "Unsupported infrastructure action." }, { status: 400 });
  if (!result) return NextResponse.json({ message: "The job was not found or is not safe for this action." }, { status: 409 });
  await auditAdminEvent({ adminUserId: admin.id, eventType: `admin_infrastructure_${body.action}`, ipAddress: extractClientIp(request.headers), userAgent: request.headers.get("user-agent") || "unknown", metadata: { jobId: result.id, jobType: result.type, status: result.status, environment: result.environment } });
  return NextResponse.json({ ok: true, job: result, snapshot: await getInfrastructureSnapshot(), jobs: await queue.list() });
}
