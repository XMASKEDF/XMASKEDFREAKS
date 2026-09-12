import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import BrandLogo from "@/components/BrandLogo";
import AdminChatManagement from "@/components/admin/AdminChatManagement";
import { adminSessionCookie, getAdminBySession, hasAdminPermission } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function AdminChatPage() {
  const admin = await getAdminBySession(cookies().get(adminSessionCookie)?.value);
  if (!admin || !hasAdminPermission(admin, "admin.customers.manage")) redirect("/admin/login");
  return (
    <main className="admin-page admin-commerce-page">
      <header className="admin-header">
        <BrandLogo href="/admin" priority />
        <div>
          <p className="kicker">ADMIN · LIVE OPERATIONS</p>
          <h1>Chat Management</h1>
          <p>Review current Live participants and make manual chat access decisions. Language alone never creates a block.</p>
        </div>
        <a className="secondary admin-link-button" href="/admin">Back to ADMIN</a>
      </header>
      <AdminChatManagement />
    </main>
  );
}
