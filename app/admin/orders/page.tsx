import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import BrandLogo from "@/components/BrandLogo";
import AdminOrdersManager from "@/components/admin/AdminOrdersManager";
import { adminSessionCookie, getAdminBySession } from "@/lib/admin-auth";
import { getAdminOrders } from "@/lib/commerce/orders";
export const dynamic = "force-dynamic";
export default async function AdminOrdersPage() { const admin = await getAdminBySession(cookies().get(adminSessionCookie)?.value); if (!admin || admin.role !== "ADMIN" || !admin.two_factor_required) redirect("/admin/login"); const data = await getAdminOrders(); return <main className="admin-page admin-orders-page"><header className="admin-header"><BrandLogo href="/admin" priority /><div><p className="kicker">{"ADMIN · FULFILLMENT"}</p><h1>{"ORDERS"}</h1><p>{"Digital, physical, mixed, international, and painting purchases in one protected station."}</p></div><a className="secondary admin-link-button" href="/admin">{"Back to ADMIN"}</a></header><AdminOrdersManager initialOrders={data.orders} configured={data.configured} homeCountry={process.env.COMMERCE_HOME_COUNTRY || "United States"} /></main>; }
