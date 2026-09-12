import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import BrandLogo from "@/components/BrandLogo";
import AdminAIAgentsDashboard from "@/components/admin/AdminAIAgentsDashboard";
import { adminSessionCookie, getAdminBySession } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function AdminAIAgentsPage() {
  const admin = await getAdminBySession(cookies().get(adminSessionCookie)?.value);
  if (!admin || admin.role !== "ADMIN") redirect("/admin/login");
  return <main className="admin-page admin-ai-agents-page"><header className="admin-header"><BrandLogo href="/admin" priority /><div><p className="kicker">ADMIN · INTELLIGENCE</p><h1>AI AGENTS</h1><p>Operational visibility for the existing agent registry. Responsibilities and behavior are read-only here.</p></div><a className="secondary admin-link-button" href="/admin">Back to ADMIN</a></header><AdminAIAgentsDashboard /></main>;
}
