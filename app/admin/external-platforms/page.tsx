import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import BrandLogo from "@/components/BrandLogo";
import AdminExternalPlatforms from "@/components/admin/AdminExternalPlatforms";
import { adminSessionCookie, getAdminBySession } from "@/lib/admin-auth";
import { getExternalPlatforms } from "@/lib/external-platforms";
export const dynamic = "force-dynamic";
export default async function Page() { const admin = await getAdminBySession(cookies().get(adminSessionCookie)?.value); if (!admin || admin.role !== "ADMIN" || !admin.two_factor_required) redirect("/admin/login"); const data = await getExternalPlatforms(true); return <main className="admin-page admin-commerce-page"><header className="admin-header"><BrandLogo href="/admin" priority /><div><p className="kicker">ADMIN · CONTENT</p><h1>External Platforms</h1><p>Fansly and Clips4Sale public content, destinations, and artwork.</p></div><a className="secondary admin-link-button" href="/admin">Back to ADMIN</a></header><AdminExternalPlatforms initialSettings={data.settings} initialClips={data.clips} configured={data.configured} /></main>; }

