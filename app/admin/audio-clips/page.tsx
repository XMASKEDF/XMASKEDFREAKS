import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import AdminAudioClipsShell from "@/components/admin/AdminAudioClipsShell";
import { adminSessionCookie, getAdminBySession } from "@/lib/admin-auth";
import { getAudioProducts } from "@/lib/audio-store/catalog";
import { serviceCredentials } from "@/lib/api-user";

export const dynamic = "force-dynamic";

export default async function AdminAudioClipsPage() {
  const admin = await getAdminBySession(cookies().get(adminSessionCookie)?.value);
  if (!admin || admin.role !== "ADMIN" || !admin.two_factor_required) redirect("/admin/login");
  const products = await getAudioProducts(true);
  return <AdminAudioClipsShell products={products} configured={Boolean(serviceCredentials())} username={admin.username} />;
}
