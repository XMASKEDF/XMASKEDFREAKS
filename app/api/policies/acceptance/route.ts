import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getApiUser, serviceCredentials, serviceHeaders } from "@/lib/api-user";
import { extractClientIp } from "@/lib/security";

export async function POST(request: NextRequest) {
  const user = await getApiUser(request);
  if (!user) return NextResponse.json({ error: "Sign in to record policy acceptance." }, { status: 401 });
  const service = serviceCredentials();
  if (!service) return NextResponse.json({ error: "Policy storage is unavailable." }, { status: 503 });
  const body = await request.json().catch(() => ({})) as { method?: string };
  const headers = serviceHeaders(service);
  const response = await fetch(`${service.url}/rest/v1/policy_versions?status=eq.published&select=id,policy_documents!inner(requires_acceptance)&policy_documents.requires_acceptance=eq.true`, { headers });
  const versions = response.ok ? await response.json() as Array<{ id: string }> : [];
  const session = request.headers.get("authorization") || "";
  const hash = (value: string) => createHash("sha256").update(`${value}:${process.env.POLICY_ACCEPTANCE_SALT || "xmf-local"}`).digest("hex");
  if (versions.length) {
    const saved = await fetch(`${service.url}/rest/v1/policy_acceptances?on_conflict=user_id,policy_version_id`, { method: "POST", headers: serviceHeaders(service, "resolution=ignore-duplicates,return=minimal"), body: JSON.stringify(versions.map((version) => ({ user_id: user.id, policy_version_id: version.id, method: String(body.method || "account_creation").slice(0, 80), session_reference_hash: hash(session), ip_hash: hash(extractClientIp(request.headers)) }))) });
    if (!saved.ok) return NextResponse.json({ error: "Policy acceptance could not be recorded." }, { status: 422 });
  }
  return NextResponse.json({ ok: true, acceptedVersions: versions.length });
}
