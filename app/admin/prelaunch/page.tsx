import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import BrandLogo from "@/components/BrandLogo";
import AdminPrelaunchManager from "@/components/admin/AdminPrelaunchManager";
import { adminSessionCookie, getAdminBySession } from "@/lib/admin-auth";

export default async function AdminPrelaunchPage() {
  const admin = await getAdminBySession(cookies().get(adminSessionCookie)?.value);
  if (!admin || admin.role !== "ADMIN") redirect("/admin/login");
  return <main className="admin-auth-page admin-command-page"><section className="admin-auth-panel admin-command-hero"><BrandLogo href="/admin" priority /><p className="kicker">ADMIN ONLY</p><h1>Pre-Launch Operations</h1><p>Inventory, communications, policies, Kill Switch controls, audit evidence, and honest platform analytics in one protected workspace.</p></section><AdminPrelaunchManager /></main>;
}
