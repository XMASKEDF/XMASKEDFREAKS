import MediaPage, { type MediaTab } from "@/app/admin/media/MediaPage";

export default function AdminMediaPage({ searchParams }: { searchParams?: { view?: string } }) {
  const valid = new Set<MediaTab>(["upload", "library", "categories", "folders", "usage"]);
  const requested = String(searchParams?.view || "library") as MediaTab;
  return <MediaPage initialTab={valid.has(requested) ? requested : "library"} />;
}

