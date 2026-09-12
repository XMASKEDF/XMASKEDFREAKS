import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import BrandLogo from "@/components/BrandLogo";
import AdminEmailList from "@/components/admin/AdminEmailList";
import { adminSessionCookie, getAdminBySession, hasAdminPermission } from "@/lib/admin-auth";
import { serviceCredentials, serviceHeaders } from "@/lib/api-user";

export const dynamic = "force-dynamic";

export default async function AdminEmailListPage() {
  const admin = await getAdminBySession(cookies().get(adminSessionCookie)?.value);
  if (!admin || !hasAdminPermission(admin, "admin.content.manage")) redirect("/admin/login");
  const service = serviceCredentials();
  const subscribers = service ? await fetch(`${service.url}/rest/v1/newsletter_subscribers?select=id,email,language_code,consent_status,source,subscribed_at,last_email_sent_at,delivery_status&order=subscribed_at.desc&limit=1000`, { headers: serviceHeaders(service), cache: "no-store" }).then((response) => response.ok ? response.json() : []).catch(() => []) : [];
  return <main className="admin-page"><header className="admin-header"><BrandLogo href="/admin" priority /><div><p className="kicker">ADMIN · MESSAGING</p><h1>Email List</h1><p>Consent-aware subscriber management.</p></div><a className="secondary admin-link-button" href="/admin">Back to ADMIN</a></header><AdminEmailList initialSubscribers={subscribers} /></main>;
}
