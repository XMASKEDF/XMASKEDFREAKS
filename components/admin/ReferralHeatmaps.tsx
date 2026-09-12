"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  HEATMAP_BUCKETS,
  HEATMAP_DAYS,
  HEATMAP_TIMEZONES,
  heatmapIntensity,
  heatmapMetricValue,
  heatmapScaleMaximum,
  summarizeHeatmap,
  type HeatmapCell,
  type PurchaseHeatmapMetric,
  type ReferralHeatmapData,
  type VisitorHeatmapMetric
} from "@/lib/analytics/referral-heatmap";

type Props = { initialData: ReferralHeatmapData };

const sourceOptions = ["all", "direct", "google", "bing", "search", "email", "newsletter", "social", "external_referral", "clips4sale", "subscribe", "campaign", "qr", "other", "unknown"];
const categoryOptions = ["all", "merch", "paintings", "audio", "coins", "tips", "subscriptions", "other"];
const pageOptions = ["all", "live", "merch", "paintings", "audio", "games", "subscribe", "other"];

function filterLabel(value: string) {
  if (value === "all") return "All sources";
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function displayValue(value: number, metric: VisitorHeatmapMetric | PurchaseHeatmapMetric) {
  if (metric === "conversion") return `${(value * 100).toFixed(1)}%`;
  return metric === "revenue" || metric === "average_order" ? `$${value.toFixed(2)}` : String(Math.round(value));
}

function cellDetail(cell: HeatmapCell, purchase: boolean, metric: VisitorHeatmapMetric | PurchaseHeatmapMetric) {
  const day = HEATMAP_DAYS[cell.day] || "Unknown day";
  const start = HEATMAP_BUCKETS[cell.bucket] || "Unknown time";
  const end = HEATMAP_BUCKETS[(cell.bucket + 1) % HEATMAP_BUCKETS.length] || "—";
  const fields = purchase
    ? [`Purchases: ${cell.purchases || 0}`, `Revenue: $${((cell.revenue_minor || 0) / 100).toFixed(2)}`, `Average order: $${((cell.average_order_minor || 0) / 100).toFixed(2)}`, `Conversion rate: ${((cell.conversion_rate || 0) * 100).toFixed(1)}%`]
    : [`Impressions: ${heatmapMetricValue(cell, "impressions")}`, ...(metric === "impressions" ? [] : [`${metric === "unique_visitors" ? "Unique visitors" : "Sessions"}: ${heatmapMetricValue(cell, metric)}`]), `Sessions: ${cell.sessions || 0}`];
  return { title: `${day} · ${start}–${end}`, fields };
}

function Heatmap({ cells, purchase, metric, selected, onSelect, emptyState }: { cells: HeatmapCell[]; purchase: boolean; metric: VisitorHeatmapMetric | PurchaseHeatmapMetric; selected: HeatmapCell | null; onSelect: (cell: HeatmapCell) => void; emptyState?: boolean }) {
  const scaleMaximum = heatmapScaleMaximum(cells, metric);
  const selectedDetail = selected ? cellDetail(selected, purchase, metric) : null;
  return <div className="referral-heatmap" aria-label={`${purchase ? "Purchase" : "Visitor"} activity heatmap`}>
    <div className="referral-heatmap-axis referral-heatmap-axis-y" aria-hidden="true">{HEATMAP_BUCKETS.map((bucket) => <span key={bucket}>{bucket}</span>)}</div>
    <div className="referral-heatmap-grid-wrap"><div className="referral-heatmap-grid-shell">
      <div className="referral-heatmap-grid" role="grid" aria-label={`${purchase ? "Purchase" : "Visitor"} activity by day and two-hour time bucket`}>
        {cells.map((cell) => {
          const value = heatmapMetricValue(cell, metric);
          const level = heatmapIntensity(value, scaleMaximum);
          const detail = cellDetail(cell, purchase, metric);
          return <button className="referral-heatmap-cell" data-level={level} type="button" role="gridcell" key={`${cell.day}-${cell.bucket}`} aria-label={`${detail.title}. ${detail.fields.join(". ")}`} title={`${detail.title} · ${detail.fields.join(" · ")}`} onClick={() => onSelect(cell)}><span>{displayValue(value, metric)}</span></button>;
        })}
      </div>
      <div className="referral-heatmap-axis referral-heatmap-axis-x" aria-hidden="true">{HEATMAP_DAYS.map((day) => <span key={day}>{day.slice(0, 3)}</span>)}</div>
      {emptyState ? <div className="referral-heatmap-empty" role="status"><strong>NO PURCHASE ACTIVITY DATA</strong><span>No purchases match the selected filters.</span></div> : null}
    </div></div>
    {selectedDetail ? <div className="referral-heatmap-tooltip" role="status"><strong>{selectedDetail.title}</strong>{selectedDetail.fields.map((field) => <span key={field}>{field}</span>)}</div> : null}
  </div>;
}

export default function ReferralHeatmaps({ initialData }: Props) {
  const [data, setData] = useState(initialData);
  const [range, setRange] = useState("7d");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [timezone, setTimezone] = useState(initialData.timezone || "America/Chicago");
  const [source, setSource] = useState("all");
  const [referrer, setReferrer] = useState("");
  const [attribution, setAttribution] = useState("session");
  const [purchaseCategory, setPurchaseCategory] = useState("all");
  const [pageSection, setPageSection] = useState("all");
  const [visitorMetric, setVisitorMetric] = useState<VisitorHeatmapMetric>("impressions");
  const [purchaseMetric, setPurchaseMetric] = useState<PurchaseHeatmapMetric>("purchase_count");
  const [selectedVisitor, setSelectedVisitor] = useState<HeatmapCell | null>(null);
  const [selectedPurchase, setSelectedPurchase] = useState<HeatmapCell | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retryToken, setRetryToken] = useState(0);
  const firstRender = useRef(true);
  const filters = useMemo(() => ({ range, start, end, timezone, source, referrer, attribution, purchaseCategory, pageSection }), [range, start, end, timezone, source, referrer, attribution, purchaseCategory, pageSection]);
  const exportHref = useMemo(() => `/api/admin/analytics/referral-heatmap?${new URLSearchParams({ ...filters, format: "csv" }).toString()}`, [filters]);
  const visitorSummary = useMemo(() => summarizeHeatmap(data.visitorCells, "impressions"), [data.visitorCells]);
  const purchaseSummary = useMemo(() => summarizeHeatmap(data.purchaseCells, "purchase_count"), [data.purchaseCells]);
  const conversionSummary = useMemo(() => summarizeHeatmap(data.purchaseCells, "conversion"), [data.purchaseCells]);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const query = new URLSearchParams(filters);
    fetch(`/api/admin/analytics/referral-heatmap?${query.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { data?: ReferralHeatmapData; error?: string };
        if (!response.ok || !payload.data) throw new Error(payload.error || "Analytics could not be loaded.");
        setData(payload.data);
        setSelectedVisitor(null);
        setSelectedPurchase(null);
      })
      .catch((reason: unknown) => { if (reason instanceof Error && reason.name !== "AbortError") setError(reason.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filters, retryToken]);

  const purchaseCount = data.purchaseTotals.purchases;
  const highestTrafficWindow = visitorSummary.day !== "—" ? `${visitorSummary.day} · ${visitorSummary.bucket}` : "—";
  const bestPurchaseWindow = purchaseSummary.day !== "—" ? `${purchaseSummary.day} · ${purchaseSummary.bucket}` : "—";
  const hasLowSample = data.visitorTotals.sessions > 0 && data.visitorTotals.sessions < 30;

  return <section className="referral-heatmaps admin-commerce-panel" aria-labelledby="referral-heatmaps-title" aria-busy={loading}>
    <header className="referral-heatmaps-header"><div><p className="kicker">ADMIN · REFERRING WEBSITES</p><h2 id="referral-heatmaps-title">Traffic &amp; Purchase Heatmaps</h2><p>Server-aggregated production activity. All times shown in <strong>{data.timezone}</strong>.</p></div><a className="secondary" href={exportHref} download>Export CSV</a></header>
    <div className="referral-heatmap-toolbar" aria-label="Heatmap filters">
      <label>Range<select value={range} onChange={(event) => setRange(event.target.value)}><option value="today">Today</option><option value="7d">7 days</option><option value="30d">30 days</option><option value="90d">90 days</option><option value="custom">Custom</option></select></label>
      {range === "custom" ? <><label>Start<input type="date" value={start} onChange={(event) => setStart(event.target.value)} /></label><label>End<input type="date" value={end} onChange={(event) => setEnd(event.target.value)} /></label></> : null}
      <label>Source<select value={source} onChange={(event) => setSource(event.target.value)}>{sourceOptions.map((option) => <option key={option} value={option}>{filterLabel(option)}</option>)}</select></label>
      <label>Referring domain<input type="search" value={referrer} onChange={(event) => setReferrer(event.target.value)} placeholder="google.com" /></label>
      <label>Attribution<select value={attribution} onChange={(event) => setAttribution(event.target.value)}><option value="session">Session source</option><option value="first_touch">First touch</option><option value="latest_touch">Latest touch</option></select></label>
      <label>Purchase category<select value={purchaseCategory} onChange={(event) => setPurchaseCategory(event.target.value)}>{categoryOptions.map((option) => <option key={option} value={option}>{option === "all" ? "All purchases" : filterLabel(option)}</option>)}</select></label>
      <label>Page section<select value={pageSection} onChange={(event) => setPageSection(event.target.value)}>{pageOptions.map((option) => <option key={option} value={option}>{option === "all" ? "All pages" : filterLabel(option)}</option>)}</select></label>
      <label>Timezone<select value={timezone} onChange={(event) => setTimezone(event.target.value)}>{HEATMAP_TIMEZONES.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
    </div>
    {loading ? <p className="admin-inline-status" role="status">Refreshing aggregate analytics…</p> : null}
    {error ? <div className="referral-heatmap-error" role="alert"><strong>ANALYTICS DATA UNAVAILABLE</strong><span>{error}</span><button className="secondary" type="button" onClick={() => setRetryToken((value) => value + 1)}>Retry</button></div> : null}
    {!data.configured && !error ? <p className="admin-empty-state" role="status">{data.message || "NO ANALYTICS DATA AVAILABLE"} No production values are simulated.</p> : null}
    <div className="referral-heatmap-panels">
      <article className="referral-heatmap-panel"><header><div><p className="kicker">VISITORS ACTIVITY</p><h3>Visitor Activity</h3></div><label>Metric<select value={visitorMetric} onChange={(event) => setVisitorMetric(event.target.value as VisitorHeatmapMetric)}><option value="impressions">Impressions</option><option value="sessions">Sessions</option><option value="unique_visitors">Unique visitors</option></select></label></header><div className="referral-heatmap-summary"><span><small>Most active day</small><strong>{visitorSummary.day}</strong></span><span><small>Peak visit time</small><strong>{visitorSummary.bucket}</strong></span><span><small>Impressions</small><strong>{Math.round(data.visitorTotals.impressions)}</strong></span></div><Heatmap cells={data.visitorCells} purchase={false} metric={visitorMetric} selected={selectedVisitor} onSelect={setSelectedVisitor} /><div className="referral-heatmap-legend" aria-label="Visitor activity scale from low activity to high activity"><span>LOW ACTIVITY</span><i data-level="0" title="No activity" /><i data-level="1" /><i data-level="2" /><i data-level="3" /><i data-level="4" /><i data-level="5" /><span>HIGH ACTIVITY</span></div></article>
      <article className="referral-heatmap-panel"><header><div><p className="kicker">PURCHASE PEAK HOURS</p><h3>Purchase Peak Hours</h3></div><label>Metric<select value={purchaseMetric} onChange={(event) => setPurchaseMetric(event.target.value as PurchaseHeatmapMetric)}><option value="purchase_count">Purchase count</option><option value="revenue">Revenue</option><option value="average_order">Average order value</option><option value="conversion">Conversion rate</option></select></label></header><div className="referral-heatmap-summary"><span><small>Top purchase day</small><strong>{purchaseSummary.day}</strong></span><span><small>Peak purchase hour</small><strong>{purchaseSummary.bucket}</strong></span><span><small>Purchases</small><strong>{purchaseCount}</strong></span></div><Heatmap cells={data.purchaseCells} purchase metric={purchaseMetric} selected={selectedPurchase} onSelect={setSelectedPurchase} emptyState={purchaseCount === 0} /><div className="referral-heatmap-legend" aria-label="Purchase activity scale from low activity to high activity"><span>LOW ACTIVITY</span><i data-level="0" title="No activity" /><i data-level="1" /><i data-level="2" /><i data-level="3" /><i data-level="4" /><i data-level="5" /><span>HIGH ACTIVITY</span></div></article>
    </div>
    <section className="referral-heatmap-insight" aria-labelledby="traffic-purchase-insight"><div><p className="kicker">TRAFFIC → PURCHASE INSIGHT</p><h3 id="traffic-purchase-insight">Aggregate conversion context</h3></div><dl><div><dt>Highest traffic window</dt><dd>{highestTrafficWindow}</dd></div><div><dt>Best purchase window</dt><dd>{bestPurchaseWindow}</dd></div><div><dt>Best conversion window</dt><dd>{hasLowSample ? "LOW SAMPLE" : purchaseCount > 0 && conversionSummary.day !== "—" ? `${conversionSummary.day} · ${conversionSummary.bucket}` : "—"}</dd></div></dl><small>Conversion rate is qualifying purchase sessions divided by eligible visitor sessions in the same bucket. Only verified earnings ledger entries count; low samples are flagged instead of presented as reliable.</small></section>
    <p className="referral-heatmap-sr-summary">Visitor activity is grouped into Monday through Sunday and twelve two-hour local-time buckets. {visitorSummary.day === "—" ? "No visitor activity data is available." : `The busiest visitor period is ${highestTrafficWindow}.`} {purchaseCount === 0 ? "No purchase activity matches the selected filters." : `The busiest purchase period is ${bestPurchaseWindow}.`}</p>
  </section>;
}
