import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import BrandLogo from "@/components/BrandLogo";
import ReferralHeatmaps from "@/components/admin/ReferralHeatmaps";
import { adminSessionCookie, getAdminBySession } from "@/lib/admin-auth";
import { defaultReferralHeatmapFilters, getReferralHeatmap } from "@/lib/analytics/referral-heatmap";
import { serviceCredentials, serviceHeaders } from "@/lib/api-user";

export const dynamic = "force-dynamic";

export default async function TrafficAnalyticsPage() {
  const admin = await getAdminBySession(cookies().get(adminSessionCookie)?.value);
  if (!admin || admin.role !== "ADMIN") redirect("/admin/login");
  const service = serviceCredentials();
  const response = service ? await fetch(`${service.url}/rest/v1/analytics_events?environment=eq.production&select=source,medium,campaign,event_type,user_id&order=occurred_at.desc&limit=5000`, { cache: "no-store", headers: serviceHeaders(service) }).catch(() => null) : null;
  const rows = response?.ok ? await response.json() as Array<{ source?: string; medium?: string; campaign?: string; event_type?: string; user_id?: string | null }> : [];
  const heatmapData = await getReferralHeatmap({ ...defaultReferralHeatmapFilters, start: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(), end: new Date().toISOString() });
  const groups = new Map<string, { visitors: number; conversions: number; users: Set<string> }>();
  for (const row of rows) { const source = String(row.source || "unknown"); const current = groups.get(source) || { visitors: 0, conversions: 0, users: new Set<string>() }; current.visitors += row.event_type === "page_view" ? 1 : 0; current.conversions += ["purchase_completed", "checkout_started"].includes(String(row.event_type)) ? 1 : 0; if (row.user_id) current.users.add(row.user_id); groups.set(source, current); }
  return <main className="admin-page"><header className="admin-header"><BrandLogo href="/admin" priority /><div><p className="kicker">ADMIN · ANALYTICS</p><h1>Referring Websites</h1><p>Production attribution only. Sandbox activity is excluded.</p></div><a className="secondary admin-link-button" href="/admin">Back to ADMIN</a></header><section className="admin-commerce-panel"><h2>Sources</h2><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Source</th><th>Visitors</th><th>Conversions</th><th>Accounts</th><th>Conversion rate</th></tr></thead><tbody>{[...groups.entries()].sort((a, b) => b[1].visitors - a[1].visitors).map(([source, data]) => <tr key={source}><td>{source}</td><td>{data.visitors}</td><td>{data.conversions}</td><td>{data.users.size}</td><td>{data.visitors ? `${Math.round(data.conversions / data.visitors * 100)}%` : "0%"}</td></tr>)}</tbody></table></div></section><ReferralHeatmaps initialData={heatmapData} /></main>;
}
