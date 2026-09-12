import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import BrandLogo from "@/components/BrandLogo";
import InfrastructureCenter from "@/components/admin/InfrastructureCenter";
import { adminSessionCookie, getAdminBySession, hasAdminPermission } from "@/lib/admin-auth";
import { getInfrastructureSnapshot, getJobQueueProvider } from "@/lib/infrastructure";

export const dynamic = "force-dynamic";

export default async function InfrastructurePage() {
  const admin = await getAdminBySession(cookies().get(adminSessionCookie)?.value);
  if (!admin) redirect("/admin/login");
  if (!admin.first_setup_completed) redirect("/admin/welcome");
  if (!hasAdminPermission(admin, "admin.operations.manage")) redirect("/admin");
  return <main className="admin-page infrastructure-page"><header className="admin-header"><BrandLogo href="/admin" priority /><div><p className="kicker">ADMIN · SYSTEM</p><h1>Infrastructure</h1><p>Provider-neutral health, storage, jobs, events, cache, security edge, media, streaming, and release readiness.</p></div><a className="secondary admin-link-button" href="/admin">Back to ADMIN</a></header><InfrastructureCenter initialSnapshot={await getInfrastructureSnapshot()} initialJobs={await getJobQueueProvider().list()} /></main>;
}
