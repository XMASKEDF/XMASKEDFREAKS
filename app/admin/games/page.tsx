import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import BrandLogo from "@/components/BrandLogo";
import AdminGameManager from "@/components/admin/AdminGameManager";
import GameAssetManager from "@/components/admin/GameAssetManager";
import AdminGameTuning from "@/components/admin/AdminGameTuning";
import { adminSessionCookie, getAdminBySession } from "@/lib/admin-auth";
import { getGameCatalog } from "@/lib/games/catalog";

export const dynamic = "force-dynamic";

export default async function AdminGamesPage() {
  const admin = await getAdminBySession(cookies().get(adminSessionCookie)?.value);
  if (!admin || admin.role !== "ADMIN") redirect("/admin/login");
  const games = await getGameCatalog();
  return <main className="admin-page admin-games-page"><header className="admin-header"><BrandLogo href="/admin" priority /><div><p className="kicker">ADMIN only</p><h1>Games</h1><p>Manage visibility, order, gameplay feedback, thumbnails, runtime assets, and leaderboards. Signed in as {admin.username}.</p></div></header><AdminGameTuning /><AdminGameManager initialGames={games} /><GameAssetManager /></main>;
}
