import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import AdminFeetRequests from "@/components/admin/AdminFeetRequests";
import { adminSessionCookie, getAdminBySession, hasAdminPermission } from "@/lib/admin-auth";
import { getFeetPresets, getFeetRequests } from "@/lib/feet/server";

export const dynamic = "force-dynamic";

export default async function AdminFeetPage() {
  const admin = await getAdminBySession(cookies().get(adminSessionCookie)?.value);
  if (!admin || !hasAdminPermission(admin, "admin.commerce.manage")) redirect("/admin/login");
  const [presets, requests] = await Promise.all([getFeetPresets(true), getFeetRequests()]);
  return <AdminFeetRequests initialData={{ configured: presets.configured && requests.configured, presets: presets.presets, requests: requests.requests }} />;
}
