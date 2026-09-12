"use client";

type Service = { id: string; label: string; status: string; health: string; provider: string };
type Snapshot = { services: Service[]; environment: string; generatedAt: string };

const destinations = [
  ["Live playback diagnostics", "/admin/system/live-diagnostics"],
  ["Chat management", "/admin/chat"],
  ["Tip menu and live wallet", "/admin/tips"],
  ["Earnings and live economics", "/admin/analytics/earnings"],
  ["Pre-launch notifications", "/admin/prelaunch"],
  ["Operationalization Center", "/admin/operationalization"],
  ["Upcoming and announcements", "/admin/catalog"],
  ["Infrastructure status", "/admin/system/infrastructure"],
  ["Reliability Center", "/admin/reliability"]
] as const;

function service(snapshot: Snapshot, id: string) {
  return snapshot.services.find((item) => item.id === id);
}

export default function LiveControlRoom({ snapshot }: { snapshot: Snapshot }) {
  const tracked = ["streaming", "database", "audit-ledger", "rate-limiting", "risk-engine", "entitlements"]
    .map((id) => service(snapshot, id))
    .filter((item): item is Service => Boolean(item));

  return <div className="live-control-room">
    <section className="admin-card live-control-overview" aria-labelledby="live-control-overview-title">
      <header>
        <div><p className="kicker">ADMIN · LIVE OPERATIONS</p><h2 id="live-control-overview-title">Live Control Room</h2><p>One protected launch point for playback diagnostics, audience operations, contribution rules, and the existing reliability tools.</p></div>
        <span className={`admin-health ${snapshot.environment === "PRODUCTION" ? "yellow" : "green"}`}>{snapshot.environment}</span>
      </header>
      <div className="live-control-service-grid">{tracked.map((item) => <article key={item.id}><span>{item.label}</span><strong className={`status-${item.status.toLowerCase().replaceAll(" ", "-")}`}>{item.status}</strong><small>{item.provider} · {item.health}</small></article>)}</div>
      <p className="admin-update-note">Live rules remain server-owned: 10 coins / $5 entry, 300-second post-entry grace, and 32 coins / $16 per hour. This view does not bypass contribution, wallet, or access-control checks.</p>
    </section>
    <section className="admin-card live-control-destinations" aria-labelledby="live-control-destinations-title">
      <div><p className="kicker">EXISTING PROTECTED TOOLS</p><h2 id="live-control-destinations-title">Open an operations surface</h2></div>
      <div className="live-control-link-grid">{destinations.map(([label, href]) => <a className="secondary admin-link-button" href={href} key={href}>{label}</a>)}</div>
    </section>
  </div>;
}
