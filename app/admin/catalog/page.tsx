import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import BrandLogo from "@/components/BrandLogo";
import AdminVerticalCatalog from "@/components/admin/AdminVerticalCatalog";
import { adminSessionCookie, getAdminBySession } from "@/lib/admin-auth";
import { getVerticalCatalog } from "@/lib/commerce/catalog";
export const dynamic = "force-dynamic";
export default async function AdminCatalogPage() { const admin = await getAdminBySession(cookies().get(adminSessionCookie)?.value); if (!admin || admin.role !== "ADMIN" || !admin.two_factor_required) redirect("/admin/login"); const data = await getVerticalCatalog(true); return <main className="admin-page admin-commerce-page"><header className="admin-header"><BrandLogo href="/admin" priority /><div><p className="kicker">{"ADMIN · CONTENT"}</p><h1>{"Upcoming Reel"}</h1><p>{"Releases, products, events, auctions, and news with server-authoritative scheduling."}</p></div><a className="secondary admin-link-button" href="/admin">{"Back to ADMIN"}</a></header><AdminVerticalCatalog initialEntries={data.entries} initialSettings={data.settings} configured={data.configured} /></main>; }
