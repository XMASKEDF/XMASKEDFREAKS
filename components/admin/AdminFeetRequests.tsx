"use client";

import Image from "next/image";
import { useCallback, useState } from "react";
import ImagePicker from "@/components/admin/media/ImagePicker";
import DirectMediaUpload from "@/components/admin/media/DirectMediaUpload";
import type { MediaAsset } from "@/lib/media/types";
import { coinsToUsdMinor, FEET_PRESET_STATUSES, FEET_REQUEST_STATUSES, type FeetRequest, type FeetRequestPreset } from "@/lib/feet/types";

type FeetData = { configured: boolean; presets: FeetRequestPreset[]; requests: FeetRequest[] };

const money = (minor: number) => `$${(minor / 100).toFixed(2)}`;

export default function AdminFeetRequests({ initialData }: { initialData: FeetData }) {
  const [data, setData] = useState(initialData);
  const [message, setMessage] = useState(initialData.configured ? "Feet Request database connected." : "Preview presets shown until the Feet Request migration is applied.");
  const [busy, setBusy] = useState(false);
  const [pickerId, setPickerId] = useState<string | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<FeetRequest | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/admin/feet", { cache: "no-store" }).catch(() => null);
    const result = await response?.json().catch(() => ({})) as FeetData;
    if (response?.ok) setData({ configured: result.configured, presets: result.presets || [], requests: result.requests || [] });
  }, []);

  const action = useCallback(async (body: Record<string, unknown>) => {
    setBusy(true);
    const response = await fetch("/api/admin/feet", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const result = await response?.json().catch(() => ({})) as FeetData & { error?: string };
    if (response?.ok) { setData({ configured: result.configured, presets: result.presets || [], requests: result.requests || [] }); setMessage("Saved and audit logged."); }
    else setMessage(result.error || "The change could not be saved.");
    setBusy(false);
  }, []);

  function patchPreset(id: string, patch: Partial<FeetRequestPreset>) {
    setData((current) => ({ ...current, presets: current.presets.map((preset) => preset.id === id ? { ...preset, ...patch } : preset) }));
  }

  function chooseImage(asset: MediaAsset) {
    if (pickerId) patchPreset(pickerId, { thumbnailUrl: asset.publicUrl });
    setPickerId(null);
  }

  return <main className="admin-page admin-commerce-page">
    <header className="admin-header"><div><p className="kicker">ADMIN · FEET REQUESTS</p><h1>Feet Requests</h1><p>Create safe preset requests, review paid submissions, and manage status without creating a second wallet.</p></div><a className="secondary admin-link-button" href="/admin">Back to ADMIN</a></header>
    <p className="admin-inline-status" role="status">{message}</p>
    <section className="admin-commerce-panel"><header><div><p className="kicker">PRESET LIBRARY</p><h2>Request Presets</h2><p>Only ACTIVE presets appear on the public Feet page. Prices are whole coins and historical paid requests keep their snapshot.</p></div><button className="primary" type="button" disabled={busy} onClick={() => void action({ action: "preset-create", preset: { name: "New Feet Request", description: "Describe what this preset includes.", coinPrice: 20, status: "DRAFT", displayOrder: data.presets.length + 1 } })}>Add preset</button></header>
      <div className="admin-feet-preset-grid">{data.presets.map((preset, index) => <article className="admin-feet-preset" key={preset.id}><div className="admin-feet-preset-preview">{preset.thumbnailUrl ? <Image src={preset.thumbnailUrl} alt="" fill sizes="180px" /> : <span>No thumbnail</span>}</div><label>Name<input value={preset.name} maxLength={120} onChange={(event) => patchPreset(preset.id, { name: event.target.value })} /></label><label>Description<textarea value={preset.description} maxLength={500} rows={3} onChange={(event) => patchPreset(preset.id, { description: event.target.value })} /></label><label>Thumbnail URL<input value={preset.thumbnailUrl || ""} onChange={(event) => patchPreset(preset.id, { thumbnailUrl: event.target.value || null })} /></label><button className="secondary" type="button" onClick={() => setPickerId(preset.id)}>Choose from Media Library</button><DirectMediaUpload accept="image/jpeg,image/png,image/webp,image/avif" mediaClass="IMAGE" label="Upload thumbnail" disabled={busy} metadata={{ categoryId: "other", displayName: `${preset.name} thumbnail`, requestedStatus: "published", assignment: { resourceType: "feet_preset", resourceId: preset.id, role: "thumbnail" } }} onComplete={() => void refresh()} /><DirectMediaUpload accept=".mp4,.webm,.mov,video/mp4,video/webm,video/quicktime" mediaClass="VIDEO" label="Upload downloadable MP4" disabled={busy} metadata={{ categoryId: "other", displayName: `${preset.name} download`, requestedStatus: "private", assignment: { resourceType: "feet_preset", resourceId: preset.id, role: "download" } }} onComplete={() => void refresh()} /><div className="admin-field-row"><label>Price in coins<input type="number" min={1} max={100000} value={preset.coinPrice} onChange={(event) => patchPreset(preset.id, { coinPrice: Math.max(1, Math.floor(Number(event.target.value))) })} /><small>{money(coinsToUsdMinor(preset.coinPrice))} equivalent</small></label><label>Status<select value={preset.status} onChange={(event) => patchPreset(preset.id, { status: event.target.value as FeetRequestPreset["status"] })}>{FEET_PRESET_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label></div><div className="admin-feet-actions"><button className="primary" type="button" disabled={busy} onClick={() => void action({ action: "preset-save", preset })}>Save</button><button className="secondary" type="button" disabled={busy} onClick={() => void action({ action: "preset-duplicate", preset })}>Duplicate</button><button className="secondary" type="button" disabled={busy || index === 0} onClick={() => void action({ action: "preset-reorder", id: preset.id, direction: "up" })}>↑</button><button className="secondary" type="button" disabled={busy || index === data.presets.length - 1} onClick={() => void action({ action: "preset-reorder", id: preset.id, direction: "down" })}>↓</button><button className="secondary danger" type="button" disabled={busy || preset.status === "ARCHIVED"} onClick={() => void action({ action: "preset-status", id: preset.id, status: "ARCHIVED" })}>Archive</button></div></article>)}</div>
    </section>
    <section className="admin-commerce-panel"><header><div><p className="kicker">REQUEST INBOX</p><h2>Paid Requests</h2><p>Review customer details, status, and the immutable coin amount paid.</p></div><div className="admin-dashboard-widgets"><span>New<strong>{data.requests.filter((request) => ["PAID", "RECEIVED"].includes(request.status)).length}</strong></span><span>In progress<strong>{data.requests.filter((request) => ["ACCEPTED", "IN PROGRESS"].includes(request.status)).length}</strong></span><span>Completed<strong>{data.requests.filter((request) => request.status === "COMPLETED").length}</strong></span><span>Coins received<strong>{data.requests.reduce((total, request) => total + request.coinsPaid, 0)}</strong></span></div></header>{data.requests.length ? <div className="admin-feet-request-list">{data.requests.map((request) => <button className="admin-feet-request-row" type="button" key={request.id} onClick={() => setSelectedRequest(request)}><span><strong>{request.presetName}</strong><small>{request.customerReference} · {new Date(request.createdAt).toLocaleString()}</small></span><span>{request.coinsPaid} coins · <b>{request.status}</b></span></button>)}</div> : <p className="admin-empty-state">No paid Feet Requests are available.</p>}</section>
    {selectedRequest ? <div className="feet-confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setSelectedRequest(null); }}><section className="admin-feet-request-detail" role="dialog" aria-modal="true" aria-labelledby="feet-request-detail-title"><header><div><p className="kicker">REQUEST SUMMARY</p><h2 id="feet-request-detail-title">{selectedRequest.presetName}</h2></div><button className="icon-button" type="button" aria-label="Close" onClick={() => setSelectedRequest(null)}>×</button></header><div className="admin-feet-detail-grid"><span>Customer<strong>{selectedRequest.customerReference}</strong></span><span>Price paid<strong>{selectedRequest.coinsPaid} coins · {money(selectedRequest.usdValueMinor)}</strong></span><span>Created<strong>{new Date(selectedRequest.createdAt).toLocaleString()}</strong></span><span>Details<strong>{selectedRequest.requestDetails || "No additional details."}</strong></span></div><label>Status<select value={selectedRequest.status} onChange={(event) => setSelectedRequest({ ...selectedRequest, status: event.target.value as FeetRequest["status"] })}>{FEET_REQUEST_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label><label>Admin notes<textarea rows={4} defaultValue="" id="feet-admin-notes" placeholder="Add an internal note before saving a status change." /></label><footer><button className="secondary" type="button" onClick={() => setSelectedRequest(null)}>Close</button><button className="primary" type="button" disabled={busy} onClick={() => void action({ action: "request-status", requestId: selectedRequest.id, status: selectedRequest.status, adminNotes: (document.getElementById("feet-admin-notes") as HTMLTextAreaElement)?.value })}>Save status</button>{selectedRequest.status !== "REFUNDED" ? <button className="secondary danger" type="button" disabled={busy} onClick={() => void action({ action: "request-refund", requestId: selectedRequest.id, adminNotes: (document.getElementById("feet-admin-notes") as HTMLTextAreaElement)?.value })}>Refund coins</button> : null}</footer></section></div> : null}
    <ImagePicker open={Boolean(pickerId)} category="feet" title="Choose Feet Request thumbnail" onClose={() => setPickerId(null)} onSelect={chooseImage} />
  </main>;
}
