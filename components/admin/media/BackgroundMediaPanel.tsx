"use client";

import { useState } from "react";
import ImagePicker from "@/components/admin/media/ImagePicker";
import type { MediaAsset } from "@/lib/media/types";
import type { SiteBackgroundSettings } from "@/lib/media/backgrounds";
import MatrixSlimAdminPanel from "@/components/admin/media/MatrixSlimAdminPanel";

type Slot = "desktop" | "mobile" | "fallback";

export default function BackgroundMediaPanel({ initialSettings }: { initialSettings: SiteBackgroundSettings }) {
  const [settings, setSettings] = useState(initialSettings);
  const [picker, setPicker] = useState<Slot | null>(null);
  const [status, setStatus] = useState("Background controls ready.");

  function choose(asset: MediaAsset) {
    if (!picker) return;
    const idKey = `${picker}MediaId` as const;
    const urlKey = `${picker}Url` as const;
    setSettings((value) => ({ ...value, [idKey]: asset.id, [urlKey]: asset.publicUrl }));
    setPicker(null);
    setStatus("Background selected. Save to publish the assignment.");
  }

  async function save() {
    setStatus("Saving background settings...");
    const response = await fetch("/api/admin/media/backgrounds", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(settings) });
    const result = await response.json();
    if (response.ok) setSettings(result.settings);
    setStatus(response.ok ? "Background and responsive settings saved." : result.error || "Unable to save backgrounds.");
  }

  return <section className="admin-auth-panel admin-background-media" id="appearance-backgrounds">
    <header><div><p className="kicker">ADMIN - Appearance</p><h2>Background Manager</h2><p>Choose reusable artwork and control how it adapts without blocking foreground controls.</p></div><label className="check-row"><input type="checkbox" checked={settings.enabled} onChange={(event) => setSettings((value) => ({ ...value, enabled: event.target.checked }))} /> Enabled</label></header>
    <div className="background-media-slots">{(["desktop", "mobile", "fallback"] as Slot[]).map((slot) => {
      const url = settings[`${slot}Url` as const];
      return <article key={slot}><div style={{ backgroundImage: url ? `linear-gradient(${settings.overlay}, ${settings.overlay}), url(${url})` : "none", backgroundPosition: `${settings.focalPointX * 100}% ${settings.focalPointY * 100}%`, opacity: settings.opacity || 1 }} /><strong>{slot} background</strong><button className="secondary" type="button" onClick={() => setPicker(slot)}>Choose From Library</button></article>;
    })}</div>
    <div className="branding-settings-grid">
      <label>Background type<select value={settings.backgroundType} onChange={(event) => setSettings((value) => ({ ...value, backgroundType: event.target.value as SiteBackgroundSettings["backgroundType"] }))}><option value="static">Static image</option><option value="video">Looping video</option><option value="canvas">Interactive Canvas</option><option value="webgl">WebGL with Canvas fallback</option></select></label>
      <label>Opacity<input type="range" min={0} max={1} step={0.05} value={settings.opacity} onChange={(event) => setSettings((value) => ({ ...value, opacity: Number(event.target.value) }))} /></label>
      <label>Overlay<input value={settings.overlay} onChange={(event) => setSettings((value) => ({ ...value, overlay: event.target.value }))} /></label>
      <label>Scope<select value={settings.scope} onChange={(event) => setSettings((value) => ({ ...value, scope: event.target.value as SiteBackgroundSettings["scope"] }))}><option value="global">Global</option><option value="live">Live page only</option><option value="games">Games only</option><option value="admin">ADMIN only</option><option value="landing">Landing only</option></select></label>
      <label>Focal point X<input type="range" min={0} max={1} step={0.01} value={settings.focalPointX} onChange={(event) => setSettings((value) => ({ ...value, focalPointX: Number(event.target.value) }))} /></label>
      <label>Focal point Y<input type="range" min={0} max={1} step={0.01} value={settings.focalPointY} onChange={(event) => setSettings((value) => ({ ...value, focalPointY: Number(event.target.value) }))} /></label>
    </div>
    <details className="background-advanced-settings"><summary>Advanced responsive settings</summary><div className="branding-settings-grid">
      <label className="check-row"><input type="checkbox" checked={settings.responsiveScaling} onChange={(event) => setSettings((value) => ({ ...value, responsiveScaling: event.target.checked }))} /> Enable Responsive Scaling</label>
      <label>Maximum Pixel Ratio<input type="number" min={1} max={3} step={0.25} value={settings.maximumPixelRatio} onChange={(event) => setSettings((value) => ({ ...value, maximumPixelRatio: Number(event.target.value) }))} /></label>
      <label>Resize Debounce Time<input type="number" min={50} max={250} step={5} value={settings.resizeDebounceMs} onChange={(event) => setSettings((value) => ({ ...value, resizeDebounceMs: Number(event.target.value) }))} /><small>50–250 milliseconds</small></label>
      <label className="check-row"><input type="checkbox" checked={settings.particleDensityScaling} onChange={(event) => setSettings((value) => ({ ...value, particleDensityScaling: event.target.checked }))} /> Particle Density Scaling</label>
      <label className="check-row"><input type="checkbox" checked={settings.maintainAspectRatio} onChange={(event) => setSettings((value) => ({ ...value, maintainAspectRatio: event.target.checked }))} /> Maintain Aspect Ratio</label>
      <label className="check-row"><input type="checkbox" checked={settings.dynamicResolution} onChange={(event) => setSettings((value) => ({ ...value, dynamicResolution: event.target.checked }))} /> Enable Dynamic Resolution</label>
      <label className="check-row"><input type="checkbox" checked={settings.mobilePerformanceMode} onChange={(event) => setSettings((value) => ({ ...value, mobilePerformanceMode: event.target.checked }))} /> Enable Mobile Performance Mode</label>
      <label className="check-row"><input type="checkbox" checked={settings.automaticGpuOptimization} onChange={(event) => setSettings((value) => ({ ...value, automaticGpuOptimization: event.target.checked }))} /> Enable Automatic GPU Optimization</label>
    </div></details>
    <MatrixSlimAdminPanel settings={settings.matrixSlim} onChange={(matrixSlim) => setSettings((value) => ({ ...value, matrixSlim }))} />
    <button className="primary" type="button" onClick={save}>Save Backgrounds</button>
    <p role="status" aria-live="polite">{status}</p>
    <ImagePicker open={Boolean(picker)} title={`Choose ${picker || ""} Background`} category="backgrounds" onClose={() => setPicker(null)} onSelect={choose} />
  </section>;
}
