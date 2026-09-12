import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import BrandLogo from "@/components/BrandLogo";
import BankPayoutsPanel from "@/components/admin/BankPayoutsPanel";
import { adminSessionCookie, getAdminBySession, hasAdminPermission } from "@/lib/admin-auth";
import { serviceCredentials, serviceHeaders } from "@/lib/api-user";

export const dynamic = "force-dynamic";

export default async function AdminEarningsPage() {
  const admin = await getAdminBySession(cookies().get(adminSessionCookie)?.value);
  if (!admin || !hasAdminPermission(admin, "admin.operations.manage")) redirect("/admin/login");
  const service = serviceCredentials();
  const [wallet, ledger, settlements] = service ? await Promise.all([
    fetch(`${service.url}/rest/v1/admin_earnings_wallet?select=current_balance_minor,updated_at&limit=1`, { headers: serviceHeaders(service), cache: "no-store" }).then((r) => r.ok ? r.json() : []).catch(() => []),
    fetch(`${service.url}/rest/v1/admin_earnings_ledger?select=category,gross_amount_minor,shipping_amount_minor,fulfillment_cost_minor,processor_fee_minor,status,verified_at&order=verified_at.desc&limit=500`, { headers: serviceHeaders(service), cache: "no-store" }).then((r) => r.ok ? r.json() : []).catch(() => []),
    fetch(`${service.url}/rest/v1/admin_earnings_settlements?select=id,period_start,period_end,amount_minor,transaction_count,category_totals,status,created_at&order=created_at.desc&limit=100`, { headers: serviceHeaders(service), cache: "no-store" }).then((r) => r.ok ? r.json() : []).catch(() => [])
  ]) : [[], [], []];
  const totals = (ledger as Array<{ category: string; gross_amount_minor: number }>).reduce<Record<string, number>>((out, row) => { out[row.category] = (out[row.category] || 0) + Number(row.gross_amount_minor || 0); return out; }, {});
  return <main className="admin-page"><header className="admin-header"><BrandLogo href="/admin" priority /><div><p className="kicker">ADMIN · ANALYTICS</p><h1>Earnings</h1><p>Internal verified revenue ledger. Processor and bank payouts remain separate and are not implied by hourly settlement.</p></div><a className="secondary admin-link-button" href="/admin">Back to ADMIN</a></header><BankPayoutsPanel /><section className="admin-dashboard-widgets"><article className="admin-dashboard-widget" data-state="green"><span>Current earnings wallet</span><strong>${(Number(wallet[0]?.current_balance_minor || 0) / 100).toFixed(2)}</strong><small>Resets only after a successful internal settlement.</small></article><article className="admin-dashboard-widget"><span>Last hourly settlement</span><strong>{settlements[0] ? `$${(Number(settlements[0].amount_minor || 0) / 100).toFixed(2)}` : "—"}</strong><small>{settlements[0]?.created_at || "No settlement recorded"}</small></article><article className="admin-dashboard-widget"><span>Next scheduled settlement</span><strong>Every 1 hour</strong><small>Requires the protected job runner.</small></article></section><section className="admin-commerce-panel"><h2>Revenue by category</h2><div className="admin-dashboard-widgets">{Object.entries(totals).map(([category, amount]) => <article className="admin-dashboard-widget" key={category}><span>{category}</span><strong>${(amount / 100).toFixed(2)}</strong></article>)}</div></section><section className="admin-commerce-panel"><h2>Settlement history</h2><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Created</th><th>Period</th><th>Amount</th><th>Transactions</th><th>Status</th></tr></thead><tbody>{settlements.map((row: { id: string; created_at: string; period_start: string; period_end: string; amount_minor: number; transaction_count: number; status: string }) => <tr key={row.id}><td>{row.created_at}</td><td>{row.period_start} → {row.period_end}</td><td>${(Number(row.amount_minor || 0) / 100).toFixed(2)}</td><td>{row.transaction_count}</td><td>{row.status}</td></tr>)}</tbody></table></div></section></main>;
}
