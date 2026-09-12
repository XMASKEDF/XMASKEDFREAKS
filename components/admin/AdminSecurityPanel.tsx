"use client";

import { useState } from "react";
import type { BotDetectionConfig, BotDetectionLevel } from "@/lib/infrastructure/bot-policy";

export default function AdminSecurityPanel({
  initialTwoFactorEnabled,
  sessionTimeoutMinutes,
  inactivityTimeoutMinutes,
  rememberDeviceDays,
  lastLoginAt,
  initialBotDetectionConfig
}: {
  initialTwoFactorEnabled: boolean;
  sessionTimeoutMinutes: number;
  inactivityTimeoutMinutes: number;
  rememberDeviceDays: number;
  lastLoginAt: string | null;
  initialBotDetectionConfig: BotDetectionConfig;
}) {
  const [enabled, setEnabled] = useState(initialTwoFactorEnabled);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [password, setPassword] = useState("");
  const [botEnabled, setBotEnabled] = useState(initialBotDetectionConfig.enabled);
  const [botLevel, setBotLevel] = useState<BotDetectionLevel>(initialBotDetectionConfig.level);
  const [sandboxScenario, setSandboxScenario] = useState("normal_customer");
  const [sandboxStatus, setSandboxStatus] = useState("Sandbox results never change production visitor state.");

  async function save(next: boolean) {
    if (!next && !window.confirm("Disable administrator email verification for future logins? Password and server authorization will remain active.")) return;
    if (!password) return setMessage("Enter your current Admin password before changing a security control.");
    setSaving(true);
    const reauth = await fetch("/api/admin/reauthenticate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }) });
    if (!reauth.ok) { setSaving(false); return setMessage("Reauthentication failed. Security settings were not changed."); }
    const response = await fetch("/api/admin/security", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ emailTwoFactorEnabled: next })
    });
    const result = await response.json();
    setSaving(false);
    if (!response.ok) return setMessage(result.message || "Security settings could not be saved.");
    setEnabled(next);
    setPassword("");
    setMessage(next ? "Email two-factor authentication is active for future administrator logins." : "Email two-factor authentication is disabled for development.");
  }

  async function saveBotPolicy(next: { enabled?: boolean; level?: BotDetectionLevel }) {
    if (next.enabled === false && !window.confirm("Turn off Bot Detection classification, challenges, and automated bot enforcement? Core authentication, payment, wallet, upload, game anti-cheat, replay, and webhook protections remain active.")) return;
    if (!password) return setMessage("Enter your current Admin password before changing a security control.");
    setSaving(true);
    const reauth = await fetch("/api/admin/reauthenticate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }) });
    if (!reauth.ok) { setSaving(false); return setMessage("Reauthentication failed. Security settings were not changed."); }
    const response = await fetch("/api/admin/security", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ botDetectionEnabled: next.enabled, botDetectionLevel: next.level }) });
    const result = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) return setMessage(result.message || "Bot Detection settings could not be saved.");
    if (typeof result.botDetectionEnabled === "boolean") setBotEnabled(result.botDetectionEnabled);
    if (result.botDetectionLevel) setBotLevel(result.botDetectionLevel as BotDetectionLevel);
    setPassword("");
    setMessage("Bot Detection policy saved. Sage will report observations; policy changes still require Admin decisions.");
  }

  async function simulateBotScenario() {
    const response = await fetch("/api/admin/security/bot-simulation", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenario: sandboxScenario, level: botLevel }) }).catch(() => null);
    const result = await response?.json().catch(() => ({}));
    setSandboxStatus(response?.ok ? `${String(result.scenarioLabel || sandboxScenario)} · ${String(result.action || "observed").toUpperCase()} · ${String(result.note || "Sandbox only.")}` : String(result?.error || "Sandbox simulation could not be recorded."));
  }

  return (
    <div className="admin-security-grid">
      <section className="admin-card">
        <p className="kicker">BOT DETECTION</p>
        <h2>Protect customers without interrupting them</h2>
        <p>Bot Detection classification, challenges, and automated bot enforcement are customer-first. Weak signals are observed and aggregated before intervention; country, language, timezone, VPN, travel, and normal rapid browsing never decide bot status alone.</p>
        <label>Detection level<select value={botLevel} disabled={saving} onChange={(event) => void saveBotPolicy({ level: event.target.value as BotDetectionLevel })}><option value="simple">SIMPLE · extremely tolerant</option><option value="easy">EASY · tolerant default</option><option value="medium">MEDIUM · balanced signals</option><option value="hard">HARD · heightened security</option></select></label>
        <div className="admin-security-toggle" role="group" aria-label="Bot Detection status"><span>Bot Detection</span><button type="button" className={botEnabled ? "active" : ""} disabled={saving} onClick={() => void saveBotPolicy({ enabled: true })}>ON</button><button type="button" className={!botEnabled ? "active" : ""} disabled={saving} onClick={() => void saveBotPolicy({ enabled: false })}>OFF</button></div>
        <dl className="admin-security-list"><div><dt>Current status</dt><dd>{botEnabled ? "ON" : "OFF"}</dd></div><div><dt>Current level</dt><dd>{botLevel.toUpperCase()}</dd></div><div><dt>AI supervisor</dt><dd>Sage</dd></div><div><dt>Level meaning</dt><dd>Interpretation strictness, not puzzle difficulty</dd></div><div><dt>Game bot detection</dt><dd>OFF</dd></div><div><dt>Gameplay bot challenges</dt><dd>OFF</dd></div><div><dt>Game anti-cheat</dt><dd>ON</dd></div><div><dt>Payment/auth integrity</dt><dd>ALWAYS ON</dd></div></dl>
      </section>
      <section className="admin-card admin-bot-sandbox">
        <p className="kicker">BOT DETECTION SANDBOX</p>
        <h2>Test without touching production</h2>
        <p>Run customer-first scenarios against the selected level. International origin and fast legitimate behavior are neutral signals; game bot challenges remain off.</p>
        <label>Test level<select value={botLevel} onChange={(event) => setBotLevel(event.target.value as BotDetectionLevel)}><option value="simple">SIMPLE</option><option value="easy">EASY</option><option value="medium">MEDIUM</option><option value="hard">HARD</option></select></label>
        <label>Scenario<select value={sandboxScenario} onChange={(event) => setSandboxScenario(event.target.value)}><option value="normal_customer">Normal customer</option><option value="international_customer">International customer</option><option value="fast_browsing_customer">Fast legitimate visitor</option><option value="obvious_bot">Obvious bot</option><option value="brute_force_bot">Brute-force bot</option><option value="api_flood">API flood</option><option value="challenge_pass">Challenge pass</option><option value="challenge_failure">Challenge failure</option></select></label>
        <button className="secondary" type="button" onClick={() => void simulateBotScenario()}>Run sandbox scenario</button>
        <p className="status-line" role="status">{sandboxStatus}</p>
      </section>
      <section className="admin-card">
        <p className="kicker">Two-Factor Authentication</p>
        <h2>Email verification</h2>
        <p>When enabled, every successful password check must be followed by a secure, expiring, single-use email code.</p>
        <label>Current Admin password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" maxLength={256} /></label>
        <label className="admin-security-toggle">
          <input
            type="checkbox"
            checked={enabled}
            disabled={saving}
            onChange={(event) => void save(event.target.checked)}
          />
          <span>Enable Two-Factor Authentication</span>
          <strong>{enabled ? "ON" : "OFF"}</strong>
        </label>
        {message ? <p className="status-line" role="status">{message}</p> : null}
      </section>
      <section className="admin-card">
        <p className="kicker">Session policy</p>
        <h2>Server-enforced access</h2>
        <dl className="admin-security-list">
          <div><dt>Absolute session timeout</dt><dd>{sessionTimeoutMinutes} minutes</dd></div>
          <div><dt>Inactivity logout</dt><dd>{inactivityTimeoutMinutes} minutes</dd></div>
          <div><dt>Remember device maximum</dt><dd>{rememberDeviceDays} days</dd></div>
          <div><dt>Last successful login</dt><dd>{lastLoginAt ? new Date(lastLoginAt).toLocaleString() : "No database login recorded"}</dd></div>
        </dl>
      </section>
      <section className="admin-card">
        <p className="kicker">Permissions foundation</p>
        <h2>Role-ready authorization</h2>
        <p>Super Admin, Administrator, Inventory Manager, Customer Support, Marketing, Content Manager, and Moderator permissions are defined server-side. Sensitive security changes require the Super Admin permission.</p>
      </section>
      <section className="admin-card">
        <p className="kicker">Protected evidence</p>
        <h2>Audit and login history</h2>
        <p>Successful and failed logins, lockouts, challenge delivery, verification, setup, logout, device hashes, and security-setting changes are retained in restricted server tables.</p>
      </section>
    </div>
  );
}
