import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import BrandLogo from "@/components/BrandLogo";
import AdminOperationalizationCenter from "@/components/admin/AdminOperationalizationCenter";
import { adminSessionCookie, getAdminBySession, hasAdminPermission } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function AdminOperationalizationPage() {
  const admin = await getAdminBySession(cookies().get(adminSessionCookie)?.value);
  if (!admin) redirect("/admin/login");
  if (!admin.first_setup_completed) redirect("/admin/welcome");
  if (!hasAdminPermission(admin, "admin.operations.manage")) redirect("/admin");

  return <main className="admin-page admin-operationalization-page">
    <header className="admin-header"><BrandLogo href="/admin" priority /><div><p className="kicker">ADMIN · DEVELOPMENT OPERATIONS</p><h1>Operationalization Center</h1><p>Finish the software-side Admin backlog while provider approval and production credentials remain separate.</p></div><a className="secondary admin-link-button" href="/admin">Back to ADMIN</a></header>
    <AdminOperationalizationCenter />
  </main>;
}
