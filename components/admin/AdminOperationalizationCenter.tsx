"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  BackgroundMusicOperationalSettings,
  CampaignDefinition,
  CoinPolicyOperationalSettings,
  DepositScheduleSettings,
  OperationalMusicTrack,
  OperationalState,
  RedirectRule,
  TheaterAudioSettings
} from "@/lib/admin-operationalization";
import type { CoinPackage } from "@/lib/config";

type ProviderStatus = { provider: string; status: string; mode?: string; software?: string; configuration?: string; providerStatus?: string; test?: string; capabilities?: string[]; senderConfigured?: boolean; detail: string; lastRunAt?: string | null };
type MediaAssetSummary = { id: string; displayName: string; mimeType: string; mediaClass?: string; status: string; publicUrl?: string; durationSeconds?: number | null };
type OperationalData = {
  state: OperationalState;
  persisted: boolean;
  stream: { status: string; diagnosticsConfigured: boolean };
  providers: { resend: ProviderStatus; ccbill: ProviderStatus; segpay: ProviderStatus };
  storageCdn: ProviderStatus;
  payoutWorker: ProviderStatus;
  depositRuns: Array<Record<string, unknown>>;
  geo: Array<{ countryCode: string; country: string; timeZone: string; activeVisitors: number; uniqueVisitors: number; returningVisitors: number }>;
  coinPackages: CoinPackage[];
  support: { status: string; casesAvailable: boolean };
  moderation: { status: string; appeals: number };
  performance: { retentionDays: number; aggregateOnly: boolean; source: string };
  sandbox: { active: boolean; lastScenario: string | null; lastRunAt: string | null; result: string | null };
  events: Array<{ id: string; event_type: string; payload: Record<string, unknown>; created_at: string }>;
  supportCases: Array<{ id: string; customer_id: string | null; guest_reference: string | null; category: string; priority: string; status: string; subject: string; related_order_id: string | null; related_payment_id: string | null; related_entitlement_id: string | null; updated_at: string }>;
};

const initialTheaterAudio: TheaterAudioSettings = { theaterEnabled: true, audioPriority: "live", liveAudioCompression: true, musicDuckingVolume: 8 };
const initialMusic: BackgroundMusicOperationalSettings = { enabled: true, lobbyEnabled: true, mode: "automatic", lobbyVolume: 32, liveDuckingVolume: 8, stopWhenLive: false, noticeSeconds: 5, tracks: [] };
const initialPolicy: CoinPolicyOperationalSettings = { immutableCoinValueCents: 50, disclosure: "Platform Coins can only be used for tipping during live streams and for eligible merchandise available on this website. Coins cannot be exchanged for cash and cannot be transferred outside the platform.", requireEveryPurchase: false, showInPurchase: true, showInWallet: true, showInFaq: true, showInReceipts: true };
const initialSchedule: DepositScheduleSettings = { enabled: false, intervalHours: 8, lastRunAt: null, nextRunAt: null, lastResult: "never" };
const scenarioOptions = ["guest", "logged-in-user", "coin-purchase", "wallet-spend", "direct-live-tip", "product-purchase", "digital-entitlement", "physical-order", "live-contribution", "chat-comment", "chat-block", "provider-failure", "payment-confirmed", "payment-failed", "webhook-retry", "provider-unavailable"] as const;

function statusTone(status: string) {
  const value = status.toLowerCase();
  if (["healthy", "configured", "connected", "live", "complete", "ready"].some((item) => value.includes(item))) return "green";
  if (["not configured", "offline", "blocked", "action required", "degraded", "awaiting", "required", "unknown"].some((item) => value.includes(item))) return "yellow";
  return "yellow";
}

function dateLabel(value: string | null) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not recorded" : date.toLocaleString();
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export default function AdminOperationalizationCenter() {
  const [data, setData] = useState<OperationalData | null>(null);
  const [theaterAudio, setTheaterAudio] = useState<TheaterAudioSettings>(initialTheaterAudio);
  const [music, setMusic] = useState<BackgroundMusicOperationalSettings>(initialMusic);
  const [coinPolicy, setCoinPolicy] = useState<CoinPolicyOperationalSettings>(initialPolicy);
  const [coinPackages, setCoinPackages] = useState<CoinPackage[]>([]);
  const [schedule, setSchedule] = useState<DepositScheduleSettings>(initialSchedule);
  const [redirects, setRedirects] = useState<RedirectRule[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignDefinition[]>([]);
  const [faq, setFaq] = useState<OperationalState["faq"]>([]);
  const [appeals, setAppeals] = useState<OperationalState["appeals"]>([]);
  const [performanceDays, setPerformanceDays] = useState(30);
  const [notificationCooldown, setNotificationCooldown] = useState(90);
  const [notificationRecipient, setNotificationRecipient] = useState("");
  const [notificationMessage, setNotificationMessage] = useState("XMASKEDFREAKS is live.");
  const [selectedScenario, setSelectedScenario] = useState<(typeof scenarioOptions)[number]>("guest");
  const [selectedMediaId, setSelectedMediaId] = useState("");
  const [mediaAssets, setMediaAssets] = useState<MediaAssetSummary[]>([]);
  const [caseQuery, setCaseQuery] = useState("");
  const [caseStatus, setCaseStatus] = useState("ALL");
  const [saving, setSaving] = useState("");
  const [message, setMessage] = useState("Loading operational state...");

  const hydrate = useCallback((next: OperationalState) => {
    setTheaterAudio(next.theaterAudio);
    setMusic(next.backgroundMusic);
    setCoinPolicy(next.coinPolicy);
    setCoinPackages(next.coinPackages);
    setSchedule(next.depositSchedule);
    setRedirects(next.redirects);
    setCampaigns(next.campaigns);
    setFaq(next.faq);
    setAppeals(next.appeals);
    setPerformanceDays(next.performance.retentionDays);
    setNotificationCooldown(next.notifications.cooldownMinutes);
  }, []);

  const load = useCallback(async () => {
    setMessage("Loading operational state...");
    const response = await fetch("/api/admin/operationalization", { cache: "no-store" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw new Error(result.error || "The operational center could not be loaded.");
    setData(result as OperationalData);
    hydrate(result.state as OperationalState);
    setMessage(result.persisted ? "Operational state loaded from the shared Admin store." : "Validated local defaults. Apply the additive migration to enable durable persistence.");
    const mediaResponse = await fetch("/api/admin/media", { cache: "no-store" }).catch(() => null);
    if (mediaResponse?.ok) {
      const mediaResult = await mediaResponse.json().catch(() => ({}));
      setMediaAssets((mediaResult.assets || []) as MediaAssetSummary[]);
    }
  }, [hydrate]);

  useEffect(() => {
    let active = true;
    void load().catch((error) => { if (active) setMessage(error instanceof Error ? error.message : "The operational center could not be loaded."); });
    return () => { active = false; };
  }, [load]);

  const post = useCallback(async (action: string, body: Record<string, unknown>, label: string) => {
    setSaving(label);
    setMessage(`${label}...`);
    try {
      const response = await fetch("/api/admin/operationalization", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ...body }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || result.message || `${label} failed.`);
      if (result.state) hydrate(result.state as OperationalState);
      setData((current) => current && result.state ? { ...current, state: result.state as OperationalState, persisted: typeof result.persisted === "boolean" ? result.persisted : current.persisted } : current);
      setMessage(result.note || `${label} complete.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `${label} failed.`);
    } finally {
      setSaving("");
    }
  }, [hydrate]);

  const saveSection = useCallback((section: string, value: unknown) => post("save-section", { section, value }, `Saving ${section}`), [post]);
  const approvedAudio = useMemo(() => mediaAssets.filter((asset) => asset.status === "published" && (asset.mediaClass === "AUDIO" || asset.mimeType.startsWith("audio/"))), [mediaAssets]);
  const filteredCases = useMemo(() => (data?.supportCases || []).filter((item) => (caseStatus === "ALL" || item.status === caseStatus) && (!caseQuery.trim() || [item.subject, item.category, item.customer_id, item.guest_reference].join(" ").toLowerCase().includes(caseQuery.trim().toLowerCase()))), [caseQuery, caseStatus, data?.supportCases]);

  function addTrack() {
    const asset = approvedAudio.find((item) => item.id === selectedMediaId);
    if (!asset) { setMessage("Select an approved audio asset from the Shared Media Library first."); return; }
    setMusic((current) => ({ ...current, tracks: [...current.tracks, { id: makeId("track"), mediaId: asset.id, title: asset.displayName, artist: "XMASKEDFREAKS", durationMinutes: Math.max(1, Math.round((asset.durationSeconds || 600) / 60)), enabled: true, order: current.tracks.length + 1, status: "approved" as const }] }));
    setSelectedMediaId("");
  }

  function updateTrack(index: number, patch: Partial<OperationalMusicTrack>) {
    setMusic((current) => ({ ...current, tracks: current.tracks.map((track, itemIndex) => itemIndex === index ? { ...track, ...patch } : track) }));
  }

  if (!data) return <section className="admin-card admin-operationalization-loading"><p className="kicker">ADMIN OPERATIONS</p><h2>Operationalization Center</h2><p>{message}</p></section>;

  return <div className="admin-operationalization">
    <section className="admin-card admin-operationalization-hero">
      <header>
        <div><p className="kicker">ADMIN OPERATIONS · SANDBOX INTERVENTION #1</p><h2>Operationalization Center</h2><p>One protected workstation for the remaining Admin tools. Every mutation is validated server-side, persisted in one operational state record, and added to the existing Admin audit boundary.</p></div>
        <div className="admin-operationalization-hero-actions"><span className={`update-environment-badge ${data.persisted ? "is-persisted" : ""}`}>{data.persisted ? "PERSISTED" : "LOCAL DEFAULTS"}</span><button className="secondary" type="button" onClick={() => void load()} disabled={Boolean(saving)}>Refresh</button></div>
      </header>
      <p className="admin-update-note">Sandbox controls below are application-side simulations only. They cannot charge cards, credit a production wallet, send a real campaign, fulfill an order, or change the public Live feed.</p>
      <p className="status-line">{message}</p>
    </section>

    <section className="admin-operationalization-status-grid" aria-label="Provider and service status">
      <article className="admin-card operational-status-card"><span>Live / OBS</span><strong className={`status-${statusTone(data.stream.status)}`}>{data.stream.status}</strong><small>{data.stream.diagnosticsConfigured ? "Safe diagnostics configured" : "Provider/OBS configuration remains owner-owned"}</small><a href="/admin/system/live-diagnostics">Open diagnostics</a></article>
      {[data.providers.resend, data.providers.ccbill, data.providers.segpay, data.storageCdn, data.payoutWorker].map((provider) => <article className="admin-card operational-status-card" key={provider.provider}><span>{provider.provider}</span><strong className={`status-${statusTone(provider.status)}`}>{provider.status}</strong><small>{provider.detail}</small><small>Software: {provider.software || "—"} · Configuration: {provider.configuration || "—"}</small><small>Provider: {provider.providerStatus || "—"} · Test: {provider.test || "—"}</small>{provider.provider === "RESEND" ? <a href="/admin/prelaunch">Open email delivery</a> : <span className="status-line">Capabilities: {provider.capabilities?.join(", ") || "None declared"}</span>}</article>)}
      <article className="admin-card operational-status-card"><span>Payment mode</span><strong className="status-yellow">FAIL-CLOSED</strong><small>Hosted payment approval and credentials are not simulated by this center.</small><a href="/admin/payments">Open hosted payments</a></article>
    </section>

    <div className="admin-operationalization-grid">
      <section className="admin-card" aria-labelledby="theater-audio-title"><p className="kicker">LIVE EXPERIENCE</p><h3 id="theater-audio-title">Theater Mode &amp; Audio Priority</h3><div className="admin-operationalization-form-grid"><label className="check-row"><input type="checkbox" checked={theaterAudio.theaterEnabled} onChange={(event) => setTheaterAudio({ ...theaterAudio, theaterEnabled: event.target.checked })} /> Theater mode enabled</label><label>Audio priority<select value={theaterAudio.audioPriority} onChange={(event) => setTheaterAudio({ ...theaterAudio, audioPriority: event.target.value as TheaterAudioSettings["audioPriority"] })}><option value="live">Live video</option><option value="notification">Critical notifications</option><option value="music">Lobby music</option></select></label><label className="check-row"><input type="checkbox" checked={theaterAudio.liveAudioCompression} onChange={(event) => setTheaterAudio({ ...theaterAudio, liveAudioCompression: event.target.checked })} /> Live audio compression</label><label>Music ducking volume<input type="number" min={0} max={30} value={theaterAudio.musicDuckingVolume} onChange={(event) => setTheaterAudio({ ...theaterAudio, musicDuckingVolume: Number(event.target.value) })} /></label></div><button className="primary" type="button" disabled={Boolean(saving)} onClick={() => void saveSection("theaterAudio", theaterAudio)}>Save Live audio settings</button><p className="status-line">Live consumes this setting from <code>/api/live-config</code> without creating another player.</p></section>

      <section className="admin-card" aria-labelledby="music-title"><p className="kicker">SHARED MEDIA LIBRARY</p><h3 id="music-title">Background Music &amp; Live Lobby</h3><p className="status-line">Only approved audio already in the Media Library can be referenced. Missing, processing, and unavailable tracks are skipped without interrupting Live.</p><div className="admin-operationalization-form-grid"><label className="check-row"><input type="checkbox" checked={music.enabled} onChange={(event) => setMusic({ ...music, enabled: event.target.checked })} /> Music system enabled</label><label className="check-row"><input type="checkbox" checked={music.lobbyEnabled} onChange={(event) => setMusic({ ...music, lobbyEnabled: event.target.checked })} /> Lobby music enabled</label><label>Mode<select value={music.mode} onChange={(event) => setMusic({ ...music, mode: event.target.value as BackgroundMusicOperationalSettings["mode"] })}><option value="automatic">Automatic</option><option value="lobby-only">Lobby only</option><option value="live-background">Live background</option><option value="disabled">Disabled</option></select></label><label>Lobby volume<input type="number" min={0} max={100} value={music.lobbyVolume} onChange={(event) => setMusic({ ...music, lobbyVolume: Number(event.target.value) })} /></label><label>Live ducking volume<input type="number" min={0} max={30} value={music.liveDuckingVolume} onChange={(event) => setMusic({ ...music, liveDuckingVolume: Number(event.target.value) })} /></label><label className="check-row"><input type="checkbox" checked={music.stopWhenLive} onChange={(event) => setMusic({ ...music, stopWhenLive: event.target.checked })} /> Pause completely when Live starts</label></div><div className="admin-operationalization-inline"><label>Approved audio<select value={selectedMediaId} onChange={(event) => setSelectedMediaId(event.target.value)}><option value="">{approvedAudio.length ? "Choose from Media Library" : "No approved audio loaded"}</option>{approvedAudio.map((asset) => <option value={asset.id} key={asset.id}>{asset.displayName}</option>)}</select></label><button className="secondary" type="button" onClick={addTrack} disabled={!selectedMediaId}>Add track</button></div><div className="operational-track-list">{music.tracks.length ? music.tracks.map((track, index) => <div className="operational-track-row" key={track.id}><span>{index + 1}</span><div><strong>{track.title}</strong><small>{track.artist} · {track.status} · media {track.mediaId || "missing"}</small></div><label className="check-row"><input type="checkbox" checked={track.enabled} onChange={(event) => updateTrack(index, { enabled: event.target.checked })} /> On</label><button className="secondary" type="button" onClick={() => setMusic((current) => ({ ...current, tracks: current.tracks.filter((_, itemIndex) => itemIndex !== index).map((item, itemIndex) => ({ ...item, order: itemIndex + 1 })) }))}>Remove</button></div>) : <p className="status-line">No approved tracks are assigned yet.</p>}</div><button className="primary" type="button" disabled={Boolean(saving)} onClick={() => void post("save-playlist", { value: music }, "Saving playlist")}>Save playlist</button></section>

      <section className="admin-card" aria-labelledby="redirect-title"><p className="kicker">TRAFFIC OPERATIONS</p><h3 id="redirect-title">Redirect Manager</h3><p className="status-line">Rules are internal-source only and limited to approved destinations. Redirect logging remains privacy-conscious and never blocks routing when analytics is unavailable.</p>{redirects.map((rule, index) => <div className="operational-editor-row" key={rule.id}><label>Name<input value={rule.name} onChange={(event) => setRedirects((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} /></label><label>Source<input value={rule.source} onChange={(event) => setRedirects((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, source: event.target.value } : item))} /></label><label>Destination<select value={rule.destination} onChange={(event) => setRedirects((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, destination: event.target.value as RedirectRule["destination"] } : item))}><option value="live">Live</option><option value="clips4sale">Clips4Sale</option><option value="fansly">Subscribe</option></select></label><label>Priority<input type="number" min={1} value={rule.priority} onChange={(event) => setRedirects((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, priority: Number(event.target.value) } : item))} /></label><label className="check-row"><input type="checkbox" checked={rule.enabled} onChange={(event) => setRedirects((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, enabled: event.target.checked } : item))} /> Enabled</label><button className="secondary" type="button" onClick={() => setRedirects((items) => items.filter((_, itemIndex) => itemIndex !== index))}>Remove</button></div>)}<div className="admin-operationalization-inline"><button className="secondary" type="button" onClick={() => setRedirects((items) => items.concat({ id: makeId("redirect"), name: "New redirect", enabled: true, source: "/go", destination: "live", condition: { start: "00:00", end: "23:59", offlineOnly: true }, priority: items.length + 1 }))}>Add rule</button><button className="primary" type="button" disabled={Boolean(saving)} onClick={() => void saveSection("redirects", redirects)}>Save redirect rules</button></div><a className="admin-inline-link" href="/admin/analytics/traffic">View redirect and referral analytics</a></section>

      <section className="admin-card" aria-labelledby="campaign-title"><p className="kicker">ATTRIBUTION</p><h3 id="campaign-title">Campaign Tracking</h3><p className="status-line">The visitor beacon remains the analytics authority. These definitions add normalized campaign destinations without replacing stronger first-touch/session attribution.</p>{campaigns.map((campaign, index) => <div className="operational-editor-row" key={campaign.id}><label>Name<input value={campaign.name} onChange={(event) => setCampaigns((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} /></label><label>Source<input value={campaign.source} onChange={(event) => setCampaigns((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, source: event.target.value } : item))} /></label><label>Medium<input value={campaign.medium} onChange={(event) => setCampaigns((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, medium: event.target.value } : item))} /></label><label>Code<input value={campaign.code} onChange={(event) => setCampaigns((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, code: event.target.value } : item))} /></label><label>Destination<input value={campaign.destination} onChange={(event) => setCampaigns((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, destination: event.target.value } : item))} /></label><label className="check-row"><input type="checkbox" checked={campaign.enabled} onChange={(event) => setCampaigns((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, enabled: event.target.checked } : item))} /> Enabled</label><button className="secondary" type="button" onClick={() => setCampaigns((items) => items.filter((_, itemIndex) => itemIndex !== index))}>Remove</button></div>)}<div className="admin-operationalization-inline"><button className="secondary" type="button" onClick={() => setCampaigns((items) => items.concat({ id: makeId("campaign"), name: "New campaign", source: "direct", medium: "campaign", code: makeId("campaign"), destination: "/", enabled: true }))}>Add campaign</button><button className="primary" type="button" disabled={Boolean(saving)} onClick={() => void saveSection("campaigns", campaigns)}>Save campaigns</button></div></section>

      <section className="admin-card" aria-labelledby="geo-title"><p className="kicker">PRIVACY-SAFE ANALYTICS</p><h3 id="geo-title">Geo &amp; World Clocks</h3><p className="status-line">Only aggregate country, timezone, active, unique, and returning counts are shown. Raw IP addresses and exact coordinates are excluded.</p><div className="operational-geo-table">{data.geo.length ? data.geo.map((item) => <div key={item.countryCode}><strong>{item.country}</strong><span>{item.timeZone}</span><span>{item.activeVisitors} active</span><span>{item.uniqueVisitors} unique</span><span>{item.returningVisitors} returning</span></div>) : <p>No aggregate geo rows are available.</p>}</div><a className="admin-inline-link" href="/admin/analytics/traffic">Open traffic heatmaps</a></section>

      <section className="admin-card" aria-labelledby="notification-title"><p className="kicker">RESEND QUEUE</p><h3 id="notification-title">Live Notifications &amp; Email</h3><div className="admin-operationalization-form-grid"><label>Cooldown minutes<input type="number" min={5} max={10080} value={notificationCooldown} onChange={(event) => setNotificationCooldown(Number(event.target.value))} /></label><label>Test recipient<input type="email" value={notificationRecipient} onChange={(event) => setNotificationRecipient(event.target.value)} placeholder="owner@example.com" /></label><label className="wide-field">Message<textarea rows={3} value={notificationMessage} onChange={(event) => setNotificationMessage(event.target.value)} /></label></div><div className="admin-operationalization-inline"><button className="secondary" type="button" disabled={Boolean(saving)} onClick={() => void saveSection("notifications", { cooldownMinutes: notificationCooldown })}>Save cooldown</button><button className="secondary" type="button" disabled={Boolean(saving) || !notificationRecipient} onClick={() => void post("queue-live-notification", { recipientEmail: notificationRecipient, message: notificationMessage, idempotencyKey: `admin-live:${notificationRecipient}:${notificationMessage}` }, "Queue live notification")}>Queue live notification</button><button className="primary" type="button" disabled={Boolean(saving) || !notificationRecipient} onClick={() => void post("test-email", { recipientEmail: notificationRecipient, confirm: true, idempotencyKey: makeId("admin-email-test") }, "Send Resend test")}>Send one-recipient test</button></div><p className="status-line">Last status: {data.state.notifications.lastStatus}. Delivery state: {data.state.notifications.lastDeliveryState || "Not run"}. Last queued: {dateLabel(data.state.notifications.lastQueuedAt)}. {data.state.notifications.lastFailure || "No recorded failure."}</p><a className="admin-inline-link" href="/admin/prelaunch">Open delivery history</a></section>

      <section className="admin-card" aria-labelledby="support-title"><p className="kicker">MAYA SUPPORT WORKSTATION</p><h3 id="support-title">Customer Support &amp; FAQ</h3><div className="admin-operationalization-inline"><label>Search cases<input type="search" value={caseQuery} onChange={(event) => setCaseQuery(event.target.value)} placeholder="Subject, customer, guest reference" /></label><label>Status<select value={caseStatus} onChange={(event) => setCaseStatus(event.target.value)}><option value="ALL">All statuses</option><option value="NEW">New</option><option value="OPEN">Open</option><option value="WAITING FOR CUSTOMER">Waiting for customer</option><option value="IN REVIEW">In review</option><option value="RESOLVED">Resolved</option><option value="CLOSED">Closed</option></select></label></div><div className="operational-case-list">{filteredCases.length ? filteredCases.map((item) => <div key={item.id}><strong>{item.subject}</strong><span>{item.status} · {item.priority} · {item.category}</span><small>{item.customer_id || item.guest_reference || "Unidentified visitor"} · updated {dateLabel(item.updated_at)}</small></div>) : <p className="status-line">No connected support cases are available in this environment.</p>}</div><div className="admin-operationalization-inline"><a className="secondary admin-link-button" href="/admin/system/backbone#support">Open case workstation</a><a className="secondary admin-link-button" href="/admin/chat">Open chat moderation</a></div></section>

      <section className="admin-card" aria-labelledby="faq-title"><p className="kicker">FAQ MANAGEMENT</p><h3 id="faq-title">FAQ entries</h3>{faq.map((item, index) => <div className="operational-editor-row" key={item.id}><label>Question<input value={item.question} onChange={(event) => setFaq((items) => items.map((entry, itemIndex) => itemIndex === index ? { ...entry, question: event.target.value } : entry))} /></label><label>Answer<textarea rows={2} value={item.answer} onChange={(event) => setFaq((items) => items.map((entry, itemIndex) => itemIndex === index ? { ...entry, answer: event.target.value } : entry))} /></label><label className="check-row"><input type="checkbox" checked={item.enabled} onChange={(event) => setFaq((items) => items.map((entry, itemIndex) => itemIndex === index ? { ...entry, enabled: event.target.checked } : entry))} /> Enabled</label><button className="secondary" type="button" onClick={() => setFaq((items) => items.filter((_, itemIndex) => itemIndex !== index))}>Remove</button></div>)}<div className="admin-operationalization-inline"><button className="secondary" type="button" onClick={() => setFaq((items) => items.concat({ id: makeId("faq"), question: "New question", answer: "Answer", enabled: true, order: items.length + 1 }))}>Add FAQ</button><button className="primary" type="button" disabled={Boolean(saving)} onClick={() => void saveSection("faq", faq)}>Save FAQ</button></div></section>

      <section className="admin-card" aria-labelledby="payments-title"><p className="kicker">COMMERCE READINESS</p><h3 id="payments-title">Coin policy &amp; package authority</h3><div className="immutable-policy-callout"><strong>IMMUTABLE ECONOMIC RULE</strong><span>1 coin = $0.50 · 50 cents · server-enforced</span></div><label>Disclosure wording<textarea rows={4} value={coinPolicy.disclosure} onChange={(event) => setCoinPolicy({ ...coinPolicy, disclosure: event.target.value })} /></label><div className="admin-operationalization-checks"><label className="check-row"><input type="checkbox" checked={coinPolicy.requireEveryPurchase} onChange={(event) => setCoinPolicy({ ...coinPolicy, requireEveryPurchase: event.target.checked })} /> Require purchase acknowledgement</label><label className="check-row"><input type="checkbox" checked={coinPolicy.showInPurchase} onChange={(event) => setCoinPolicy({ ...coinPolicy, showInPurchase: event.target.checked })} /> Show in purchase</label><label className="check-row"><input type="checkbox" checked={coinPolicy.showInWallet} onChange={(event) => setCoinPolicy({ ...coinPolicy, showInWallet: event.target.checked })} /> Show in wallet</label><label className="check-row"><input type="checkbox" checked={coinPolicy.showInFaq} onChange={(event) => setCoinPolicy({ ...coinPolicy, showInFaq: event.target.checked })} /> Show in FAQ</label><label className="check-row"><input type="checkbox" checked={coinPolicy.showInReceipts} onChange={(event) => setCoinPolicy({ ...coinPolicy, showInReceipts: event.target.checked })} /> Show in receipts</label></div><button className="primary" type="button" disabled={Boolean(saving)} onClick={() => void saveSection("coinPolicy", coinPolicy)}>Save policy presentation</button><div className="operational-package-list">{coinPackages.map((item, index) => <div key={item.id}><span>{index + 1}</span><label>Name<input value={item.name} onChange={(event) => setCoinPackages((items) => items.map((pack) => pack.id === item.id ? { ...pack, name: event.target.value } : pack))} /></label><label>Price<input type="number" min={1} value={item.amount} onChange={(event) => setCoinPackages((items) => items.map((pack) => pack.id === item.id ? { ...pack, amount: Number(event.target.value) } : pack))} /></label><label>Bonus<input type="number" min={0} max={300} value={item.bonusCoins} onChange={(event) => setCoinPackages((items) => items.map((pack) => pack.id === item.id ? { ...pack, bonusCoins: Number(event.target.value) } : pack))} /></label><label className="check-row"><input type="checkbox" checked={item.enabled} onChange={(event) => setCoinPackages((items) => items.map((pack) => pack.id === item.id ? { ...pack, enabled: event.target.checked } : pack))} /> Active</label><label>Badge<input value={item.badge} onChange={(event) => setCoinPackages((items) => items.map((pack) => pack.id === item.id ? { ...pack, badge: event.target.value } : pack))} /></label></div>)}</div><button className="primary" type="button" disabled={Boolean(saving)} onClick={() => void saveSection("coinPackages", coinPackages)}>Save six-slot package catalog</button><p className="status-line">Base coins remain derived from the permanent 50-cent rule. Hosted checkout validates the package again on the server.</p></section>

      <section className="admin-card" aria-labelledby="payout-title"><p className="kicker">INTERNAL ACCOUNTING</p><h3 id="payout-title">Payouts &amp; Creator Deposit Schedule</h3><p className="status-line">Internal records can prepare and reconcile work. No CCBill/Segpay bank settlement is implied until an approved provider is connected.</p><div className="admin-operationalization-form-grid"><label className="check-row"><input type="checkbox" checked={schedule.enabled} onChange={(event) => setSchedule({ ...schedule, enabled: event.target.checked })} /> Internal schedule enabled</label><label>Interval<select value={schedule.intervalHours} onChange={(event) => setSchedule({ ...schedule, intervalHours: Number(event.target.value) as DepositScheduleSettings["intervalHours"] })}><option value={1}>Every hour</option><option value={2}>Every 2 hours</option><option value={4}>Every 4 hours</option><option value={8}>Every 8 hours</option></select></label></div><div className="admin-operationalization-inline"><button className="primary" type="button" disabled={Boolean(saving)} onClick={() => void saveSection("depositSchedule", schedule)}>Save internal schedule</button><button className="secondary" type="button" disabled={Boolean(saving)} onClick={() => void post("run-deposit-worker", { force: true }, "Run internal deposit worker")}>Run internal worker</button></div><p className="status-line">Last run: {dateLabel(schedule.lastRunAt)} · next: {dateLabel(schedule.nextRunAt)} · result: {schedule.lastResult}</p>{data.depositRuns.length ? <div className="operational-case-list">{data.depositRuns.slice(0, 5).map((run) => <div key={String(run.run_key)}><strong>{String(run.status)}</strong><span>{String(run.result || "No result")} · {Number(run.records_processed || 0)} ledger records</span><small>{dateLabel(String(run.completed_at || run.started_at || run.scheduled_at || ""))} · {String(run.provider_action_required || "No provider action recorded")}</small></div>)}</div> : <p className="status-line">No worker runs recorded. The worker remains internal and provider-blocked.</p>}<a className="admin-inline-link" href="/admin/analytics/earnings">Open earnings and payout records</a></section>

      <section className="admin-card" aria-labelledby="moderation-title"><p className="kicker">MANUAL SAFETY WORKSTATION</p><h3 id="moderation-title">Moderation &amp; Appeals</h3><p className="status-line">{data.moderation.status}. Chat blocks, Live restrictions, site bans, and their history remain separate in the existing Admin tools.</p>{appeals.map((appeal) => <div className="operational-editor-row" key={appeal.id}><span>{appeal.subjectRef}</span><select value={appeal.status} onChange={(event) => setAppeals((items) => items.map((item) => item.id === appeal.id ? { ...item, status: event.target.value as typeof appeal.status } : item))}><option>OPEN</option><option>REVIEWING</option><option>APPROVED</option><option>DENIED</option><option>CLOSED</option></select><small>{appeal.note || "No private note"}</small><button className="secondary" type="button" onClick={() => void post("save-appeal", { id: appeal.id, subjectRef: appeal.subjectRef, status: appeal.status, note: appeal.note }, "Save appeal")}>Save</button></div>)}<div className="admin-operationalization-inline"><button className="secondary" type="button" onClick={() => setAppeals((items) => items.concat({ id: makeId("appeal"), subjectRef: "new-subject", status: "OPEN", note: "", updatedAt: new Date().toISOString() }))}>Add appeal</button><a className="secondary admin-link-button" href="/admin/bad-accounts">Open restrictions and history</a></div></section>

      <section className="admin-card" aria-labelledby="performance-title"><p className="kicker">RELIABILITY AGGREGATES</p><h3 id="performance-title">Performance &amp; Sandbox</h3><p className="status-line">Source: {data.performance.source}. Browser-facing Admin output stays aggregate-only and bounded.</p><div className="admin-operationalization-form-grid"><label>Retention days<input type="number" min={7} max={365} value={performanceDays} onChange={(event) => setPerformanceDays(Number(event.target.value))} /></label><span className="operational-metric"><strong>{data.performance.aggregateOnly ? "AGGREGATE ONLY" : "RAW"}</strong><small>Telemetry handling</small></span></div><button className="secondary" type="button" disabled={Boolean(saving)} onClick={() => void saveSection("performance", { retentionDays: performanceDays })}>Save retention policy</button><hr /><p className="kicker">SANDBOX CONSOLE</p><label>Scenario<select value={selectedScenario} onChange={(event) => setSelectedScenario(event.target.value as (typeof scenarioOptions)[number])}>{scenarioOptions.map((scenario) => <option value={scenario} key={scenario}>{scenario}</option>)}</select></label><button className="primary" type="button" disabled={Boolean(saving)} onClick={() => void post("record-sandbox-scenario", { scenario: selectedScenario }, "Run Sandbox scenario")}>Run isolated scenario</button><p className="status-line">Last: {data.sandbox.lastScenario || "None"} · {dateLabel(data.sandbox.lastRunAt)} · {data.sandbox.result || "No simulation run."}</p><a className="admin-inline-link" href="/sandbox">Open full Sandbox preview</a></section>
    </div>

    <section className="admin-card operational-event-log" aria-labelledby="operational-events-title"><header><div><p className="kicker">CHANGE EVIDENCE</p><h3 id="operational-events-title">Operational changes</h3></div><a className="secondary admin-link-button" href="/admin/reliability">Open Audit / Reliability</a></header>{data.events.length ? <div>{data.events.slice(0, 12).map((event) => <span key={event.id}><strong>{event.event_type}</strong><small>{dateLabel(event.created_at)}</small></span>)}</div> : <p className="status-line">No persisted operational events are available yet.</p>}</section>
  </div>;
}
