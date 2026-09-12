"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type State = "GREEN" | "YELLOW" | "RED";
type BackboneData = {
  configured: boolean;
  riskEvents: Array<Record<string, unknown>>;
  entitlements: Array<Record<string, unknown>>;
  supportCases: Array<Record<string, unknown>>;
  rights: Array<Record<string, unknown>>;
  accounting: Record<string, unknown>;
  costs: { currentMonth: number; estimatedMonthEnd: number; today: number; last7Days: number; last30Days: number; estimatedNet: number | null; budget: number | null; budgetPercent: number | null; alerts: string[]; byCategory: Record<string, number>; byFeature: Record<string, number> };
  launch: { overall: State; green: number; yellow: number; red: number; blockers: string[]; checks: Array<{ id: string; label: string; state: State; explanation: string; warnings: string[] }>; environment: string; release: string; rollbackReady: boolean; checkedAt: string };
  generatedAt: string;
};

const money = (minor: unknown) => `$${(Number(minor || 0) / 100).toFixed(2)}`;
const wholeMoney = (amount: unknown) => `$${Number(amount || 0).toFixed(2)}`;
const time = (value: unknown) => value ? new Date(String(value)).toLocaleString() : "Not recorded";

function Badge({ state }: { state: State | string }) {
  return <span className={`admin-health ${String(state).toLowerCase()}`}>{state}</span>;
}

function Empty({ children }: { children: string }) {
  return <p className="admin-empty-state">{children}</p>;
}

export default function BackboneCommandCenter() {
  const [data, setData] = useState<BackboneData | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Loading protected operational evidence...");

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/backbone", { cache: "no-store" });
    const next = await response.json().catch(() => ({})) as BackboneData & { message?: string };
    if (!response.ok) return setMessage(next.message || "The backbone command center could not load.");
    setData(next);
    setMessage(next.configured ? "Connected data is shown without exposing secrets or raw payment credentials." : "Supabase is not configured. All connected-system counts remain unverified.");
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    const response = await fetch("/api/admin/backbone", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json().catch(() => ({})) as { message?: string; launch?: BackboneData["launch"] };
    setBusy(false);
    setMessage(result.message || (response.ok ? "Administrative action recorded." : "The action could not be completed."));
    if (response.ok && result.launch) setData((current) => current ? { ...current, launch: result.launch! } : current);
    else if (response.ok) await load();
  }

  const attention = useMemo(() => data?.launch.checks.filter((check) => check.state !== "GREEN") || [], [data?.launch.checks]);
  if (!data) return <section className="admin-card backbone-command-center"><p role="status">{message}</p></section>;

  const accounting = data.accounting;
  return <div className="backbone-command-center">
    <section className="admin-auth-panel backbone-hero" id="launch">
      <header className="backbone-header"><div><p className="kicker">ADMIN / PRODUCTION BACKBONE</p><h1>Risk, Entitlements &amp; Launch</h1><p>Operational evidence for financial integrity, paid access, support, media rights, costs, and release readiness. This surface reports unknowns honestly.</p></div><Badge state={data.launch.overall} /></header>
      <div className="admin-quick-actions"><button className="primary" type="button" disabled={busy} onClick={() => void post({ action: "run-launch" })}>{busy ? "Checking..." : "Run readiness check"}</button><a className="secondary admin-link-button" href="/admin">Back to ADMIN</a><span className="backbone-meta">{data.launch.environment} · release {data.launch.release}</span></div>
      <p className="admin-inline-status" role="status">{message}</p>
      <div className="admin-dashboard-widgets"><article className="admin-dashboard-widget" data-state="green"><span>Green checks</span><strong>{data.launch.green}</strong><small>Verified in this run</small></article><article className="admin-dashboard-widget" data-state="yellow"><span>Warnings</span><strong>{data.launch.yellow}</strong><small>Needs configuration or review</small></article><article className="admin-dashboard-widget" data-state="red"><span>Blockers</span><strong>{data.launch.red}</strong><small>Launch-impacting gaps</small></article><article className="admin-dashboard-widget" data-state={data.launch.rollbackReady ? "green" : "yellow"}><span>Rollback</span><strong>{data.launch.rollbackReady ? "Ready" : "Unverified"}</strong><small>{time(data.launch.checkedAt)}</small></article></div>
      {data.launch.blockers.length ? <div className="backbone-alert-list">{data.launch.blockers.map((blocker) => <p key={blocker}>{blocker}</p>)}</div> : null}
    </section>

    <section className="admin-card backbone-panel" id="risk"><header className="backbone-panel-header"><div><p className="kicker">SAFETY / RISK ENGINE</p><h2>Risk Review Queue</h2><p>Review decisions are server-recorded. The browser never receives scoring configuration or sensitive payment data.</p></div><strong>{data.riskEvents.length} review items</strong></header>{data.riskEvents.length ? <div className="backbone-list">{data.riskEvents.slice(0, 20).map((event) => <article className="backbone-row" key={String(event.id)}><div><p><Badge state={String(event.risk_level || "UNREVIEWED")} /> <strong>{String(event.action_type || "Unknown action")}</strong></p><small>Score {String(event.risk_score || 0)} · {String(event.decision || "No decision")} · {time(event.created_at)}</small><p>{Array.isArray(event.reasons) ? (event.reasons as unknown[]).slice(0, 3).map(String).join(" · ") : "Evidence summary unavailable."}</p></div><div className="backbone-row-actions"><button className="secondary" type="button" disabled={busy} onClick={() => void post({ action: "risk-review", eventId: event.id, reviewStatus: "MONITORING", reason: "Reviewed by administrator; continue monitoring." })}>Monitor</button><button className="secondary" type="button" disabled={busy} onClick={() => void post({ action: "risk-review", eventId: event.id, reviewStatus: "RESTRICTED", reason: "Reviewed by administrator; restrict pending further evidence." })}>Restrict</button></div></article>)}</div> : <Empty>No high-risk or review-required events are currently available.</Empty>}</section>

    <section className="admin-card backbone-panel" id="entitlements"><header className="backbone-panel-header"><div><p className="kicker">COMMERCE / ENTITLEMENTS</p><h2>Paid Access Authority</h2><p>Central entitlement records are separate from customer wallet balances and can be held for refund or chargeback review.</p></div><strong>{data.entitlements.length} records</strong></header>{data.entitlements.length ? <div className="backbone-table-wrap"><table className="admin-table"><thead><tr><th>Resource</th><th>Customer</th><th>Status</th><th>Environment</th><th>Granted</th><th>Action</th></tr></thead><tbody>{data.entitlements.slice(0, 30).map((row) => <tr key={String(row.id)}><td>{String(row.resource_type)}<br /><small>{String(row.resource_id)}</small></td><td>{String(row.customer_id)}</td><td>{String(row.status)}</td><td>{String(row.environment)}</td><td>{time(row.granted_at)}</td><td>{["ACTIVE", "PENDING"].includes(String(row.status)) ? <button className="secondary" type="button" disabled={busy} onClick={() => void post({ action: "entitlement-status", entitlementId: row.id, status: "ADMIN_HOLD", reason: "Administrative hold pending review." })}>Hold</button> : "—"}</td></tr>)}</tbody></table></div> : <Empty>No central entitlement rows are available. Legacy protected purchases remain supported by the download guard.</Empty>}</section>

    <section className="admin-card backbone-panel" id="accounting"><header className="backbone-panel-header"><div><p className="kicker">FINANCE / ACCOUNTING</p><h2>Accounting &amp; Cost Control</h2><p>Cash movement is shown separately from the estimated operating result. Tax is not invented when no approved provider or rules are configured.</p></div><strong>{String(accounting.taxStatus || "TAX CONFIGURATION REQUIRED")}</strong></header><div className="admin-dashboard-widgets"><article className="admin-dashboard-widget" data-state="green"><span>Gross revenue</span><strong>{money(accounting.grossRevenueMinor)}</strong><small>Server ledger records</small></article><article className="admin-dashboard-widget"><span>Processor fees</span><strong>{money(accounting.processorFeesMinor)}</strong><small>Recorded fees</small></article><article className="admin-dashboard-widget"><span>Fulfillment</span><strong>{money(accounting.fulfillmentCostsMinor)}</strong><small>Recorded costs</small></article><article className="admin-dashboard-widget" data-state="yellow"><span>Estimated operating result</span><strong>{money(accounting.estimatedOperatingResultMinor)}</strong><small>Estimated, not tax advice</small></article><article className="admin-dashboard-widget"><span>Pending funds</span><strong>{money(accounting.pendingFundsMinor)}</strong><small>Not settled payout cash</small></article><article className="admin-dashboard-widget"><span>Settled payouts</span><strong>{money(accounting.settledPayoutsMinor)}</strong><small>Permanent payout history</small></article></div><div className="backbone-cost-grid"><div><h3>Cost snapshot</h3><p>Today <strong>{wholeMoney(data.costs.today)}</strong> · 7 days <strong>{wholeMoney(data.costs.last7Days)}</strong> · 30 days <strong>{wholeMoney(data.costs.last30Days)}</strong></p><p>Projected month end <strong>{wholeMoney(data.costs.estimatedMonthEnd)}</strong> · budget <strong>{data.costs.budget ? wholeMoney(data.costs.budget) : "Not configured"}</strong></p>{data.costs.alerts.map((alert) => <p className="admin-warning" key={alert}>{alert}</p>)}</div><div><h3>Largest cost categories</h3>{Object.entries(data.costs.byCategory).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([category, value]) => <p key={category}><span>{category}</span><strong>{wholeMoney(value)}</strong></p>)}{!Object.keys(data.costs.byCategory).length ? <Empty>No provider or manual cost records are connected.</Empty> : null}</div></div></section>

    <section className="admin-card backbone-panel" id="support-cases"><header className="backbone-panel-header"><div><p className="kicker">CUSTOMER SUPPORT</p><h2>Support Cases</h2><p>Cases are ready for continuity across Maya, Riley, Nova, and Sage without exposing internal specialists to visitors.</p></div><strong>{data.supportCases.length} cases</strong></header>{data.supportCases.length ? <div className="backbone-list">{data.supportCases.slice(0, 20).map((row) => <article className="backbone-row" key={String(row.id)}><div><p><strong>{String(row.subject)}</strong> <Badge state={String(row.priority || "NORMAL")} /></p><small>{String(row.category)} · {String(row.status)} · updated {time(row.updated_at)}</small></div><button className="secondary" type="button" disabled={busy || ["RESOLVED", "CLOSED"].includes(String(row.status))} onClick={() => void post({ action: "support-status", caseId: row.id, status: "IN REVIEW", reason: "Assigned for administrator review." })}>Review</button></article>)}</div> : <Empty>No support cases are currently available.</Empty>}</section>

    <section className="admin-card backbone-panel" id="rights-media"><header className="backbone-panel-header"><div><p className="kicker">CONTENT / MEDIA RIGHTS</p><h2>Rights Review</h2><p>Upload does not imply ownership. Publish checks can remain in monitor mode or enforce cleared rights before release.</p></div><strong>{data.rights.length} records</strong></header>{data.rights.length ? <div className="backbone-table-wrap"><table className="admin-table"><thead><tr><th>Media</th><th>Rights</th><th>Status</th><th>Commercial</th><th>Expires</th><th>Action</th></tr></thead><tbody>{data.rights.slice(0, 30).map((row) => <tr key={String(row.media_id)}><td>{String(row.title)}<br /><small>{String(row.media_id)}</small></td><td>{String(row.rights_type)}</td><td>{String(row.status)}</td><td>{row.commercial_use_allowed === null ? "Unknown" : row.commercial_use_allowed ? "Yes" : "No"}</td><td>{time(row.expires_at)}</td><td>{String(row.status) === "REVIEW REQUIRED" ? <button className="secondary" type="button" disabled={busy} onClick={() => void post({ action: "rights-status", mediaId: row.media_id, status: "RESTRICTED", reason: "Rights evidence requires review before publishing." })}>Restrict</button> : "—"}</td></tr>)}</tbody></table></div> : <Empty>No media rights records are currently available.</Empty>}</section>

    <section className="admin-card backbone-panel" id="readiness"><header className="backbone-panel-header"><div><p className="kicker">LAUNCH COMMAND CENTER</p><h2>Readiness Evidence</h2></div><span>{attention.length} items need attention</span></header><div className="backbone-readiness-list">{data.launch.checks.map((check) => <article key={check.id}><div><Badge state={check.state} /><strong>{check.label}</strong></div><p>{check.explanation}</p>{check.warnings.map((warning) => <small key={warning}>{warning}</small>)}</article>)}</div></section>
  </div>;
}
