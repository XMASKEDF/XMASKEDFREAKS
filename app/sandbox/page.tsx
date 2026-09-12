import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import LiveRoom from "@/components/LiveRoom";
import { adminSessionCookie, getAdminBySession } from "@/lib/admin-auth";
import { getGamesEnabled } from "@/lib/games/catalog";

export const dynamic = "force-dynamic";

export default async function SandboxPage() {
  const admin = await getAdminBySession(cookies().get(adminSessionCookie)?.value);
  if (!admin) redirect("/admin/login");
  const gamesEnabled = await getGamesEnabled();
  return <LiveRoom sandbox gamesEnabled={gamesEnabled} />;
}
