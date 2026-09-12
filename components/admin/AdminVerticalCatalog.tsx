"use client";

import Image from "next/image";
import { useCallback, useState } from "react";
import VerticalCatalog from "@/components/catalog/VerticalCatalog";
import ImagePicker from "@/components/admin/media/ImagePicker";
import type { CatalogEntry, CatalogSettings } from "@/lib/commerce/types";
import type { MediaAsset } from "@/lib/media/types";

const categories = ["Merch", "Audio", "Video", "Painting", "News", "Event", "General"] as const;
const blank: CatalogEntry = { id: "new", title: "", description: "", category: "General", imageUrl: "/branding/optimized/mask-logo-512.png", displayDate: "Coming soon", destinationUrl: null, actionLabel: null, status: "draft", pinned: false, sortOrder: 999, publishAt: null, expiresAt: null };

export default function AdminVerticalCatalog({ initialEntries, initialSettings, configured }: { initialEntries: CatalogEntry[]; initialSettings: CatalogSettings; configured: boolean }) {
  const [entries, setEntries] = useState(initialEntries);
  const [draft, setDraft] = useState(blank);
  const [settings, setSettings] = useState(initialSettings);
  const [pickerEntryId, setPickerEntryId] = useState<string | null>(null);
  const [message, setMessage] = useState(configured ? "Upcoming Reel schedule connected." : "Preview entries shown until the commerce migration is applied.");
  const closePicker = useCallback(() => setPickerEntryId(null), []);

  async function save(entry: CatalogEntry, action = "save") {
    const response = await fetch("/api/admin/catalog", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, entry }) });
    const result = await response.json().catch(() => ({})) as { error?: string; entries?: CatalogEntry[]; settings?: CatalogSettings };
    if (response.ok && result.entries) { setEntries(result.entries); if (result.settings) setSettings(result.settings); setDraft(blank); setMessage("Upcoming Reel updated and audit logged."); }
    else setMessage(result.error || "Upcoming Reel update failed.");
  }

  async function saveSettings() {
    const response = await fetch("/api/admin/catalog", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "save-settings", settings }) });
    const result = await response.json().catch(() => ({})) as { error?: string; settings?: CatalogSettings };
    if (!response.ok) { setMessage(result.error || "Reel settings failed to save."); return; }
    if (result.settings) setSettings(result.settings);
    setMessage("Reel speed and pause state saved.");
  }

  function patch(id: string, value: Partial<CatalogEntry>) { setEntries((items) => items.map((entry) => entry.id === id ? { ...entry, ...value } : entry)); }
  function chooseImage(asset: MediaAsset) { if (pickerEntryId === "new") setDraft((entry) => ({ ...entry, imageUrl: asset.publicUrl })); else if (pickerEntryId) patch(pickerEntryId, { imageUrl: asset.publicUrl }); setPickerEntryId(null); }

  const fields = (entry: CatalogEntry, update: (value: Partial<CatalogEntry>) => void) => <>
    <label>Title<input value={entry.title} onChange={(event) => update({ title: event.target.value })} /></label>
    <label>Description<textarea rows={3} value={entry.description} onChange={(event) => update({ description: event.target.value })} /></label>
    <label>Category<select value={entry.category} onChange={(event) => update({ category: event.target.value as CatalogEntry["category"] })}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
    <div className="admin-catalog-image"><Image unoptimized src={entry.imageUrl} alt={`${entry.title || "Upcoming entry"} preview`} width={220} height={140} /><button className="secondary" type="button" onClick={() => setPickerEntryId(entry.id)}>Choose from Media Library</button></div>
    <label>Display date<input value={entry.displayDate} onChange={(event) => update({ displayDate: event.target.value })} /></label>
    <label>Destination<input value={entry.destinationUrl || ""} onChange={(event) => update({ destinationUrl: event.target.value || null })} /></label>
    <label>Button label<input value={entry.actionLabel || ""} onChange={(event) => update({ actionLabel: event.target.value || null })} /></label>
    <label>Status<select value={entry.status} onChange={(event) => update({ status: event.target.value as CatalogEntry["status"] })}>{["draft", "scheduled", "published", "expired", "archived"].map((status) => <option key={status}>{status}</option>)}</select></label>
    <label>Publish at<input type="datetime-local" value={entry.publishAt?.slice(0, 16) || ""} onChange={(event) => update({ publishAt: event.target.value ? new Date(event.target.value).toISOString() : null })} /></label>
    <label>Expires at<input type="datetime-local" value={entry.expiresAt?.slice(0, 16) || ""} onChange={(event) => update({ expiresAt: event.target.value ? new Date(event.target.value).toISOString() : null })} /></label>
    <label className="check-row"><input type="checkbox" checked={entry.pinned} onChange={(event) => update({ pinned: event.target.checked })} />Pinned</label>
  </>;

  return <div className="admin-catalog-layout"><section className="admin-commerce-panel"><header><div><p className="kicker">ADMIN · UPCOMING REEL</p><h2>Upcoming Reel</h2><p>Control announcements, release order, timing, images, destinations, speed, and playback.</p></div></header><p role="status">{message}</p>
    <section className="admin-reel-controls"><label>Scroll speed: {settings.speedSeconds}s<input type="range" min={12} max={90} value={settings.speedSeconds} onChange={(event) => setSettings({ ...settings, speedSeconds: Number(event.target.value) })} /></label><label className="check-row"><input type="checkbox" checked={settings.paused} onChange={(event) => setSettings({ ...settings, paused: event.target.checked })} />Pause public reel</label><button className="secondary" type="button" onClick={() => void saveSettings()}>Save reel controls</button></section>
    <details open><summary>Add entry</summary><div className="admin-catalog-form">{fields(draft, (value) => setDraft((item) => ({ ...item, ...value })))}<button className="primary" type="button" onClick={() => void save(draft, "create")}>Add entry</button></div></details>
    <div className="admin-catalog-list">{entries.map((entry, index) => <details key={entry.id}><summary><span>{entry.category}</span>{entry.title}<b>{entry.status}</b></summary><div className="admin-catalog-form">{fields(entry, (value) => patch(entry.id, value))}<div><button className="secondary" type="button" disabled={index === 0} onClick={() => void save(entry, "move-up")}>Move up</button><button className="secondary" type="button" disabled={index === entries.length - 1} onClick={() => void save(entry, "move-down")}>Move down</button><button className="primary" type="button" onClick={() => void save(entry)}>Save</button><button className="secondary danger" type="button" onClick={() => { if (window.confirm("Delete this Upcoming Reel entry?")) void save(entry, "delete"); }}>Delete</button></div></div></details>)}</div>
  </section><VerticalCatalog entries={entries.filter((entry) => entry.status === "published")} speedSeconds={settings.speedSeconds} pausedByAdmin={settings.paused} /><ImagePicker open={Boolean(pickerEntryId)} category="promotional" title="Choose Upcoming Reel image" onClose={closePicker} onSelect={chooseImage} /></div>;
}
