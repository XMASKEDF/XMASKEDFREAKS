import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import BrandLogo from "@/components/BrandLogo";
import { adminSessionCookie, getAdminBySession } from "@/lib/admin-auth";
import { serviceCredentials, serviceHeaders } from "@/lib/api-user";
import { adminGameErrorCopy as copy } from "@/lib/games/admin-error-copy";

export const dynamic = "force-dynamic";

type GameErrorLog = { id: string; created_at: string; severity: string; game_id: string | null; route: string | null; error_type: string | null; component_name: string | null; message: string; retry_count: number; browser: string | null; operating_system: string | null; device_type: string | null; recovery_action: string | null; resolved: boolean; diagnostics: Record<string, unknown> };

export default async function AdminErrorLogsPage() {
  const admin = await getAdminBySession(cookies().get(adminSessionCookie)?.value);
  if (!admin || admin.role !== "ADMIN") redirect("/admin/login");
  const service = serviceCredentials(); let logs: GameErrorLog[] = [];
  if (service) { const response = await fetch(`${service.url}/rest/v1/game_issue_reports?select=*&order=created_at.desc&limit=200`, { cache: "no-store", headers: serviceHeaders(service) }); if (response.ok) logs = await response.json() as GameErrorLog[]; }
  return <main className="admin-page admin-error-logs-page"><header className="admin-header"><BrandLogo href="/admin" priority /><div><p className="kicker">{copy.kicker}</p><h1>{copy.title}</h1><p>{copy.intro} {admin.username}.</p></div><a className="secondary admin-link-button" href="/admin">{copy.back}</a></header><section className="admin-error-summary"><span>{copy.total}<strong>{logs.length}</strong></span><span>{copy.unresolved}<strong>{logs.filter((log) => !log.resolved).length}</strong></span><span>{copy.critical}<strong>{logs.filter((log) => log.retry_count >= 3).length}</strong></span></section><section className="admin-error-log-list">{logs.length ? logs.map((log) => <article key={log.id} data-severity={log.severity}><header><span>{log.severity}</span><strong>{log.component_name || "Unknown component"}</strong><time>{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(log.created_at))}</time></header><p>{log.message}</p><div><span>{copy.route}<strong>{log.route || "/games"}</strong></span><span>{copy.game}<strong>{log.game_id || "Catalog"}</strong></span><span>{copy.type}<strong>{log.error_type || "render"}</strong></span><span>{copy.retries}<strong>{log.retry_count}</strong></span><span>{copy.environment}<strong>{[log.browser, log.operating_system, log.device_type].filter(Boolean).join(" · ") || "Unavailable"}</strong></span><span>{copy.action}<strong>{log.recovery_action || "Captured"}</strong></span></div></article>) : <div className="admin-empty-state"><h2>{copy.emptyTitle}</h2><p>{copy.emptyCopy}</p></div>}</section></main>;
}
