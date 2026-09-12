import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import AdminBadAccounts from "@/components/admin/AdminBadAccounts";
import BrandLogo from "@/components/BrandLogo";
import { adminSessionCookie, getAdminBySession, hasAdminPermission } from "@/lib/admin-auth";

export default async function BadAccountsPage() {
  const admin = await getAdminBySession(cookies().get(adminSessionCookie)?.value);
  if (!admin || !admin.two_factor_required || !hasAdminPermission(admin, "admin.customers.manage")) redirect("/admin/login");
  return <main className="admin-auth-page admin-command-page">
    <section className="admin-auth-panel admin-command-hero">
      <BrandLogo className="admin-brand-link" href="/admin" priority />
      <p className="kicker">ADMIN ONLY</p><h1>Bad Accounts</h1>
      <p>Contribution restrictions, verified return attempts, reinstatements, exemptions, notes, and immutable audit history.</p>
      <a className="secondary admin-link-button" href="/admin">Back to ADMIN</a>
    </section>
    <AdminBadAccounts />
  </main>;
}
