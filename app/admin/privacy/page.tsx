import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import BrandLogo from "@/components/BrandLogo";
import PrivacyConsentPanel from "@/components/admin/PrivacyConsentPanel";
import { adminSessionCookie, getAdminBySession } from "@/lib/admin-auth";

export default async function AdminPrivacyPage() {
  const admin = await getAdminBySession(cookies().get(adminSessionCookie)?.value);
  if (!admin || admin.role !== "ADMIN") redirect("/admin/login");
  return <main className="admin-auth-page admin-commerce-page"><header className="admin-page-header"><BrandLogo href="/admin" priority /><div><p className="kicker">ADMIN · SAFETY</p><h1>Privacy &amp; Cookies</h1><p>Manage consent behavior, privacy signals, policy links, aggregate statistics, and sandbox verification.</p></div><a className="secondary admin-link-button" href="/admin">Back to ADMIN</a></header><PrivacyConsentPanel /></main>;
}
