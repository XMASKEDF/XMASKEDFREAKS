import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import BrandLogo from "@/components/BrandLogo";
import PrintifyManagementCenter from "@/components/admin/PrintifyManagementCenter";
import { adminSessionCookie, getAdminBySession, hasAdminPermission } from "@/lib/admin-auth";
import { getPrintifyManagementData } from "@/lib/commerce/pod/management";

export const dynamic = "force-dynamic";

export default async function AdminPrintifyPage() {
  const admin = await getAdminBySession(cookies().get(adminSessionCookie)?.value);
  if (!admin) redirect("/admin/login");
  if (!admin.first_setup_completed) redirect("/admin/welcome");
  if (!hasAdminPermission(admin, "admin.commerce.manage")) redirect("/admin");
  const data = await getPrintifyManagementData();
  return <main className="admin-page admin-commerce-page printify-admin-page">
    <header className="admin-header">
      <BrandLogo href="/admin" priority />
      <div><p className="kicker">ADMIN · COMMERCE · OPERATIONS</p><h1>Printify Management Center</h1><p>Synchronization, fulfillment queue, providers, shipping, reconciliation, health, analytics evidence, and incident history.</p></div>
      <a className="secondary admin-link-button" href="/admin">Back to ADMIN</a>
    </header>
    <PrintifyManagementCenter initialData={data} />
  </main>;
}
