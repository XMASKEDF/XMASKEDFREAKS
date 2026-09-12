"use client";

import { useState } from "react";
import Image from "next/image";
import type { TipMenuSettings, TipOption } from "@/lib/tips";
import ImagePicker from "@/components/admin/media/ImagePicker";
import type { MediaAsset } from "@/lib/media/types";

export default function AdminTipMenu({ initialOptions, initialSettings }: { initialOptions: TipOption[]; initialSettings: TipMenuSettings }) {
  const [options, setOptions] = useState(initialOptions);
  const [settings, setSettings] = useState(initialSettings);
  const [status, setStatus] = useState("Tip Menu controls ready.");
  const [pickerOptionId, setPickerOptionId] = useState<string | null>(null);

  async function saveOption(option: TipOption) {
    setStatus(`Saving ${option.phrase}…`);
    const response = await fetch("/api/admin/tips", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ option }) });
    setStatus(response.ok ? `${option.phrase} saved with an audit record.` : "Unable to save this tip option.");
  }

  async function saveSettings() {
    setStatus("Saving Tip Menu behavior…");
    const response = await fetch("/api/admin/tips", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ settings }) });
    setStatus(response.ok ? "Tip Menu behavior saved with an audit record." : "Unable to save Tip Menu behavior.");
  }

  function updateOption(id: string, patch: Partial<TipOption>) {
    setOptions((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  function chooseArtwork(asset: MediaAsset) {
    if (pickerOptionId) updateOption(pickerOptionId, { mediaId: asset.id, artworkUrl: asset.publicUrl });
    setPickerOptionId(null); setStatus("Artwork selected. Save the tip option to publish the assignment.");
  }

  return (
    <section className="admin-tip-menu-panel" aria-labelledby="admin-tip-menu-title">
      <header><div><p className="kicker">Payments · Ledger</p><h2 id="admin-tip-menu-title">Tip Menu</h2><p>Manage coin-only live tip choices. Financial changes remain ADMIN-only and audited.</p></div><span>ADMIN only</span></header>
      <div className="admin-tip-settings-grid">
        <label>Low-balance warning<input type="number" min={0} max={1000} value={settings.lowBalanceThreshold} onChange={(event) => setSettings((value) => ({ ...value, lowBalanceThreshold: Number(event.target.value) }))} /></label>
        <label>Minimum custom coins<input type="number" min={1} max={1000} value={settings.minimumCustomTokens} onChange={(event) => setSettings((value) => ({ ...value, minimumCustomTokens: Number(event.target.value) }))} /></label>
        <label>Maximum custom tokens<input type="number" min={1} max={1000} value={settings.maximumCustomTokens} onChange={(event) => setSettings((value) => ({ ...value, maximumCustomTokens: Number(event.target.value) }))} /></label>
        <label>Refill entry point<input value={settings.refillEntryPoint} onChange={(event) => setSettings((value) => ({ ...value, refillEntryPoint: event.target.value }))} /></label>
        <label className="check-row"><input type="checkbox" checked={settings.customTipsEnabled} onChange={(event) => setSettings((value) => ({ ...value, customTipsEnabled: event.target.checked }))} /> Custom tips enabled</label>
        <label className="check-row"><input type="checkbox" checked={settings.requireConfirmation} onChange={(event) => setSettings((value) => ({ ...value, requireConfirmation: event.target.checked }))} /> Confirm every tip</label>
      </div>
      <section className="admin-quick-tip-settings" aria-labelledby="admin-quick-tip-title">
        <header><div><p className="kicker">Live · Hosted checkout</p><h3 id="admin-quick-tip-title">Quick Live card tips</h3><p>Quick Tip uses the same Live Tip options shown below. Manage emoji, wording, coin value, artwork, order, and availability there; direct card tips never enter the Cart or coin wallet.</p></div><span>1 coin = $0.50</span></header>
      </section>
      <button className="primary" type="button" onClick={saveSettings}>Save Tip Menu settings</button>
      <div className="admin-tip-option-list">
        {options.map((option) => (
          <article key={option.id} className="admin-tip-option-row">
            <span className="admin-tip-emoji" aria-hidden="true">{option.emoji}</span>
            <div className="admin-tip-artwork">{option.artworkUrl ? <Image unoptimized src={option.artworkUrl} alt="" width={160} height={90} /> : <span>No artwork</span>}<button type="button" onClick={() => setPickerOptionId(option.id)}>Choose Image</button>{option.artworkUrl ? <button type="button" onClick={() => updateOption(option.id, { mediaId: null, artworkUrl: "" })}>Remove</button> : null}</div>
            <label>Emoji<input value={option.emoji} maxLength={16} onChange={(event) => updateOption(option.id, { emoji: event.target.value })} /></label>
            <label>Phrase<input value={option.phrase} maxLength={80} onChange={(event) => updateOption(option.id, { phrase: event.target.value })} /></label>
            <label>Coins<input type="number" min={1} max={1000} value={option.tokenCost} onChange={(event) => updateOption(option.id, { tokenCost: Number(event.target.value) })} /></label>
            <label>Order<input type="number" min={1} max={20} value={option.displayOrder} onChange={(event) => updateOption(option.id, { displayOrder: Number(event.target.value) })} /></label>
            <label>Alert<select value={option.alertStyle} onChange={(event) => updateOption(option.id, { alertStyle: event.target.value })}><option value="glow">Glow</option><option value="pulse">Pulse</option><option value="spark">Spark</option></select></label>
            <label>Sound<select value={option.soundStyle} onChange={(event) => updateOption(option.id, { soundStyle: event.target.value })}><option value="ching">Ching</option><option value="bell">Bell</option><option value="pulse">Pulse</option><option value="arcade">Arcade</option></select></label>
            <div className="admin-tip-flags">
              <label className="check-row"><input type="checkbox" checked={option.enabled} onChange={(event) => updateOption(option.id, { enabled: event.target.checked })} /> Enabled</label>
              <label className="check-row"><input type="checkbox" checked={option.featured} onChange={(event) => updateOption(option.id, { featured: event.target.checked })} /> Featured</label>
              <label className="check-row"><input type="checkbox" checked={option.temporaryAvailable} onChange={(event) => updateOption(option.id, { temporaryAvailable: event.target.checked })} /> Available now</label>
              <label className="check-row"><input type="checkbox" checked={option.liveOnly} onChange={(event) => updateOption(option.id, { liveOnly: event.target.checked })} /> Live only</label>
            </div>
            <button className="secondary" type="button" onClick={() => saveOption(option)}>Save option</button>
          </article>
        ))}
      </div>
      <p role="status">{status}</p>
      <ImagePicker open={Boolean(pickerOptionId)} title="Choose Tip Menu Artwork" category="tip-menu" onClose={() => setPickerOptionId(null)} onSelect={chooseArtwork} />
    </section>
  );
}
