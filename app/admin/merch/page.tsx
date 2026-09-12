import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import BrandLogo from "@/components/BrandLogo";
import AdminMerchManager from "@/components/admin/AdminMerchManager";
import AdminPrintifyMerchPanel from "@/components/admin/AdminPrintifyMerchPanel";
import { adminSessionCookie, getAdminBySession } from "@/lib/admin-auth";
import { getMerchCatalog } from "@/lib/commerce/catalog";

export const dynamic = "force-dynamic";
export default async function AdminMerchPage() { const admin = await getAdminBySession(cookies().get(adminSessionCookie)?.value); if (!admin || admin.role !== "ADMIN" || !admin.two_factor_required) redirect("/admin/login"); const catalog = await getMerchCatalog(true); return <main className="admin-page admin-commerce-page"><header className="admin-header"><BrandLogo href="/admin" priority /><div><p className="kicker">{"ADMIN · COMMERCE"}</p><h1>{"MERCH"}</h1><p>{"Categories, product slots, Printify mappings, filters, inventory, shipping eligibility, and publication."}</p></div><a className="secondary admin-link-button" href="/admin">{"Back to ADMIN"}</a></header><AdminMerchManager initialCategories={catalog.categories} initialProducts={catalog.products} initialLanguages={catalog.languages} configured={catalog.configured} /><AdminPrintifyMerchPanel initialProducts={catalog.products} languages={catalog.languages} /></main>; }
