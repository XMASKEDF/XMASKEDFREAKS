"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import type { MediaAsset, MediaCategory, MediaFolder } from "@/lib/media/types";

type ImagePickerProps = {
  open: boolean;
  title?: string;
  category?: string;
  onClose: () => void;
  onSelect: (asset: MediaAsset) => void;
};

export default function ImagePicker({ open, title = "Choose From Image Library", category = "", onClose, onSelect }: ImagePickerProps) {
  const [assets, setAssets] = useState<MediaAsset[]>([]); const [categories, setCategories] = useState<MediaCategory[]>([]); const [folders, setFolders] = useState<MediaFolder[]>([]);
  const [search, setSearch] = useState(""); const [categoryId, setCategoryId] = useState(category); const [folderId, setFolderId] = useState(""); const [status, setStatus] = useState("Loading library..."); const closeRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null; closeRef.current?.focus(); let active = true;
    fetch("/api/admin/media").then((response) => response.json()).then((result) => { if (!active) return; setAssets(result.assets || []); setCategories(result.categories || []); setFolders(result.folders || []); setStatus(result.configured ? "Choose one reusable image." : "Supabase media storage is not configured."); }).catch(() => setStatus("The media library could not be loaded."));
    const keydown = (event: KeyboardEvent) => { if (event.key === "Escape") { onClose(); return; } if (event.key !== "Tab") return; const dialog = closeRef.current?.closest<HTMLElement>("[role='dialog']"); const items = Array.from(dialog?.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])") || []); if (!items.length) return; const first = items[0]; const last = items[items.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } }; window.addEventListener("keydown", keydown);
    return () => { active = false; window.removeEventListener("keydown", keydown); previouslyFocused?.focus(); };
  }, [onClose, open]);
  const filtered = useMemo(() => assets.filter((asset) => asset.status !== "archived" && (!categoryId || asset.categoryId === categoryId) && (!folderId || asset.folderId === folderId) && (!search || [asset.displayName, asset.originalFilename, asset.altText, ...asset.tags].join(" ").toLowerCase().includes(search.toLowerCase()))), [assets, categoryId, folderId, search]);
  if (!open) return null;
  return <div className="media-dialog-backdrop" role="presentation"><section className="media-picker" role="dialog" aria-modal="true" aria-labelledby="media-picker-title">
    <header><div><p className="kicker">ADMIN Media</p><h2 id="media-picker-title">{title}</h2><p>{status}</p></div><button ref={closeRef} className="media-icon-button" type="button" aria-label="Close image picker" onClick={onClose}>x</button></header>
    <div className="media-picker-filters"><label>Search<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, filename, alt text, or tag" /></label><label>Category<select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">All categories</option>{categories.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>Folder<select value={folderId} onChange={(event) => setFolderId(event.target.value)}><option value="">All folders</option>{folders.map((item) => <option value={item.id} key={item.id}>{item.path}</option>)}</select></label></div>
    <div className="media-picker-grid" aria-live="polite">{filtered.map((asset) => <button type="button" key={asset.id} onClick={() => onSelect(asset)}><span className="media-picker-thumb"><Image unoptimized src={asset.publicUrl} alt={asset.altText || asset.displayName} width={320} height={Math.max(1, Math.round(320 * asset.height / asset.width))} /></span><strong>{asset.displayName}</strong><small>{asset.width} x {asset.height} - {asset.categoryName || asset.categoryId}</small></button>)}{!filtered.length ? <p className="media-empty">No matching images.</p> : null}</div>
    <footer><a className="secondary admin-link-button" href="/admin/media/upload">Upload New Picture</a><button className="secondary" type="button" onClick={onClose}>Cancel</button></footer>
  </section></div>;
}
