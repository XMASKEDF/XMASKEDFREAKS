import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import BrandLogo from "@/components/BrandLogo";
import TranslationManager from "@/components/admin/TranslationManager";
import { adminSessionCookie, getAdminBySession } from "@/lib/admin-auth";

export default async function AdminTranslationsPage() {
  const admin = await getAdminBySession(cookies().get(adminSessionCookie)?.value);
  if (!admin || admin.role !== "ADMIN") redirect("/admin/login");
  return <main className="admin-auth-page admin-command-page"><BrandLogo className="admin-brand-link" priority /><TranslationManager /></main>;
}
