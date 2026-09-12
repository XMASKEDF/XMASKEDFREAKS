"use client";

import { useEffect, useMemo, useState } from "react";

type RestrictedRecord = {
  id: string; subject_ref: string; public_display_name: string; status: string; reason: string;
  first_restricted_at: string; most_recent_restricted_at: string; last_site_activity_at?: string;
  last_contribution_at?: string; total_verified_tip_coins: number; total_verified_purchase_coins: number;
  ignored_reminder_count: number; violation_attempt_count: number; clips4sale_redirect_count: number;
  admin_reinstatement_count: number; active_exemption_reason?: string; active_exemption_expires_at?: string;
  notes: Array<Record<string, unknown>>; restorations: Array<Record<string, unknown>>;
  attempts: Array<Record<string, unknown>>; contributions: Array<Record<string, unknown>>;
  reminders: Array<Record<string, unknown>>;
};

export default function AdminBadAccounts() {
  const [records, setRecords] = useState<RestrictedRecord[]>([]);
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [configured, setConfigured] = useState(true);
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [reason, setReason] = useState("");
  const [restorationType, setRestorationType] = useState("temporary");
  const [status, setStatus] = useState("Loading restricted identities…");
  const eligibleCategories = Array.isArray(settings.eligible_purchase_categories)
    ? settings.eligible_purchase_categories.map(String) : ["tip", "coin_purchase", "merchandise", "digital_purchase"];
  const selected = records.find((item) => item.id === selectedId) || null;
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term ? records.filter((item) => `${item.public_display_name} ${item.subject_ref} ${item.reason}`.toLowerCase().includes(term)) : records;
  }, [records, search]);

  async function load() {
    const response = await fetch("/api/admin/bad-accounts", { cache: "no-store" });
    const data = await response.json().catch(() => ({})) as { configured?: boolean; records?: RestrictedRecord[]; settings?: Record<string, unknown>; error?: string };
    setConfigured(data.configured !== false);
    setRecords(data.records || []);
    setSettings(data.settings || {});
    setSelectedId((current) => current || data.records?.[0]?.id || "");
    setStatus(response.ok ? "" : data.error || "Restricted identities could not be loaded.");
  }

  useEffect(() => { void load(); }, []);

  async function save(input: Record<string, unknown>) {
    const response = await fetch("/api/admin/bad-accounts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
    const data = await response.json().catch(() => ({})) as { error?: string };
    setStatus(response.ok ? "Protected account action saved and audited." : data.error || "Action failed.");
    if (response.ok) { setReason(""); await load(); }
  }

  if (!configured) return <section className="admin-auth-panel"><h2>Bad Accounts</h2><p>Connect Supabase and apply the contribution-rule migration to use this protected station.</p></section>;
  return <div className="admin-bad-accounts">
    <p className="admin-form-status" role="status" aria-live="polite">{status}</p>
    <section className="admin-auth-panel">
      <p className="kicker">LIVE ENTRY &amp; VIEWING CREDIT</p><h2>Rule settings</h2>
      <p>The legacy $25 watch requirement is permanently disabled. Defaults: 10 coins ($5) for entry, a 5-minute post-entry grace, a 16-second reminder, and refillable credit at 32 coins per hour.</p>
      <div className="admin-settings-grid">
        <label>Period seconds<input type="number" value={Number(settings.period_seconds || 1500)} onChange={(event) => setSettings({ ...settings, period_seconds: Number(event.target.value) })} /></label>
        <label>Required coins<input value="10" disabled /></label>
        <label>Reminder seconds<input value="16" disabled /></label>
        <label>Post-entry grace seconds<input type="number" min={300} value={Number(settings.grace_seconds || 300)} onChange={(event) => setSettings({ ...settings, grace_seconds: Math.max(300, Number(event.target.value)) })} /></label>
        <label>Ignored notices before restriction<input type="number" value={Number(settings.ignored_notices_before_restriction || 1)} onChange={(event) => setSettings({ ...settings, ignored_notices_before_restriction: Number(event.target.value) })} /></label>
        <label>Repeat attempts before Clips4Sale<input type="number" placeholder="Admin selection required" value={settings.repeat_attempt_threshold == null ? "" : Number(settings.repeat_attempt_threshold)} onChange={(event) => setSettings({ ...settings, repeat_attempt_threshold: event.target.value })} /></label>
        <label>Large-tip exemption coins<input type="number" min={20} value={Number(settings.large_tip_threshold_coins || 20)} onChange={(event) => setSettings({ ...settings, large_tip_threshold_coins: Number(event.target.value) })} /></label>
        <label>Coin-purchase exemption coins<input type="number" placeholder="Disabled until selected" value={settings.coin_purchase_threshold_coins == null ? "" : Number(settings.coin_purchase_threshold_coins)} onChange={(event) => setSettings({ ...settings, coin_purchase_threshold_coins: event.target.value })} /></label>
        <label>Merch exemption coins<input type="number" placeholder="Disabled until selected" value={settings.merchandise_threshold_coins == null ? "" : Number(settings.merchandise_threshold_coins)} onChange={(event) => setSettings({ ...settings, merchandise_threshold_coins: event.target.value })} /></label>
        <label>Exemption minutes<input type="number" value={Number(settings.exemption_duration_minutes || 60)} onChange={(event) => setSettings({ ...settings, exemption_duration_minutes: Number(event.target.value) })} /></label>
        <label>Maximum exemption minutes<input type="number" value={Number(settings.maximum_exemption_minutes || 1440)} onChange={(event) => setSettings({ ...settings, maximum_exemption_minutes: Number(event.target.value) })} /></label>
        <label>Exemption coverage<select value={String(settings.exemption_scope || "current_period")} onChange={(event) => setSettings({ ...settings, exemption_scope: event.target.value })}><option value="current_period">Current period only</option><option value="live_session">Full live session</option><option value="future_sessions">Future sessions until expiry</option></select></label>
        <label>Browsing protection seconds<input type="number" min={0} max={900} value={Number(settings.activity_protection_seconds ?? 300)} onChange={(event) => setSettings({ ...settings, activity_protection_seconds: Number(event.target.value) })} /></label>
        <label>Checkout protection seconds<input type="number" min={60} max={1800} value={Number(settings.checkout_protection_seconds || 600)} onChange={(event) => setSettings({ ...settings, checkout_protection_seconds: Number(event.target.value) })} /></label>
        <label><input type="checkbox" checked={settings.guest_enforcement_enabled !== false} onChange={(event) => setSettings({ ...settings, guest_enforcement_enabled: event.target.checked })} /> Enforce rule for approved guest sessions</label>
        <label><input type="checkbox" checked={settings.anonymous_tip_events_enabled !== false} onChange={(event) => setSettings({ ...settings, anonymous_tip_events_enabled: event.target.checked })} /> Allow anonymous public tip events</label>
        <label><input type="checkbox" checked={settings.public_tip_messages_enabled !== false} onChange={(event) => setSettings({ ...settings, public_tip_messages_enabled: event.target.checked })} /> Show approved public tip messages</label>
        <label>Clips4Sale destination reference<input value="external_platforms.clips4sale" disabled /></label>
      </div>
      <fieldset className="admin-auth-panel"><legend>Eligible contribution categories</legend>
        {["tip", "coin_purchase", "merchandise", "digital_purchase", "approved_purchase"].map((category) => <label key={category}>
          <input type="checkbox" checked={eligibleCategories.includes(category)} onChange={(event) => setSettings({
            ...settings,
            eligible_purchase_categories: event.target.checked
              ? Array.from(new Set([...eligibleCategories, category]))
              : eligibleCategories.filter((value) => value !== category)
          })} /> {category.replaceAll("_", " ")}
        </label>)}
      </fieldset>
      <button className="primary" type="button" onClick={() => void save({
        action: "settings", periodSeconds: settings.period_seconds, graceSeconds: settings.grace_seconds,
        ignoredNotices: settings.ignored_notices_before_restriction, repeatAttemptThreshold: settings.repeat_attempt_threshold,
        largeTipThresholdCoins: settings.large_tip_threshold_coins, coinPurchaseThresholdCoins: settings.coin_purchase_threshold_coins,
        merchandiseThresholdCoins: settings.merchandise_threshold_coins, exemptionDurationMinutes: settings.exemption_duration_minutes,
        maximumExemptionMinutes: settings.maximum_exemption_minutes, exemptionScope: settings.exemption_scope,
        eligiblePurchaseCategories: settings.eligible_purchase_categories, activityProtectionSeconds: settings.activity_protection_seconds,
        checkoutProtectionSeconds: settings.checkout_protection_seconds, guestEnforcementEnabled: settings.guest_enforcement_enabled,
        anonymousTipEventsEnabled: settings.anonymous_tip_events_enabled, publicTipMessagesEnabled: settings.public_tip_messages_enabled
      })}>Save protected rule settings</button>
    </section>
    <section className="admin-auth-panel">
      <p className="kicker">BAD ACCOUNTS</p><h2>Contribution restrictions</h2>
      <label>Search records<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Display name, reference, or reason" /></label>
      <div className="admin-customer-layout">
        <div className="admin-customer-list" role="listbox" aria-label="Contribution-restricted identities">
          {visible.map((item) => <button key={item.id} type="button" role="option" aria-selected={selectedId === item.id} className={selectedId === item.id ? "is-selected" : ""} onClick={() => setSelectedId(item.id)}>
            <span><strong>{item.public_display_name || "Guest"}</strong><small>{item.status} · {item.reason}</small></span>
            <b><abbr title="Admin reinstatements">A({item.admin_reinstatement_count})</abbr> <abbr title="Verified restricted-access violation attempts">V({item.violation_attempt_count})</abbr></b>
          </button>)}
        </div>
        {selected ? <article className="admin-customer-detail">
          <h3>{selected.public_display_name || "Guest"}</h3><p>{selected.subject_ref}</p>
          <div className="admin-auth-grid">
            <span>Status<strong>{selected.status}</strong></span><span>Reason<strong>{selected.reason}</strong></span>
            <span>First restricted<strong>{selected.first_restricted_at}</strong></span><span>Most recent<strong>{selected.most_recent_restricted_at}</strong></span>
            <span>Last activity<strong>{selected.last_site_activity_at || "Unavailable"}</strong></span><span>Last contribution<strong>{selected.last_contribution_at || "None"}</strong></span>
            <span>Verified tips<strong>{selected.total_verified_tip_coins} coins</strong></span><span>Verified purchases<strong>{selected.total_verified_purchase_coins} coins</strong></span>
            <span>Ignored reminders<strong>{selected.ignored_reminder_count}</strong></span><span>Clips4Sale redirects<strong>{selected.clips4sale_redirect_count}</strong></span>
            <span>Active exemption<strong>{selected.active_exemption_reason || "None"}</strong></span><span>Exemption expires<strong>{selected.active_exemption_expires_at || "Not active"}</strong></span>
            <span><abbr title="Admin reinstatements">A({selected.admin_reinstatement_count})</abbr><strong>Successful restorations</strong></span>
            <span><abbr title="Verified restricted-access violation attempts">V({selected.violation_attempt_count})</abbr><strong>Restricted Live attempts</strong></span>
          </div>
          <label>Restoration type<select value={restorationType} onChange={(event) => setRestorationType(event.target.value)}><option value="temporary">Temporary</option><option value="permanent">Permanent</option><option value="reverse_incorrect">Reverse incorrect restriction</option><option value="reset_period">Reset current period</option></select></label>
          <label>Required reason<textarea value={reason} onChange={(event) => setReason(event.target.value)} /></label>
          <button className="primary" type="button" disabled={reason.trim().length < 5} onClick={() => {
            if (window.confirm("Confirm this protected access restoration?")) void save({
              action: "restore", restrictionId: selected.id, restorationType, reason, confirmed: true,
              restoredUntil: restorationType === "temporary"
                ? new Date(Date.now() + Number(settings.exemption_duration_minutes || 60) * 60_000).toISOString()
                : null
            });
          }}>Confirm restoration</button>
          <button className="secondary" type="button" disabled={reason.trim().length < 2} onClick={() => void save({ action: "note", restrictionId: selected.id, reason })}>Add internal note</button>
          <button className="secondary" type="button" disabled={reason.trim().length < 5} onClick={() => {
            if (window.confirm("Add a time-limited contribution exemption for this identity?")) void save({
              action: "exemption", restrictionId: selected.id, enabled: true, reason, confirmed: true,
              durationMinutes: settings.exemption_duration_minutes || 60
            });
          }}>Add exemption</button>
          <button className="secondary" type="button" disabled={!selected.active_exemption_reason || reason.trim().length < 5} onClick={() => {
            if (window.confirm("Remove this contribution exemption?")) void save({
              action: "exemption", restrictionId: selected.id, enabled: false, reason, confirmed: true,
              durationMinutes: settings.exemption_duration_minutes || 60
            });
          }}>Remove exemption</button>
          <details><summary>Restricted attempts ({selected.attempts.length})</summary><pre>{JSON.stringify(selected.attempts, null, 2)}</pre></details>
          <details><summary>Reminder history ({selected.reminders.length})</summary><pre>{JSON.stringify(selected.reminders, null, 2)}</pre></details>
          <details><summary>Verified contributions ({selected.contributions.length})</summary><pre>{JSON.stringify(selected.contributions, null, 2)}</pre></details>
          <details><summary>Restoration history ({selected.restorations.length})</summary><pre>{JSON.stringify(selected.restorations, null, 2)}</pre></details>
          <details><summary>Internal notes ({selected.notes.length})</summary><pre>{JSON.stringify(selected.notes, null, 2)}</pre></details>
        </article> : <p>No restricted identity selected.</p>}
      </div>
    </section>
  </div>;
}
