import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import BrandLogo from "@/components/BrandLogo";
import HostedPaymentsCenter from "@/components/admin/HostedPaymentsCenter";
import { adminSessionCookie, getAdminBySession, hasAdminPermission } from "@/lib/admin-auth";
import { getHostedPaymentsAdminData } from "@/lib/payments/admin";

export const dynamic = "force-dynamic";

export default async function AdminHostedPaymentsPage() {
  const admin = await getAdminBySession(cookies().get(adminSessionCookie)?.value);
  if (!admin) redirect("/admin/login");
  if (!admin.first_setup_completed) redirect("/admin/welcome");
  if (!hasAdminPermission(admin, "admin.commerce.manage")) redirect("/admin");
  const data = await getHostedPaymentsAdminData();
  return (
    <main className="admin-page reliability-page">
      <header className="admin-header">
        <BrandLogo href="/admin" priority />
        <div>
          <p className="kicker">ADMIN · FINANCIAL OPERATIONS</p>
          <h1>Hosted Payments</h1>
          <p>Processor configuration, payment attempts, verified callbacks, and reconciliation evidence.</p>
        </div>
        <a className="secondary admin-link-button" href="/admin">Back to ADMIN</a>
      </header>
      <HostedPaymentsCenter initialData={data} />
    </main>
  );
}
