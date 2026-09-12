import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import AdminCustomerManager from "@/components/admin/AdminCustomerManager";
import BrandLogo from "@/components/BrandLogo";
import { adminSessionCookie, getAdminBySession } from "@/lib/admin-auth";

export default async function AdminCustomersPage() {
  const admin = await getAdminBySession(cookies().get(adminSessionCookie)?.value);
  if (!admin || admin.role !== "ADMIN" || !admin.two_factor_required) redirect("/admin/login");

  return <main className="admin-auth-page admin-command-page">
    <section className="admin-auth-panel admin-command-hero">
      <BrandLogo className="admin-brand-link" priority />
      <p className="kicker">ADMIN ONLY</p>
      <h1>Customer Accounts</h1>
      <p>Review customer wallet history, issue audited adjustments, and control the releases shown in customer dashboards.</p>
      <a className="secondary admin-link-button" href="/admin">Back to ADMIN</a>
    </section>
    <AdminCustomerManager />
  </main>;
}
