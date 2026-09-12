import { NextRequest, NextResponse } from "next/server";
import { serviceCredentials, serviceHeaders } from "@/lib/api-user";
import { recordReliabilityIncident } from "@/lib/reliability/server";

export async function POST(request: NextRequest) {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }
  const service = serviceCredentials();
  if (!service) return NextResponse.json({ message: "Payment storage is not connected." }, { status: 503 });
  const response = await fetch(`${service.url}/rest/v1/rpc/scan_hosted_payment_reconciliation`, {
    method: "POST",
    headers: serviceHeaders(service),
    body: "{}"
  }).catch(() => null);
  if (!response?.ok) return NextResponse.json({ message: "Reconciliation scan is unavailable." }, { status: 503 });
  const findings = await response.json() as Array<{
    finding_key: string;
    finding_type: string;
    severity: string;
    summary: string;
    payment_id: string;
  }>;
  for (const finding of findings) {
    await fetch(`${service.url}/rest/v1/hosted_payment_reconciliation`, {
      method: "POST",
      headers: serviceHeaders(service, "resolution=ignore-duplicates,return=minimal"),
      body: JSON.stringify({
        hosted_payment_id: finding.payment_id,
        finding_key: finding.finding_key,
        finding_type: finding.finding_type,
        severity: finding.severity,
        summary: finding.summary,
        evidence: { scanner: "scan_hosted_payment_reconciliation" }
      })
    }).catch(() => undefined);
    await recordReliabilityIncident({
      title: "Hosted payment reconciliation finding",
      plainExplanation: finding.summary,
      technicalExplanation: finding.finding_type,
      severity: finding.severity === "critical" ? 5 : 4,
      feature: "Hosted Payments",
      affectedRoute: "/api/jobs/payment-reconciliation",
      paymentId: finding.payment_id,
      affectedWalletTransactionCount: 1,
      financialImpact: true,
      moneyAtRisk: finding.severity === "critical",
      automaticResponse: "Recorded evidence and stopped. No wallet balance was changed.",
      recommendedAdminAction: "Compare the provider transaction, hosted payment record, and wallet ledger before approving any correction."
    });
  }
  return NextResponse.json({ ok: true, findingCount: findings.length });
}
