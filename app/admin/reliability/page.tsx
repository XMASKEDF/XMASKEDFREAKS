import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import BrandLogo from "@/components/BrandLogo";
import ReliabilityCenter from "@/components/admin/ReliabilityCenter";
import { adminSessionCookie, getAdminBySession, hasAdminPermission } from "@/lib/admin-auth";
import { getReliabilityCenterData } from "@/lib/reliability/health";

export const dynamic = "force-dynamic";

export default async function AdminReliabilityPage() {
  const admin = await getAdminBySession(cookies().get(adminSessionCookie)?.value);
  if (!admin) redirect("/admin/login");
  if (!admin.first_setup_completed) redirect("/admin/welcome");
  if (!hasAdminPermission(admin, "admin.operations.manage")) redirect("/admin");
  const data = await getReliabilityCenterData();
  return (
    <main className="admin-page reliability-page">
      <header className="admin-header">
        <BrandLogo href="/admin" priority />
        <div>
          <p className="kicker">ADMIN · Operations</p>
          <h1>Reliability Center</h1>
          <p>Detection, containment, financial integrity, recovery evidence, and the safest next action in one protected control room.</p>
        </div>
        <a className="secondary admin-link-button" href="/admin">Back to ADMIN</a>
      </header>
      <ReliabilityCenter initialData={data} adminName={admin.display_name || admin.username} />
    </main>
  );
}
