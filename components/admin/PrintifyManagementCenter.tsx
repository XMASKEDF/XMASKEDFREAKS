"use client";

import { useMemo, useState } from "react";

type Row = Record<string, unknown>;
type ManagementData = {
  configured: boolean;
  providerMode: string;
  settings: Row | null;
  health: { configured: boolean; functional: boolean | null; status: number | null; latencyMs: number | null; rateLimitRemaining: number | null; detail: string };
  queue: Row[];
  syncRuns: Row[];
  products: Row[];
  providers: Row[];
  shippingRates: Row[];
  findings: Row[];
  apiLogs: Row[];
  orderSnapshots: Row[];
  metrics: Row[];
};

const tabs = ["Overview", "Products", "Inventory & Shipping", "Order Queue", "Reconciliation", "Providers", "API Logs", "Settings"] as const;
type Tab = typeof tabs[number];

const boolSettings = [
  ["enabled", "Printify operations"],
  ["product_sync_enabled", "Product synchronization"],
  ["inventory_sync_enabled", "Availability synchronization"],
  ["provider_sync_enabled", "Provider synchronization"],
  ["shipping_sync_enabled", "Shipping-rate synchronization"],
  ["reconciliation_enabled", "Order reconciliation"],
  ["automatic_retry_enabled", "Automatic temporary-failure retries"]
] as const;

function when(value: unknown) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(String(value)));
}

function downloadReport(data: ManagementData) {
  const header = ["area", "id", "status", "detail", "updated"];
  const lines = [
    ...data.queue.map((row) => ["queue", row.id, row.status, row.last_error_code || "", row.updated_at]),
    ...data.findings.map((row) => ["finding", row.id, row.status, row.summary, row.last_detected_at]),
    ...data.syncRuns.map((row) => ["sync", row.id, row.status, row.sync_type, row.started_at])
  ].map((values) => values.map((value) => JSON.stringify(String(value ?? ""))).join(","));
  const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = `printify-operations-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(href);
}

export default function PrintifyManagementCenter({ initialData }: { initialData: ManagementData }) {
  const [data, setData] = useState(initialData);
  const [tab, setTab] = useState<Tab>("Overview");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("Ready.");
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState<Row>(initialData.settings || {});

  const queue = useMemo(() => data.queue.filter((row) => `${row.id} ${row.order_id} ${row.status} ${row.last_error_code || ""}`.toLowerCase().includes(search.toLowerCase())), [data.queue, search]);
  const findings = useMemo(() => data.findings.filter((row) => `${row.finding_type} ${row.summary} ${row.status}`.toLowerCase().includes(search.toLowerCase())), [data.findings, search]);
  const failedJobs = data.queue.filter((row) => ["failed", "manual_approval"].includes(String(row.status))).length;
  const openFindings = data.findings.filter((row) => ["open", "investigating"].includes(String(row.status))).length;
  const successLogs = data.apiLogs.filter((row) => row.success === true).length;
  const successRate = data.apiLogs.length ? Math.round(successLogs / data.apiLogs.length * 100) : null;
  const metricTrend = useMemo(() => {
    const byDate = new Map<string, { orders: number; revenue: number; failures: number; fulfilled: number }>();
    for (const row of data.metrics) {
      const date = String(row.metric_date || "");
      const current = byDate.get(date) || { orders: 0, revenue: 0, failures: 0, fulfilled: 0 };
      current.orders += Number(row.order_count || 0);
      current.revenue += Number(row.revenue_minor || 0);
      current.failures += Number(row.failed_orders || 0);
      current.fulfilled += Number(row.fulfilled_orders || 0);
      byDate.set(date, current);
    }
    return [...byDate.entries()].sort(([left], [right]) => left.localeCompare(right)).slice(-14);
  }, [data.metrics]);
  const trendMaximum = Math.max(1, ...metricTrend.map(([, value]) => value.orders + value.fulfilled + value.failures));

  async function action(name: string, extra: Row = {}) {
    setBusy(true);
    setStatus(`Running ${name.replaceAll("-", " ")}...`);
    const response = await fetch("/api/admin/printify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: name, ...extra }) }).catch(() => null);
    const result = response ? await response.json().catch(() => ({})) as { error?: string; data?: ManagementData } : {};
    if (response?.ok && result.data) {
      setData(result.data);
      setSettings(result.data.settings || {});
      setStatus(`${name.replaceAll("-", " ")} completed and audit logged.`);
    } else setStatus(result.error || "The operation did not complete.");
    setBusy(false);
  }

  return <div className="printify-center">
    <section className="admin-commerce-panel printify-command-bar">
      <div>
        <p className="kicker">PROVIDER STATUS</p>
        <h2>{data.health.functional === true ? "Operational" : data.health.functional === false ? "Needs attention" : "Unverified"}</h2>
        <p>{data.health.detail}</p>
      </div>
      <div className="printify-actions">
        <button className="primary" type="button" disabled={busy} onClick={() => void action("sync-all")}>Sync all</button>
        <button className="secondary" type="button" disabled={busy} onClick={() => void action("health")}>Run health check</button>
        <button className="secondary" type="button" onClick={() => downloadReport(data)}>Export report</button>
      </div>
    </section>
    <p className="admin-inline-status" role="status">{status}</p>
    <section className="printify-metrics" aria-label="Printify operational summary">
      <span><small>Mode</small><strong>{data.providerMode.toUpperCase()}</strong></span>
      <span><small>API latency</small><strong>{data.health.latencyMs === null ? "UNVERIFIED" : `${data.health.latencyMs} ms`}</strong></span>
      <span><small>Queue attention</small><strong>{failedJobs}</strong></span>
      <span><small>Open findings</small><strong>{openFindings}</strong></span>
      <span><small>API success</small><strong>{successRate === null ? "UNVERIFIED" : `${successRate}%`}</strong></span>
      <span><small>Cached rates</small><strong>{data.shippingRates.length}</strong></span>
    </section>
    <nav className="printify-tabs" aria-label="Printify management sections">
      {tabs.map((item) => <button type="button" className={tab === item ? "is-active" : ""} onClick={() => setTab(item)} key={item}>{item}</button>)}
    </nav>
    {["Order Queue", "Reconciliation"].includes(tab) && <label className="printify-search">Search operations<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Order, status, error, or finding" /></label>}

    {tab === "Overview" && <section className="printify-dashboard-grid">
      <article className="admin-commerce-panel"><h3>Synchronization</h3><p>{data.syncRuns.length ? `Latest: ${String(data.syncRuns[0].sync_type)} · ${String(data.syncRuns[0].status)}` : "No synchronization history yet."}</p><p>Last run: {when(data.syncRuns[0]?.started_at)}</p><div className="printify-actions"><button type="button" className="secondary" disabled={busy} onClick={() => void action("sync-products")}>Products</button><button type="button" className="secondary" disabled={busy} onClick={() => void action("sync-providers")}>Providers</button><button type="button" className="secondary" disabled={busy} onClick={() => void action("sync-shipping")}>Shipping</button></div></article>
      <article className="admin-commerce-panel"><h3>Fulfillment queue</h3><strong>{data.queue.length} recorded jobs</strong><p>{failedJobs ? `${failedJobs} need review before retry.` : "No terminal queue failures."}</p><button type="button" className="secondary" onClick={() => setTab("Order Queue")}>Open queue</button></article>
      <article className="admin-commerce-panel"><h3>Reconciliation</h3><strong>{openFindings} unresolved</strong><p>The scanner flags mismatches and never creates replacement orders.</p><button type="button" className="secondary" disabled={busy} onClick={() => void action("reconcile")}>Compare now</button></article>
      <article className="admin-commerce-panel"><h3>Historical activity</h3><strong>{data.orderSnapshots.length} provider orders</strong><p>{data.products.length} provider products and {data.providers.length} providers in the local operational cache.</p></article>
      <article className="admin-commerce-panel printify-wide"><h3>14-day provider activity</h3>{metricTrend.length ? <div className="printify-trend" role="img" aria-label="Printify orders, fulfillment, and failure trend for the last 14 recorded days">{metricTrend.map(([date, value]) => <span key={date} title={`${date}: ${value.orders} orders, ${value.fulfilled} fulfilled, ${value.failures} failed`}><i style={{ height: `${Math.max(6, (value.orders + value.fulfilled + value.failures) / trendMaximum * 100)}%` }} /><small>{date.slice(5)}</small></span>)}</div> : <p>Historical provider metrics are UNVERIFIED until live fulfillment events are recorded.</p>}</article>
      <article className="admin-commerce-panel printify-wide"><h3>Recent synchronization history</h3><div className="printify-table-wrap"><table><thead><tr><th>Type</th><th>Trigger</th><th>Status</th><th>Created</th><th>Updated</th><th>Archived</th><th>Failures</th><th>Started</th></tr></thead><tbody>{data.syncRuns.slice(0, 12).map((row) => <tr key={String(row.id)}><td>{String(row.sync_type)}</td><td>{String(row.trigger_source)}</td><td>{String(row.status)}</td><td>{String(row.created_count)}</td><td>{String(row.updated_count)}</td><td>{String(row.archived_count)}</td><td>{String(row.failure_count)}</td><td>{when(row.started_at)}</td></tr>)}</tbody></table></div></article>
    </section>}

    {tab === "Products" && <section className="admin-commerce-panel"><header><div><h2>Product Synchronization</h2><p>New, updated, unpublished, archived, and missing provider products are tracked without deleting local history.</p></div><button className="primary" type="button" disabled={busy} onClick={() => void action("sync-products")}>Force synchronization</button></header><div className="printify-table-wrap"><table><thead><tr><th>Product</th><th>Printify ID</th><th>Blueprint</th><th>Provider</th><th>Status</th><th>Last seen</th></tr></thead><tbody>{data.products.map((row) => <tr key={String(row.provider_product_id)}><td>{String(row.title)}</td><td>{String(row.provider_product_id)}</td><td>{String(row.blueprint_id || "—")}</td><td>{String(row.print_provider_id || "—")}</td><td>{String(row.lifecycle_status)}</td><td>{when(row.last_seen_at)}</td></tr>)}</tbody></table></div></section>}

    {tab === "Inventory & Shipping" && <section className="printify-dashboard-grid">
      <article className="admin-commerce-panel"><h2>Availability</h2><p>Provider variant availability controls fulfillment eligibility. Unavailable variants cannot pass server checkout validation.</p><button className="primary" type="button" disabled={busy} onClick={() => void action("sync-inventory")}>Refresh availability</button></article>
      <article className="admin-commerce-panel"><h2>Shipping rates</h2><p>{data.shippingRates.length} cached variant rates. Expired rates are replaced by the next approved refresh.</p><button className="secondary" type="button" disabled={busy} onClick={() => void action("sync-shipping")}>Refresh shipping</button></article>
      <article className="admin-commerce-panel printify-wide"><div className="printify-table-wrap"><table><thead><tr><th>Method</th><th>Country</th><th>Variant</th><th>First item</th><th>Additional</th><th>Delivery</th><th>Expires</th></tr></thead><tbody>{data.shippingRates.slice(0, 100).map((row, index) => <tr key={`${String(row.blueprint_id)}:${String(row.provider_option_id)}:${String(row.method)}:${index}`}><td>{String(row.method)}</td><td>{String(row.country_code)}</td><td>{String(row.variant_id)}</td><td>{Number(row.first_item_minor || 0) / 100} {String(row.currency)}</td><td>{Number(row.additional_item_minor || 0) / 100} {String(row.currency)}</td><td>{String(row.handling_from_days || "—")}–{String(row.handling_to_days || "—")} days</td><td>{when(row.expires_at)}</td></tr>)}</tbody></table></div></article>
    </section>}

    {tab === "Order Queue" && <section className="admin-commerce-panel"><header><div><h2>Backend Submission Queue</h2><p>Orders are processed sequentially. Failed records remain preserved for review and explicit retry.</p></div></header><div className="printify-table-wrap"><table><thead><tr><th>Job</th><th>Order</th><th>Status</th><th>Attempts</th><th>Error</th><th>Updated</th><th>Action</th></tr></thead><tbody>{queue.map((row) => <tr key={String(row.id)}><td>{String(row.id).slice(0, 8)}</td><td>{String(row.order_id).slice(0, 8)}</td><td>{String(row.status)}</td><td>{String(row.attempts)}</td><td>{String(row.last_error_code || "—")}</td><td>{when(row.updated_at)}</td><td><div className="printify-row-actions">{["failed", "retry", "manual_approval"].includes(String(row.status)) && !row.printify_order_id && <button type="button" className="secondary" disabled={busy} onClick={() => void action("retry-job", { jobId: row.id, confirmed: window.confirm("Requeue this order only after confirming no Printify order exists?") })}>Retry</button>}{["pending", "retry"].includes(String(row.status)) && !row.printify_order_id && <button type="button" className="secondary danger" disabled={busy} onClick={() => void action("cancel-pending", { jobId: row.id, confirmed: window.confirm("Cancel this unsent queue item? The local order will be preserved.") })}>Cancel</button>}</div></td></tr>)}</tbody></table></div></section>}

    {tab === "Reconciliation" && <section className="admin-commerce-panel"><header><div><h2>Order Reconciliation</h2><p>Local orders, provider orders, fulfillment states, and tracking are compared. Discrepancies require review.</p></div><button className="primary" type="button" disabled={busy} onClick={() => void action("reconcile")}>Run comparison</button></header><div className="printify-table-wrap"><table><thead><tr><th>Type</th><th>Severity</th><th>Status</th><th>Summary</th><th>Detected</th><th>Review</th></tr></thead><tbody>{findings.map((row) => <tr key={String(row.id)}><td>{String(row.finding_type).replaceAll("_", " ")}</td><td>{String(row.severity)}</td><td>{String(row.status)}</td><td>{String(row.summary)}</td><td>{when(row.last_detected_at)}</td><td><div className="printify-row-actions"><button type="button" className="secondary" disabled={busy} onClick={() => void action("finding-status", { findingId: row.id, status: "investigating" })}>Investigate</button><button type="button" className="secondary" disabled={busy} onClick={() => void action("finding-status", { findingId: row.id, status: "resolved" })}>Resolve</button></div></td></tr>)}</tbody></table></div></section>}

    {tab === "Providers" && <section className="admin-commerce-panel"><header><div><h2>Print Provider Comparison</h2><p>Provider location, catalog coverage, preference, and performance evidence.</p></div><button className="primary" type="button" disabled={busy} onClick={() => void action("sync-providers")}>Refresh providers</button></header><div className="printify-provider-grid">{data.providers.map((row) => <article key={String(row.provider_option_id)}><span>{row.is_preferred ? "PREFERRED" : "AVAILABLE"}</span><h3>{String(row.title)}</h3><p>{String(row.country_code || "Region unavailable")} {row.region ? `· ${String(row.region)}` : ""}</p><p>{Array.isArray(row.blueprint_ids) ? row.blueprint_ids.length : 0} supported blueprints</p><small>Production and customer satisfaction remain UNVERIFIED until provider evidence is available.</small></article>)}</div></section>}

    {tab === "API Logs" && <section className="admin-commerce-panel"><h2>Sanitized API Diagnostics</h2><p>Credentials, request bodies, addresses, and payment details are never stored here.</p><div className="printify-table-wrap"><table><thead><tr><th>Operation</th><th>Endpoint group</th><th>Result</th><th>Status</th><th>Latency</th><th>Rate limit</th><th>Time</th></tr></thead><tbody>{data.apiLogs.map((row) => <tr key={String(row.id)}><td>{String(row.operation)}</td><td>{String(row.endpoint_group)}</td><td>{row.success ? "Success" : String(row.error_code || "Failed")}</td><td>{String(row.status_code || "—")}</td><td>{String(row.duration_ms)} ms</td><td>{String(row.rate_limit_remaining ?? "UNVERIFIED")}</td><td>{when(row.created_at)}</td></tr>)}</tbody></table></div></section>}

    {tab === "Settings" && <section className="admin-commerce-panel"><header><div><h2>Printify Settings</h2><p>Turning a job off preserves mappings, cache, queue history, reports, and audit evidence.</p></div></header><div className="printify-settings-grid">{boolSettings.map(([key, label]) => <label className="printify-switch" key={key}><span><strong>{label}</strong><small>{settings[key] === true ? "Enabled" : "Disabled"}</small></span><input type="checkbox" checked={settings[key] === true} onChange={(event) => setSettings({ ...settings, [key]: event.target.checked })} /></label>)}<label>Preferred provider<select value={String(settings.preferred_provider_id || "")} onChange={(event) => setSettings({ ...settings, preferred_provider_id: event.target.value ? Number(event.target.value) : null })}><option value="">Manual product mapping</option>{data.providers.map((row) => <option value={String(row.provider_option_id)} key={String(row.provider_option_id)}>{String(row.title)}</option>)}</select></label><label>Shipping cache (minutes)<input type="number" min={15} max={10080} value={Number(settings.shipping_cache_minutes || 360)} onChange={(event) => setSettings({ ...settings, shipping_cache_minutes: Number(event.target.value) })} /></label><label>Product sync (minutes)<input type="number" min={15} max={10080} value={Number(settings.product_sync_minutes || 60)} onChange={(event) => setSettings({ ...settings, product_sync_minutes: Number(event.target.value) })} /></label><label>Reconciliation (minutes)<input type="number" min={15} max={1440} value={Number(settings.reconciliation_minutes || 30)} onChange={(event) => setSettings({ ...settings, reconciliation_minutes: Number(event.target.value) })} /></label><label>Maximum retries<input type="number" min={1} max={10} value={Number(settings.max_retry_attempts || 5)} onChange={(event) => setSettings({ ...settings, max_retry_attempts: Number(event.target.value) })} /></label></div><button className="primary" type="button" disabled={busy} onClick={() => void action("settings", { settings })}>Save settings</button><p>Last changed: {when(settings.last_changed_at)}</p></section>}
  </div>;
}
