import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import BrandLogo from "@/components/BrandLogo";
import BackboneCommandCenter from "@/components/admin/BackboneCommandCenter";
import { adminSessionCookie, getAdminBySession, hasAdminPermission } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function AdminBackbonePage() {
  const admin = await getAdminBySession(cookies().get(adminSessionCookie)?.value);
  if (!admin || admin.role !== "ADMIN" || !hasAdminPermission(admin, "admin.operations.manage")) redirect("/admin/login");
  return <main className="admin-auth-page admin-command-page"><section className="admin-auth-panel admin-command-hero"><BrandLogo className="admin-brand-link" priority /><p className="kicker">ADMIN ONLY</p><h1>Production Backbone</h1><p>Protected operational evidence for risk, entitlements, accounting, support, rights, costs, and launch readiness.</p></section><BackboneCommandCenter /></main>;
}
