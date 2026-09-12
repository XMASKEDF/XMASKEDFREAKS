import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import BrandLogo from "@/components/BrandLogo";
import GameThumbnailEditor from "@/components/admin/GameThumbnailEditor";
import { adminSessionCookie, getAdminBySession } from "@/lib/admin-auth";
import { getGameById } from "@/lib/games/catalog";

export const dynamic = "force-dynamic";

export default async function AdminEditGamePage({ params }: { params: { gameId: string } }) {
  const admin = await getAdminBySession(cookies().get(adminSessionCookie)?.value);
  if (!admin || admin.role !== "ADMIN") redirect("/admin/login");
  const game = await getGameById(params.gameId); if (!game) notFound();
  return <main className="admin-page admin-game-edit-page"><header className="admin-header"><BrandLogo href="/admin" priority /><div><p className="kicker">ADMIN · Games</p><h1>Edit {game.title}</h1><p>General · Thumbnail · Settings · Leaderboard · Visibility</p></div></header><GameThumbnailEditor game={game} /></main>;
}
