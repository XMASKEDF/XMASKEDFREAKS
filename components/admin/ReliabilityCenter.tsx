"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  HealthCheck,
  ReliabilityCenterData,
  ReliabilityIncident,
  ReliabilityStatus
} from "@/lib/reliability/types";
import { formatDateTimeInZone, platformTimeZone } from "@/lib/timezone";

const tabs = [
  "Live System Status",
  "Active Incidents",
  "Recent Errors",
  "Wallet and Payment Health",
  "Order and Fulfillment Health",
  "Database Health",
  "API and Integration Health",
  "Security Events",
  "Performance",
  "Background Jobs",
  "Browser Errors",
  "Recovery Actions",
  "Backups",
  "Deployment History",
  "Kill Switch",
  "Incident History"
] as const;
type Tab = typeof tabs[number];

const statuses: ReliabilityStatus[] = ["Detected", "Investigating", "Contained", "Monitoring", "Resolved", "False Positive", "Requires Vendor", "Requires Admin Action"];
const severityLabels = ["", "Informational", "Warning", "Degraded", "Critical", "Emergency"];

export default function ReliabilityCenter({ initialData, adminName }: { initialData: ReliabilityCenterData; adminName: string }) {
  const [data, setData] = useState(initialData);
  const [tab, setTab] = useState<Tab>("Live System Status");
  const [severity, setSeverity] = useState("all");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ReliabilityIncident | null>(null);
  const [message, setMessage] = useState(initialData.configured ? "" : "Database monitoring is not connected. Configuration checks remain visible and are marked unverified.");
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    const response = await fetch("/api/admin/reliability", { cache: "no-store" }).catch(() => null);
    const next = response?.ok ? await response.json() as ReliabilityCenterData : null;
    if (next) setData(next);
    else setMessage("Reliability data could not be refreshed. Existing evidence remains displayed.");
    setRefreshing(false);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!document.hidden && (tab === "Live System Status" || tab === "Active Incidents")) void refresh();
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [refresh, tab]);

  const filteredIncidents = useMemo(() => data.incidents.filter((incident) => {
    if (severity !== "all" && incident.severity !== Number(severity)) return false;
    if (status !== "all" && incident.status !== status) return false;
    const value = `${incident.title} ${incident.feature} ${incident.affected_route || ""} ${incident.correlation_id}`.toLowerCase();
    return value.includes(search.trim().toLowerCase());
  }), [data.incidents, search, severity, status]);

  async function updateIncident(incident: ReliabilityIncident, nextStatus: ReliabilityStatus, notes: string) {
    const response = await fetch("/api/admin/reliability", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ incidentId: incident.id, status: nextStatus, notes, assignToMe: true })
    });
    const result = await response.json();
    setMessage(response.ok ? `Incident ${incident.correlation_id} updated by ${adminName}.` : result.message || "Incident update failed.");
    if (response.ok) {
      setSelected(null);
      await refresh();
    }
  }

  async function resetProviderCircuit(provider: string) {
    if (!window.confirm(`Reset the ${provider} circuit and allow one new provider probe?`)) return;
    const response = await fetch("/api/admin/reliability", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "reset-circuit", provider, confirmed: true })
    });
    const result = await response.json().catch(() => ({})) as { message?: string };
    setMessage(response.ok ? `${provider} circuit reset. The next request will perform a fresh probe.` : result.message || "Circuit reset failed.");
    if (response.ok) await refresh();
  }

  function exportIncident(incident: ReliabilityIncident) {
    const report = {
      reference: incident.correlation_id,
      title: incident.title,
      explanation: incident.plain_explanation,
      severity: severityLabels[incident.severity],
      status: incident.status,
      feature: incident.feature,
      route: incident.affected_route,
      firstDetected: incident.first_detected_at,
      lastOccurrence: incident.last_occurred_at,
      occurrences: incident.occurrence_count,
      affectedCustomers: incident.affected_customer_count,
      affectedOrders: incident.affected_order_count,
      affectedWalletTransactions: incident.affected_wallet_transaction_count,
      automaticResponse: incident.automatic_response,
      recoveryResult: incident.recovery_result,
      recommendedAction: incident.recommended_admin_action,
      resolutionNotes: incident.resolution_notes,
      deploymentVersion: incident.deployment_version
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${incident.correlation_id}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <>
      <section className="reliability-status-bar" data-status={data.overallStatus}>
        <div><span>Overall status</span><strong>{data.overallStatus}</strong></div>
        <button className="primary" type="button" disabled={refreshing} onClick={() => void refresh()}>{refreshing ? "Checking..." : "Run health checks"}</button>
      </section>

      <section className="reliability-daily" aria-label="Daily reliability summary">
        <Metric label="Incidents today" value={data.daily.total} />
        <Metric label="New" value={data.daily.newIncidents} />
        <Metric label="Resolved" value={data.daily.resolved} />
        <Metric label="Active" value={data.daily.active} />
        <Metric label="Critical" value={data.daily.critical} alert={data.daily.critical > 0} />
        <Metric label="Affected customers" value={data.daily.affectedCustomers} />
        <Metric label="Financial issues" value={data.daily.financial} alert={data.daily.financial > 0} />
        <Metric label="Browser incidents" value={data.daily.browser} />
      </section>

      {message ? <p className="reliability-message" role="status">{message}</p> : null}

      <nav className="reliability-tabs" aria-label="Reliability Center sections">
        {tabs.map((item) => <button type="button" className={tab === item ? "is-active" : ""} onClick={() => setTab(item)} key={item}>{item}</button>)}
      </nav>

      {(tab === "Active Incidents" || tab === "Recent Errors" || tab === "Incident History" || tab === "Browser Errors") ? (
        <section className="reliability-toolbar">
          <input aria-label="Search incidents" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search incidents, routes, features, references" />
          <select aria-label="Filter by severity" value={severity} onChange={(event) => setSeverity(event.target.value)}>
            <option value="all">All severities</option>
            {[1, 2, 3, 4, 5].map((value) => <option value={value} key={value}>Severity {value} · {severityLabels[value]}</option>)}
          </select>
          <select aria-label="Filter by status" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">All statuses</option>
            {statuses.map((value) => <option value={value} key={value}>{value}</option>)}
          </select>
        </section>
      ) : null}

      <section className="reliability-panel">
        {tab === "Live System Status" ? <HealthGrid checks={data.checks} /> : null}
        {tab === "Active Incidents" ? <><IncidentList incidents={filteredIncidents.filter((item) => !["Resolved", "False Positive"].includes(item.status))} onOpen={setSelected} />{data.alerts.length ? <><h2>Recent administrator alerts</h2><RecordTable rows={data.alerts} empty="No administrator alerts are queued." /></> : null}</> : null}
        {tab === "Recent Errors" ? <IncidentList incidents={filteredIncidents} onOpen={setSelected} /> : null}
        {tab === "Wallet and Payment Health" ? <WalletHealth data={data} /> : null}
        {tab === "Order and Fulfillment Health" ? <><JobTable jobs={data.jobs} /><h2>Printify reconciliation findings</h2><RecordTable rows={data.printifyFindings} empty="No open Printify reconciliation findings were returned." /></> : null}
        {tab === "Database Health" ? <HealthGrid checks={checksFor(data.checks, ["Database Health", "Authentication"])} /> : null}
        {tab === "API and Integration Health" ? <HealthGrid checks={checksFor(data.checks, ["API and Integration Health", "Live System Status"])} /> : null}
        {tab === "Security Events" ? <RecordTable rows={data.securityEvents} empty="No security events were returned." /> : null}
        {tab === "Performance" ? <PerformancePanel checks={data.checks} /> : null}
        {tab === "Background Jobs" ? <><HealthGrid checks={checksFor(data.checks, ["Background Jobs"])} /><JobTable jobs={data.jobs} /></> : null}
        {tab === "Browser Errors" ? <IncidentList incidents={filteredIncidents.filter((item) => item.feature === "Browser" || item.feature === "Frontend")} onOpen={setSelected} /> : null}
        {tab === "Recovery Actions" ? <RecoveryPanel circuits={data.circuitStates} onReset={resetProviderCircuit} /> : null}
        {tab === "Backups" ? <RecordTable rows={data.backups} empty="No backup evidence has been connected. Production launch remains blocked until backup and restore tests are recorded." /> : null}
        {tab === "Deployment History" ? <RecordTable rows={data.deployments} empty="No deployment history provider is connected." /> : null}
        {tab === "Kill Switch" ? <MaintenancePanel maintenance={data.maintenance} /> : null}
        {tab === "Incident History" ? <IncidentList incidents={filteredIncidents} onOpen={setSelected} /> : null}
      </section>

      {selected ? <IncidentDialog incident={selected} onClose={() => setSelected(null)} onUpdate={updateIncident} onExport={exportIncident} /> : null}
    </>
  );
}

function Metric({ label, value, alert = false }: { label: string; value: number; alert?: boolean }) {
  return <article data-alert={alert}><span>{label}</span><strong>{value.toLocaleString()}</strong></article>;
}

function checksFor(checks: HealthCheck[], categories: string[]) {
  return checks.filter((item) => categories.includes(item.category));
}

function HealthGrid({ checks }: { checks: HealthCheck[] }) {
  return <div className="reliability-health-grid">{checks.length ? checks.map((item) => <article data-state={item.state} key={item.id}><header><span>{item.category}</span><strong>{item.state}</strong></header><h2>{item.label}</h2><p>{item.detail}</p><footer><span>Reachable: {item.reachable === null ? "Unverified" : item.reachable ? "Yes" : "No"}</span><span>Functional: {item.functional === null ? "Unverified" : item.functional ? "Yes" : "No"}</span><span>Latency: {item.latencyMs === null ? "Unverified" : `${item.latencyMs} ms`}</span></footer></article>) : <Empty text="No health checks are available." />}</div>;
}

function IncidentList({ incidents, onOpen }: { incidents: ReliabilityIncident[]; onOpen: (incident: ReliabilityIncident) => void }) {
  return <div className="reliability-incident-list">{incidents.length ? incidents.map((incident) => <article data-severity={incident.severity} key={incident.id}><div><span>SEV {incident.severity} · {severityLabels[incident.severity]}</span><strong>{incident.feature}</strong><time dateTime={incident.last_occurred_at}>{formatDateTimeInZone(new Date(incident.last_occurred_at), platformTimeZone, "en-US")}</time></div><h2>{incident.title}</h2><p>{incident.plain_explanation}</p><footer><span>{incident.correlation_id}</span><span>{incident.occurrence_count} occurrence{incident.occurrence_count === 1 ? "" : "s"}</span><span>{incident.affected_customer_count} affected</span><span>{incident.status}</span><button type="button" onClick={() => onOpen(incident)}>Open incident</button></footer></article>) : <Empty text="No incidents match this view." />}</div>;
}

function WalletHealth({ data }: { data: ReliabilityCenterData }) {
  return <><div className="reliability-split"><section><h2>Wallet integrity holds</h2><p>New spending is blocked for inconsistent wallets. The system never invents, deletes, or silently changes coins.</p>{data.walletMismatches.length ? data.walletMismatches.map((item) => <article className="reliability-financial-row" key={item.user_id}><strong>Customer {item.user_id.slice(0, 8)}</strong><span>Saved: {item.actual_balance}</span><span>Ledger: {item.expected_balance}</span><b>RECONCILIATION REQUIRED</b></article>) : <Empty text="No wallet mismatches were detected." />}</section><HealthGrid checks={checksFor(data.checks, ["Wallet and Payment Health"])} /></div><h2>Hosted payment reconciliation</h2><RecordTable rows={data.paymentFindings} empty="No open hosted-payment reconciliation findings were returned." /></>;
}

function JobTable({ jobs }: { jobs: Array<Record<string, unknown>> }) {
  return <RecordTable rows={jobs} empty="No failed, retrying, or review-required fulfillment jobs were returned." />;
}

function RecordTable({ rows, empty }: { rows: Array<Record<string, unknown>>; empty: string }) {
  if (!rows.length) return <Empty text={empty} />;
  return <div className="reliability-record-table">{rows.slice(0, 200).map((row, index) => <article key={String(row.id || index)}>{Object.entries(row).slice(0, 8).map(([key, value]) => <span key={key}><small>{key.replaceAll("_", " ")}</small><strong>{value === null ? "—" : typeof value === "object" ? JSON.stringify(value) : String(value)}</strong></span>)}</article>)}</div>;
}

function PerformancePanel({ checks }: { checks: HealthCheck[] }) {
  const measured = checks.filter((item) => item.latencyMs !== null).sort((a, b) => (b.latencyMs || 0) - (a.latencyMs || 0));
  return <section><h2>Protected health-check latency</h2><p>These are internal check durations, not invented visitor performance metrics.</p><div className="reliability-latency">{measured.map((item) => <div key={item.id}><span>{item.label}</span><meter min={0} max={Math.max(item.thresholdMs * 2, item.latencyMs || 1)} value={item.latencyMs || 0} /><strong>{item.latencyMs} ms</strong></div>)}</div></section>;
}

function RecoveryPanel({ circuits, onReset }: { circuits: ReliabilityCenterData["circuitStates"]; onReset: (provider: string) => Promise<void> }) {
  return <><div className="reliability-split"><section><p className="kicker">Approved low risk</p><h2>Safe automatic recovery</h2><ul><li>Retry temporary provider and queued-job failures with limits.</li><li>Reconnect realtime delivery and refresh stale caches.</li><li>Open a circuit breaker to stop request storms.</li><li>Isolate one broken noncritical feature.</li><li>Place failed fulfillment in a review queue when no remote order exists.</li></ul></section><section><p className="kicker">Administrator approval required</p><h2>Never automatic</h2><ul><li>Changing wallet balances or deleting ledger records.</li><li>Inventing orders or reversing completed payments.</li><li>Restoring a database or deleting customer data.</li><li>Changing administrator permissions.</li><li>Publishing hidden content or deploying production.</li></ul></section></div><section className="reliability-circuits"><h2>Runtime circuit breakers</h2>{circuits.length ? circuits.map((circuit) => <article key={circuit.provider}><span>{circuit.provider}</span><strong>{circuit.state}</strong><small>{circuit.failures} consecutive failure{circuit.failures === 1 ? "" : "s"}</small>{circuit.state !== "closed" ? <button className="secondary" type="button" onClick={() => void onReset(circuit.provider)}>Confirm reset</button> : null}</article>) : <Empty text="No provider circuits have recorded failures in this server process." />}</section></>;
}

function MaintenancePanel({ maintenance }: { maintenance: Record<string, unknown> | null }) {
  return <section className="reliability-maintenance"><p className="kicker">Controlled containment</p><h2>{maintenance?.enabled ? "Kill Switch is active" : "Kill Switch is inactive"}</h2><p>{String(maintenance?.message || "Use the protected Kill Switch editor to contain a serious outage. Verified callbacks and recovery jobs remain preserved.")}</p><a className="primary admin-link-button" href="/admin/prelaunch">Open Kill Switch controls</a><a className="secondary admin-link-button" href="/kill-switch">Preview public status page</a></section>;
}

function IncidentDialog({ incident, onClose, onUpdate, onExport }: { incident: ReliabilityIncident; onClose: () => void; onUpdate: (incident: ReliabilityIncident, status: ReliabilityStatus, notes: string) => Promise<void>; onExport: (incident: ReliabilityIncident) => void }) {
  const [nextStatus, setNextStatus] = useState<ReliabilityStatus>(incident.status);
  const [notes, setNotes] = useState(incident.resolution_notes || "");
  const [saving, setSaving] = useState(false);
  return <div className="reliability-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><section className="reliability-dialog" role="dialog" aria-modal="true" aria-labelledby="incident-title"><header><div><p className="kicker">{incident.correlation_id}</p><h2 id="incident-title">{incident.title}</h2></div><button type="button" aria-label="Close incident" onClick={onClose}>×</button></header><div className="reliability-incident-facts"><span>Severity<strong>SEV {incident.severity} · {severityLabels[incident.severity]}</strong></span><span>Status<strong>{incident.status}</strong></span><span>Feature<strong>{incident.feature}</strong></span><span>Route<strong>{incident.affected_route || "Not route-specific"}</strong></span><span>Occurrences<strong>{incident.occurrence_count}</strong></span><span>Deployment<strong>{incident.deployment_version || "Unverified"}</strong></span></div><h3>What happened</h3><p>{incident.plain_explanation}</p><h3>Automatic protection</h3><p>{incident.automatic_response || "No automatic action was recorded."}</p><h3>Recommended action</h3><p>{incident.recommended_admin_action || "Investigate the grouped evidence and confirm impact."}</p><label>Status<select value={nextStatus} onChange={(event) => setNextStatus(event.target.value as ReliabilityStatus)}>{statuses.map((item) => <option key={item}>{item}</option>)}</select></label><label>Investigation or resolution notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={5} /></label><footer><button className="secondary" type="button" onClick={() => onExport(incident)}>Export sanitized report</button><button className="primary" type="button" disabled={saving} onClick={async () => { setSaving(true); await onUpdate(incident, nextStatus, notes); setSaving(false); }}>{saving ? "Saving..." : "Assign to me and save"}</button></footer></section></div>;
}

function Empty({ text }: { text: string }) {
  return <div className="admin-empty-state"><h2>No active evidence</h2><p>{text}</p></div>;
}
