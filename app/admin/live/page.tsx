import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import BrandLogo from "@/components/BrandLogo";
import LiveControlRoom from "@/components/admin/LiveControlRoom";
import LivePlaybackDiagnosticsPanel from "@/components/admin/LivePlaybackDiagnosticsPanel";
import { adminSessionCookie, getAdminBySession, hasAdminPermission } from "@/lib/admin-auth";
import { getInfrastructureSnapshot } from "@/lib/infrastructure/health";

export const dynamic = "force-dynamic";

export default async function AdminLivePage() {
  const admin = await getAdminBySession(cookies().get(adminSessionCookie)?.value);
  if (!admin) redirect("/admin/login");
  if (!admin.first_setup_completed) redirect("/admin/welcome");
  if (!hasAdminPermission(admin, "admin.operations.manage")) redirect("/admin");
  const snapshot = await getInfrastructureSnapshot();
  return <main className="admin-page live-control-page">
    <header className="admin-header"><BrandLogo href="/admin" priority /><div><p className="kicker">ADMIN · DEVELOPMENT OPERATIONS</p><h1>Live Control Room</h1><p>Protected operations links and local playback evidence for the existing Live system.</p></div><a className="secondary admin-link-button" href="/admin">Back to ADMIN</a></header>
    <LiveControlRoom snapshot={snapshot} />
    <LivePlaybackDiagnosticsPanel />
  </main>;
}
