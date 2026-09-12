"use client";

import Image from "next/image";
import { MATRIX_QUICK_PRESETS, type MatrixQuickPreset, type MatrixSlimSettings } from "@/lib/background/matrix";

const COLORS = ["#000000", "#1A1A1A", "#333333", "#666666", "#BFBFBF", "#DCDCDC", "#E6E6E6"];
const quickPresets = Object.keys(MATRIX_QUICK_PRESETS) as MatrixQuickPreset[];

type NumberField = { key: keyof MatrixSlimSettings; label: string; min: number; max: number; step?: number };

const rainFields: NumberField[] = [
  { key: "streamCount", label: "Stream count", min: 12, max: 120 }, { key: "density", label: "Density", min: 0.2, max: 1.4, step: 0.05 },
  { key: "minimumStreamLength", label: "Minimum stream length", min: 3, max: 30 }, { key: "maximumStreamLength", label: "Maximum stream length", min: 5, max: 48 },
  { key: "minimumSpeed", label: "Minimum speed", min: 4, max: 120 }, { key: "maximumSpeed", label: "Maximum speed", min: 10, max: 180 },
  { key: "characterSize", label: "Character size", min: 8, max: 28 }, { key: "characterChangeRate", label: "Character-change rate", min: 100, max: 2000, step: 50 },
  { key: "trailLength", label: "Trail length", min: 0.2, max: 1, step: 0.05 }, { key: "streamOpacity", label: "Stream opacity", min: 0.05, max: 1, step: 0.05 },
  { key: "brightness", label: "Brightness", min: 0.1, max: 1, step: 0.05 }, { key: "depthVariation", label: "Depth variation", min: 0, max: 1, step: 0.05 }, { key: "randomness", label: "Randomness", min: 0, max: 1, step: 0.05 }
];

const interactionFields: NumberField[] = [
  { key: "repelRadius", label: "Repel radius", min: 80, max: 260 }, { key: "repelStrength", label: "Repel strength", min: 0, max: 32 }, { key: "returnSpeed", label: "Return speed", min: 200, max: 1000, step: 50 },
  { key: "clickPulseRadius", label: "Click pulse radius", min: 60, max: 260 }, { key: "clickPulseStrength", label: "Click pulse strength", min: 0, max: 30 }, { key: "scrollSpeedMultiplier", label: "Scroll speed multiplier", min: 1, max: 1.25, step: 0.01 },
  { key: "idleDelay", label: "Idle delay", min: 5, max: 30 }, { key: "idleIntensity", label: "Idle intensity", min: 0.25, max: 1, step: 0.05 }, { key: "liveIntensity", label: "Live-video intensity", min: 0, max: 0.4, step: 0.01 }
];

const visualFields: NumberField[] = [
  { key: "globalOpacity", label: "Global opacity", min: 0, max: 1, step: 0.05 }, { key: "fadeDistance", label: "Fade distance", min: 0.2, max: 1, step: 0.05 },
  { key: "contrast", label: "Contrast", min: 0.5, max: 1.5, step: 0.05 }, { key: "glowStrength", label: "Glow strength", min: 0, max: 0.25, step: 0.01 },
  { key: "blurAmount", label: "Blur amount", min: 0, max: 2, step: 0.1 }, { key: "overlayOpacity", label: "Overlay opacity", min: 0, max: 0.8, step: 0.05 }
];

function NumberControls({ fields, settings, update }: { fields: NumberField[]; settings: MatrixSlimSettings; update: (key: keyof MatrixSlimSettings, value: number) => void }) {
  return <div className="matrix-control-grid">{fields.map((field) => <label key={field.key}>{field.label}<input type="number" min={field.min} max={field.max} step={field.step || 1} value={String(settings[field.key])} onChange={(event) => update(field.key, Number(event.target.value))} /></label>)}</div>;
}

export default function MatrixSlimAdminPanel({ settings, onChange }: { settings: MatrixSlimSettings; onChange: (settings: MatrixSlimSettings) => void }) {
  const update = (key: keyof MatrixSlimSettings, value: MatrixSlimSettings[keyof MatrixSlimSettings]) => onChange({ ...settings, [key]: value });
  const toggle = (key: keyof MatrixSlimSettings) => update(key, !settings[key] as MatrixSlimSettings[keyof MatrixSlimSettings]);
  const applyPreset = (preset: MatrixQuickPreset) => onChange({ ...settings, ...MATRIX_QUICK_PRESETS[preset], quickPreset: preset });
  const colorControl = (key: keyof MatrixSlimSettings, label: string) => <label>{label}<select value={String(settings[key])} onChange={(event) => update(key, event.target.value)}>{COLORS.map((color) => <option value={color} key={color}>{color}</option>)}</select></label>;

  return <details className="matrix-admin-panel"><summary>MATRIX — SLIM GRAY INTERACTIVE</summary><div className="matrix-admin-content">
    <header><div><p className="kicker">Interactive Backgrounds</p><h3>MATRIX — SLIM GRAY INTERACTIVE</h3><p>A lightweight black digital-rain background with thin gray streams and subtle interaction.</p></div><label className="check-row"><input type="checkbox" checked={settings.enabled} onChange={() => toggle("enabled")} /> Enabled</label></header>
    <div className="matrix-reference-preview"><Image src="/backgrounds/matrix-slim-gray/matrix-slim-gray-thumbnail.png" alt="Sparse grayscale digital rain preview" width={640} height={360} /><span>Static and reduced-motion fallback</span></div>
    <section><h4>Quick presets</h4><div className="matrix-preset-buttons">{quickPresets.map((preset) => <button type="button" className={settings.quickPreset === preset ? "active" : ""} key={preset} onClick={() => applyPreset(preset)}>{preset.replace("-", " ")}</button>)}</div></section>
    <section><h4>Matrix rain</h4><NumberControls fields={rainFields} settings={settings} update={(key, value) => update(key, value)} /></section>
    <section><h4>Interaction</h4><div className="matrix-toggle-grid">
      {[["mouseRepelEnabled", "Mouse repel"], ["clickPulseEnabled", "Click pulse"], ["scrollReactivityEnabled", "Scroll reactivity"], ["hoverClearingEnabled", "Hover clearing"], ["idleCalmEnabled", "Idle calm"]].map(([key, label]) => <label className="check-row" key={key}><input type="checkbox" checked={Boolean(settings[key as keyof MatrixSlimSettings])} onChange={() => toggle(key as keyof MatrixSlimSettings)} /> {label}</label>)}
    </div><NumberControls fields={interactionFields} settings={settings} update={(key, value) => update(key, value)} /></section>
    <section><h4>Visuals</h4><div className="matrix-control-grid">{colorControl("backgroundColor", "Background color")}{colorControl("deepGrayColor", "Deep gray")}{colorControl("darkGrayColor", "Dark gray")}{colorControl("mediumGrayColor", "Medium gray")}{colorControl("lightGrayColor", "Light gray")}{colorControl("leadingColor", "Leading character")}</div><NumberControls fields={visualFields} settings={settings} update={(key, value) => update(key, value)} /></section>
    <section><h4>Performance</h4><div className="matrix-control-grid"><label>Quality preset<select value={settings.quality} onChange={(event) => update("quality", event.target.value)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="ultra">Ultra</option></select></label><label>Maximum FPS<input type="number" min={24} max={60} value={settings.maximumFps} onChange={(event) => update("maximumFps", Number(event.target.value))} /></label><label>Pixel-ratio limit<input type="number" min={1} max={2} step={0.25} value={settings.pixelRatioLimit} onChange={(event) => update("pixelRatioLimit", Number(event.target.value))} /></label><label>Mobile density scale<input type="number" min={0.25} max={1} step={0.05} value={settings.mobileDensityScale} onChange={(event) => update("mobileDensityScale", Number(event.target.value))} /></label><label>Reduced motion<select value={settings.reducedMotionBehavior} onChange={(event) => update("reducedMotionBehavior", event.target.value)}><option value="static">Static composition</option><option value="paused">Paused first frame</option></select></label></div><div className="matrix-toggle-grid">
      {[["dynamicResolution", "Dynamic resolution"], ["pauseWhenHidden", "Pause when hidden"], ["lowPowerFallback", "Low-power fallback"]].map(([key, label]) => <label className="check-row" key={key}><input type="checkbox" checked={Boolean(settings[key as keyof MatrixSlimSettings])} onChange={() => toggle(key as keyof MatrixSlimSettings)} /> {label}</label>)}
    </div></section>
  </div></details>;
}
