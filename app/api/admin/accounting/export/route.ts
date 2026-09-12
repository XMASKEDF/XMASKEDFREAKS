import { NextRequest, NextResponse } from "next/server";
import { adminSessionCookie, auditAdminEvent, getAdminBySession, hasAdminPermission, hasRecentAdminReauthentication } from "@/lib/admin-auth";
import { accountingCsv } from "@/lib/accounting";
import { serviceCredentials, serviceHeaders } from "@/lib/api-user";
import { extractClientIp } from "@/lib/security";

export const dynamic = "force-dynamic";

async function rows(path: string) {
  const service = serviceCredentials();
  if (!service) return [] as Array<Record<string, unknown>>;
  const response = await fetch(`${service.url}/rest/v1/${path}`, { cache: "no-store", headers: serviceHeaders(service) }).catch(() => null);
  return response?.ok ? await response.json() as Array<Record<string, unknown>> : [];
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get(adminSessionCookie)?.value;
  const admin = await getAdminBySession(token);
  if (!admin || !hasAdminPermission(admin, "admin.operations.manage")) return NextResponse.json({ message: "Not found." }, { status: 404 });
  if (!await hasRecentAdminReauthentication(token, 10)) return NextResponse.json({ message: "Recent administrator reauthentication is required for financial exports." }, { status: 428 });
  if (!serviceCredentials()) return NextResponse.json({ message: "Supabase service credentials are not configured." }, { status: 503 });
  const format = request.nextUrl.searchParams.get("format") === "csv" ? "csv" : "json";
  const [ledger, payouts, taxes, costs] = await Promise.all([
    rows("admin_earnings_ledger?select=category,source_type,source_id,gross_amount_minor,shipping_amount_minor,fulfillment_cost_minor,processor_fee_minor,status,verified_at,settled_at&order=verified_at.desc&limit=10000"),
    rows("admin_earnings_settlements?select=id,period_start,period_end,amount_minor,transaction_count,status,created_at&order=created_at.desc&limit=10000"),
    rows("accounting_tax_records?select=order_id,jurisdiction,taxable_amount_minor,tax_amount_minor,tax_type,tax_rate,provider,transaction_date,environment&order=transaction_date.desc&limit=10000"),
    rows("cost_entries?select=name,provider,category,feature,amount,frequency,source,period_start,environment,created_at&order=created_at.desc&limit=10000")
  ]);
  const records = [
    ...ledger.map((row) => ({ record_type: "earnings_ledger", ...row })),
    ...payouts.map((row) => ({ record_type: "settlement", ...row })),
    ...taxes.map((row) => ({ record_type: "tax", ...row })),
    ...costs.map((row) => ({ record_type: "cost", ...row }))
  ];
  await auditAdminEvent({ adminUserId: admin.id, eventType: "admin_accounting_export", ipAddress: extractClientIp(request.headers), userAgent: request.headers.get("user-agent") || "unknown", metadata: { format, recordCount: records.length } });
  if (format === "csv") return new NextResponse(accountingCsv(records), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=xmf-accounting-export.csv", "cache-control": "no-store" } });
  return new NextResponse(JSON.stringify({ exportedAt: new Date().toISOString(), recordCount: records.length, records }), { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": "attachment; filename=xmf-accounting-export.json", "cache-control": "no-store" } });
}
