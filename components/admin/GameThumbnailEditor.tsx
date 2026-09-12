"use client";

import Image from "next/image";
import Link from "next/link";
import { type ChangeEvent, useEffect, useState } from "react";
import type { GameItem } from "@/lib/config";
import ImagePicker from "@/components/admin/media/ImagePicker";
import type { MediaAsset } from "@/lib/media/types";

type Preview = { url: string; name: string; size: number; width: number; height: number };

export default function GameThumbnailEditor({ game }: { game: GameItem }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [alt, setAlt] = useState(game.thumbnailAlt);
  const [status, setStatus] = useState("No unsaved changes.");
  const [saving, setSaving] = useState(false);
  const [currentUrl, setCurrentUrl] = useState(game.thumbnail || `/games/thumbnails/${game.slug}.svg`);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] || null;
    if (preview) URL.revokeObjectURL(preview.url);
    setFile(null); setPreview(null);
    if (!selected) return;
    if (!/\.(png|jpe?g|webp)$/i.test(selected.name) || !["image/png", "image/jpeg", "image/webp"].includes(selected.type)) { setStatus("Use a valid PNG, JPEG, or WebP image."); return; }
    if (selected.size > 2 * 1024 * 1024) { setStatus("Thumbnail exceeds the 2 MB maximum."); return; }
    const url = URL.createObjectURL(selected); const image = new window.Image();
    image.onload = () => {
      setFile(selected); setPreview({ url, name: selected.name, size: selected.size, width: image.naturalWidth, height: image.naturalHeight });
      const ratio = image.naturalWidth / Math.max(1, image.naturalHeight);
      setStatus(Math.abs(ratio - 16 / 9) > 0.08 ? "Preview ready. Warning: this image is not close to 16:9 and will be cropped on cards." : "Preview ready. Save Changes to publish it.");
    };
    image.onerror = () => { URL.revokeObjectURL(url); setStatus("This image is corrupted or cannot be previewed."); };
    image.src = url;
  }

  async function save() {
    setSaving(true); setStatus(file ? "Uploading and validating thumbnail..." : "Saving alt text...");
    const form = new FormData(); form.set("operation", "save"); form.set("alt", alt); if (file) form.set("thumbnail", file);
    const response = await fetch(`/api/admin/games/${game.id}`, { method: "POST", body: form });
    const result = await response.json().catch(() => ({})); setSaving(false);
    if (!response.ok) { setStatus(result.error || "Unable to save thumbnail."); return; }
    if (result.thumbnailUrl) setCurrentUrl(result.thumbnailUrl);
    setFile(null); setPreview(null); setStatus("Thumbnail changes saved successfully.");
  }

  async function remove() {
    if (!window.confirm("Remove the custom thumbnail and restore the project default?")) return;
    setSaving(true); setStatus("Removing custom thumbnail...");
    const form = new FormData(); form.set("operation", "remove"); form.set("alt", alt);
    const response = await fetch(`/api/admin/games/${game.id}`, { method: "POST", body: form });
    const result = await response.json().catch(() => ({})); setSaving(false);
    if (!response.ok) { setStatus(result.error || "Unable to remove thumbnail."); return; }
    setCurrentUrl(result.thumbnailUrl || `/games/thumbnails/${game.slug}.svg`); setFile(null); setPreview(null); setStatus("Custom thumbnail removed. The default is active.");
  }

  async function chooseFromLibrary(asset: MediaAsset) {
    setPickerOpen(false); setSaving(true); setStatus("Assigning library thumbnail...");
    const ratio = asset.width / Math.max(1, asset.height);
    const form = new FormData(); form.set("operation", "library"); form.set("mediaId", asset.id); form.set("alt", alt || asset.altText || game.thumbnailAlt);
    const response = await fetch(`/api/admin/games/${game.id}`, { method: "POST", body: form }); const result = await response.json().catch(() => ({})); setSaving(false);
    if (!response.ok) { setStatus(result.error || "Unable to assign library thumbnail."); return; }
    setCurrentUrl(result.thumbnailUrl || asset.publicUrl); setStatus(Math.abs(ratio - 16 / 9) > 0.08 ? "Library thumbnail saved. Warning: it is not close to 16:9 and will use the saved focal point when cropped." : "Library thumbnail saved and usage tracking updated.");
  }

  const shown = preview?.url || currentUrl;
  return (
    <section className="thumbnail-editor">
      <div className="thumbnail-preview-panel">
        <p className="kicker">Live preview</p>
        <div className="thumbnail-preview"><Image src={shown} alt={alt || game.thumbnailAlt} fill unoptimized={Boolean(preview)} sizes="(max-width: 720px) 100vw, 720px" /></div>
        {preview ? <dl className="thumbnail-file-meta"><div><dt>File</dt><dd>{preview.name}</dd></div><div><dt>Size</dt><dd>{(preview.size / 1024).toFixed(1)} KB</dd></div><div><dt>Dimensions</dt><dd>{preview.width} × {preview.height}</dd></div></dl> : null}
      </div>
      <div className="thumbnail-controls">
        <p className="kicker">Thumbnail</p><h2>{game.title}</h2>
        <p>Recommended 1280 × 720 (16:9). PNG, JPEG, or WebP. Maximum 2 MB.</p>
        <label className="thumbnail-upload-label">{game.thumbnail?.startsWith("http") ? "Replace Thumbnail" : "Upload Thumbnail"}<input type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" onChange={chooseFile} /></label>
        <button className="secondary" type="button" disabled={saving} onClick={() => setPickerOpen(true)}>Choose From Image Library</button>
        <label>Thumbnail alt text<input value={alt} maxLength={180} onChange={(event) => setAlt(event.target.value)} aria-describedby="thumbnail-alt-help" /></label>
        <small id="thumbnail-alt-help">Describe the gameplay shown in the image. Maximum 180 characters.</small>
        <p className="thumbnail-save-status" role="status">{status}</p>
        <div className="thumbnail-action-row">
          <button className="primary" type="button" disabled={saving || !alt.trim()} onClick={save}>{saving ? "Saving..." : "Save Changes"}</button>
          <button className="secondary" type="button" disabled={saving} onClick={remove}>Remove Thumbnail</button>
          <button className="secondary" type="button" disabled={!preview || saving} onClick={() => { if (preview) URL.revokeObjectURL(preview.url); setFile(null); setPreview(null); setStatus("Unsaved preview cancelled."); }}>Cancel</button>
          <Link className="secondary admin-link-button" href="/admin/games">Back to Games</Link>
        </div>
      </div>
      <ImagePicker open={pickerOpen} title={`Choose ${game.title} Thumbnail`} category="game-thumbnails" onClose={() => setPickerOpen(false)} onSelect={chooseFromLibrary} />
    </section>
  );
}
