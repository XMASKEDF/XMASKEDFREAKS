import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import BrandLogo from "@/components/BrandLogo";
import AdminFeedbackManager from "@/components/admin/AdminFeedbackManager";
import { adminSessionCookie, getAdminBySession, hasAdminPermission } from "@/lib/admin-auth";
import { serviceCredentials, serviceHeaders } from "@/lib/api-user";

export const dynamic = "force-dynamic";

export default async function AdminFeedbackPage() {
  const admin = await getAdminBySession(cookies().get(adminSessionCookie)?.value);
  if (!admin || !hasAdminPermission(admin, "admin.customers.manage")) redirect("/admin/login");
  const service = serviceCredentials();
  const feedback = service ? await fetch(`${service.url}/rest/v1/customer_feedback?select=id,category,original_text,original_language,english_translation,translation_status,status,admin_notes,created_at&order=created_at.desc&limit=100`, { headers: serviceHeaders(service), cache: "no-store" }).then((response) => response.ok ? response.json() : []).catch(() => []) : [];
  return <main className="admin-page"><header className="admin-header"><BrandLogo href="/admin" priority /><div><p className="kicker">ADMIN · CUSTOMER EXPERIENCE</p><h1>Feedback</h1><p>Private customer submissions and internal review notes.</p></div><a className="secondary admin-link-button" href="/admin">Back to ADMIN</a></header><AdminFeedbackManager initialFeedback={feedback} /></main>;
}
