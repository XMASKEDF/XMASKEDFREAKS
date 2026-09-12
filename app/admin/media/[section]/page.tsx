import { notFound } from "next/navigation";
import MediaPage, { type MediaTab } from "@/app/admin/media/MediaPage";

const sections: Record<string, MediaTab> = { upload: "upload", library: "library", categories: "categories", folders: "folders", usage: "usage" };

export default function AdminMediaSectionPage({ params }: { params: { section: string } }) {
  const tab = sections[params.section]; if (!tab) notFound();
  return <MediaPage initialTab={tab} />;
}
