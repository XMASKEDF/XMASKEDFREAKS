import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import BrandLogo from "@/components/BrandLogo";
import LiveDiagnosticsPlayer from "@/components/live/LiveDiagnosticsPlayer";
import LivePlaybackDiagnosticsPanel from "@/components/admin/LivePlaybackDiagnosticsPanel";
import { adminSessionCookie, getAdminBySession, hasAdminPermission } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function LiveDiagnosticsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const admin = await getAdminBySession(cookies().get(adminSessionCookie)?.value);
  if (!admin) redirect("/admin/login");
  if (!admin.first_setup_completed) redirect("/admin/welcome");
  if (!hasAdminPermission(admin, "admin.operations.manage")) redirect("/admin");
  return <main className="admin-page live-diagnostics-page"><header className="admin-header"><BrandLogo href="/admin" priority /><div><p className="kicker">ADMIN · DEVELOPMENT ONLY</p><h1>Live Playback Diagnostics</h1><p>Compare the same playback source with the full Live room without contribution, wallet, chat, or viewer-presence logic.</p></div><div className="admin-quick-actions"><a className="secondary admin-link-button" href="/admin/system/live-diagnostics">Matrix on</a><a className="secondary admin-link-button" href="/admin/system/live-diagnostics?xmfMatrix=off">Matrix off</a><a className="secondary admin-link-button" href="/admin">Back to ADMIN</a></div></header><LiveDiagnosticsPlayer /><LivePlaybackDiagnosticsPanel /></main>;
}
