"use client";

import { ChangeEvent, CSSProperties, useEffect, useMemo, useState } from "react";
import BrandLogo, { officialBrandLogo } from "@/components/BrandLogo";
import ImagePicker from "@/components/admin/media/ImagePicker";
import type { MediaAsset } from "@/lib/media/types";

export default function BrandingPanel() {
  const [previewSrc, setPreviewSrc] = useState(officialBrandLogo.src);
  const [objectUrl, setObjectUrl] = useState("");
  const [size, setSize] = useState(3.1);
  const [spacing, setSpacing] = useState(0.65);
  const [glow, setGlow] = useState(0.22);
  const [mobileScale, setMobileScale] = useState(0.78);
  const [alignment, setAlignment] = useState("center");
  const [hover, setHover] = useState("soft glow");
  const [faviconMode, setFaviconMode] = useState("use logo mark");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState("Choose a library logo or preview a local replacement.");

  useEffect(() => () => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }, [objectUrl]);

  const previewStyle = useMemo(() => ({
    "--brand-logo-size": `${size}rem`,
    "--brand-logo-mobile-size": `${size * mobileScale}rem`,
    "--brand-logo-gap": `${spacing}rem`,
    "--brand-logo-glow": String(glow),
    "--brand-logo-white-glow": String(Math.min(0.72, glow + 0.06)),
    "--brand-logo-green-glow": String(Math.max(0, glow * 0.75)),
    "--brand-logo-mobile-scale": String(mobileScale),
    alignItems: alignment
  }) as CSSProperties, [alignment, glow, mobileScale, size, spacing]);

  function previewUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    const nextUrl = URL.createObjectURL(file);
    setObjectUrl(nextUrl);
    setPreviewSrc(nextUrl);
  }

  function chooseLibraryLogo(asset: MediaAsset) { setSelectedMediaId(asset.id); setPreviewSrc(asset.publicUrl); setPickerOpen(false); setSaveStatus("Library logo selected. Save to publish it across every BrandLogo."); }
  async function saveLibraryLogo() { if (!selectedMediaId) { setSaveStatus("Choose a published library logo first."); return; } const response = await fetch("/api/admin/media/branding", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ mediaId: selectedMediaId }) }); const result = await response.json(); setSaveStatus(response.ok ? "Official logo saved. Reload public pages to use the new shared mark." : result.error || "Unable to save logo."); }

  return (
    <section className="admin-auth-panel admin-branding-panel" id="admin-branding">
      <div>
        <p className="kicker">ADMIN · Branding</p>
        <h2>Official brand mark</h2>
        <p>
          The uploaded transparent XMASKEDFREAKS logo is the permanent header identity. Replacement uploads should be
          transparent PNG/WebP artwork and preview here before production storage is connected.
        </p>
      </div>
      <div className="branding-preview-stage">
        <BrandLogo className="brand-preview" logoSrc={previewSrc} style={previewStyle} />
      </div>
      <div className="branding-settings-grid">
        <label>Replacement transparent logo<input type="file" accept="image/png,image/webp,image/svg+xml" onChange={previewUpload} /></label>
        <button className="secondary" type="button" onClick={() => setPickerOpen(true)}>Choose From Image Library</button>
        <label>Logo size<input type="range" min={2.2} max={4.8} step={0.1} value={size} onChange={(event) => setSize(Number(event.target.value))} /></label>
        <label>Spacing<input type="range" min={0.35} max={1.4} step={0.05} value={spacing} onChange={(event) => setSpacing(Number(event.target.value))} /></label>
        <label>Glow intensity<input type="range" min={0} max={0.65} step={0.01} value={glow} onChange={(event) => setGlow(Number(event.target.value))} /></label>
        <label>Mobile scaling<input type="range" min={0.62} max={1} step={0.02} value={mobileScale} onChange={(event) => setMobileScale(Number(event.target.value))} /></label>
        <label>Alignment
          <select value={alignment} onChange={(event) => setAlignment(event.target.value)}>
            <option value="center">Center aligned</option>
            <option value="flex-start">Top aligned</option>
            <option value="flex-end">Bottom aligned</option>
          </select>
        </label>
        <label>Hover animation
          <select value={hover} onChange={(event) => setHover(event.target.value)}>
            <option>soft glow</option>
            <option>gentle scale</option>
            <option>brightness only</option>
          </select>
        </label>
        <label>Favicon setting
          <select value={faviconMode} onChange={(event) => setFaviconMode(event.target.value)}>
            <option>use logo mark</option>
            <option>upload separate favicon</option>
            <option>text fallback</option>
          </select>
        </label>
      </div>
      <div className="branding-asset-grid">
        <span>Official source<strong>{officialBrandLogo.src}</strong></span>
        <span>Original preserved<strong>{officialBrandLogo.originalSrc}</strong></span>
        <span>Responsive sizes<strong>256 · 512 · 1024</strong></span>
        <span>Cache plan<strong>Public optimized assets, original retained</strong></span>
      </div>
      <p className="status-line">
        {saveStatus}
      </p>
      <button className="primary" type="button" onClick={saveLibraryLogo}>Save Official Library Logo</button>
      <ImagePicker open={pickerOpen} title="Choose Official Brand Logo" category="logos" onClose={() => setPickerOpen(false)} onSelect={chooseLibraryLogo} />
    </section>
  );
}
