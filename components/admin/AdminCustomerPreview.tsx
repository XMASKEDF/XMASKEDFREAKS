"use client";

import { useState } from "react";

const previewRoutes = [
  ["Live", "/live"],
  ["Merch", "/merch"],
  ["Games", "/games"],
  ["Audio Clips", "/audio-clips"],
  ["Upcoming", "/upcoming"],
  ["Paintings", "/paintings"],
  ["Feedback", "/feedback"]
] as const;

export default function AdminCustomerPreview() {
  const [route, setRoute] = useState("/live");
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");
  const [revision, setRevision] = useState(0);
  const previewUrl = `${route}?customer-preview=1`;

  return (
    <section className="admin-customer-preview" aria-label="Customer preview">
      <header>
        <div>
          <p className="kicker">CUSTOMER VIEW</p>
          <h2>View From Admin Side</h2>
          <p>Inspect the public experience without exposing Admin controls to visitors.</p>
        </div>
        <a className="secondary admin-link-button" href={previewUrl} target="_blank" rel="noopener noreferrer">Open visitor view</a>
      </header>
      <div className="admin-preview-toolbar">
        <label>Route<select value={route} onChange={(event) => setRoute(event.target.value)}>{previewRoutes.map(([label, value]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <div className="admin-preview-modes" aria-label="Preview viewport">
          <button className={viewport === "desktop" ? "primary" : "secondary"} type="button" onClick={() => setViewport("desktop")}>Desktop</button>
          <button className={viewport === "mobile" ? "primary" : "secondary"} type="button" onClick={() => setViewport("mobile")}>Mobile</button>
        </div>
        <button className="secondary" type="button" onClick={() => setRevision((value) => value + 1)}>Refresh</button>
      </div>
      <div className={`admin-preview-frame admin-preview-${viewport}`}>
        <iframe key={`${previewUrl}-${revision}`} title={`Customer ${viewport} preview`} src={previewUrl} sandbox="allow-forms allow-modals allow-popups allow-scripts" />
      </div>
    </section>
  );
}
