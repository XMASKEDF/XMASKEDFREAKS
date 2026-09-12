import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import BrandLogo from "@/components/BrandLogo";
import AdminPaintingAuctions from "@/components/admin/AdminPaintingAuctions";
import { adminSessionCookie, getAdminBySession } from "@/lib/admin-auth";
import { getPaintingAuctions } from "@/lib/auctions/catalog";
export const dynamic = "force-dynamic";
export default async function AdminPaintingsPage() { const admin = await getAdminBySession(cookies().get(adminSessionCookie)?.value); if (!admin || admin.role !== "ADMIN" || !admin.two_factor_required) redirect("/admin/login"); const data = await getPaintingAuctions(true); return <main className="admin-page admin-commerce-page"><header className="admin-header"><BrandLogo href="/admin" priority /><div><p className="kicker">{"ADMIN · AUCTIONS"}</p><h1>{"Painting Auctions"}</h1><p>{"Original Noddy works, bid policy, reservations, timing, shipping, and fulfillment."}</p></div><a className="secondary admin-link-button" href="/admin">{"Back to ADMIN"}</a></header><AdminPaintingAuctions initialAuctions={data.auctions} configured={data.configured} /></main>; }
