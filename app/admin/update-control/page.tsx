import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import BrandLogo from "@/components/BrandLogo";
import UpdateControl from "@/components/admin/UpdateControl";
import { adminSessionCookie, getAdminBySession, hasAdminPermission } from "@/lib/admin-auth";
import { getUpdateRegistry } from "@/lib/admin-update-registry";

export const dynamic = "force-dynamic";

export default async function AdminUpdateControlPage() {
  const admin = await getAdminBySession(cookies().get(adminSessionCookie)?.value);
  if (!admin) redirect("/admin/login");
  if (!admin.first_setup_completed) redirect("/admin/welcome");
  if (!hasAdminPermission(admin, "admin.dashboard.read")) redirect("/admin");

  return (
    <main className="admin-page admin-update-page">
      <header className="admin-header">
        <BrandLogo href="/admin" priority />
        <div>
          <p className="kicker">ADMIN · DEVELOPMENT OPERATIONS</p>
          <h1>Update Control</h1>
          <p>Review the current sandbox intervention and keep implementation history separate from the security audit record.</p>
        </div>
        <a className="secondary admin-link-button" href="/admin">Back to ADMIN</a>
      </header>
      <UpdateControl packages={getUpdateRegistry()} />
    </main>
  );
}
