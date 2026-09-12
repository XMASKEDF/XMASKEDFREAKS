import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import BrandLogo from "@/components/BrandLogo";
import AdminMediaLibrary from "@/components/admin/media/AdminMediaLibrary";
import { adminSessionCookie, getAdminBySession } from "@/lib/admin-auth";
import { fetchMediaLibrary } from "@/lib/media/server";

export type MediaTab = "upload" | "library" | "categories" | "folders" | "usage";

export default async function MediaPage({ initialTab = "library" }: { initialTab?: MediaTab }) {
  const admin = await getAdminBySession(cookies().get(adminSessionCookie)?.value);
  if (!admin || admin.role !== "ADMIN" || !admin.two_factor_required) redirect("/admin/login");
  const library = await fetchMediaLibrary();
  return <main className="admin-page admin-media-page"><header className="admin-header"><BrandLogo href="/admin" priority /><div><p className="kicker">ADMIN only</p><h1>MEDIA</h1><p>Upload, organize, preview, reuse, and protect every website picture. Signed in as {admin.username}.</p></div><a className="secondary admin-link-button" href="/admin">Back to ADMIN</a></header><AdminMediaLibrary initialAssets={library.assets} initialCategories={library.categories} initialFolders={library.folders} initialUsages={library.usages} initialTab={initialTab} configured={library.configured} /></main>;
}

