"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

type Settings = {
  enabled: boolean;
  message: string;
  expectedReturnAt: string | null;
  stateVersion: number;
};

type MaintenanceData = {
  settings: Settings;
  history: Array<{ id: string; action: string; scope: string; reason: string; created_at: string }>;
  propagation: { status: string; message: string; stateVersion: number };
};

export default function EmergencyMaintenancePanel({ compact = false }: { compact?: boolean }) {
  const [data, setData] = useState<MaintenanceData | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/maintenance", { cache: "no-store" });
    if (!response.ok) return setStatus("Kill Switch controls could not be loaded.");
    setData(await response.json() as MaintenanceData);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const history = useMemo(() => data?.history.filter((item) => `${item.action} ${item.scope} ${item.reason}`.toLowerCase().includes(filter.toLowerCase())) || [], [data?.history, filter]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setStatus("Verifying administrator access...");
    const form = new FormData(event.currentTarget);
    const action = data?.settings.enabled ? "restore" : "activate";
    if (!window.confirm(action === "activate" ? "Confirm site shutdown. The public XMASKEDFREAKS site will become unavailable." : "Confirm restoration of public access.")) {
      setBusy(false);
      return;
    }
    const reauth = await fetch("/api/admin/reauthenticate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: form.get("password") }) });
    if (!reauth.ok) {
      setBusy(false);
      setStatus("Reauthentication failed. No Kill Switch setting changed.");
      return;
    }
    setStatus(action === "activate" ? "Activating the server-authoritative Kill Switch..." : "Running restoration health checks...");
    const response = await fetch("/api/admin/maintenance", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, confirmation: form.get("confirmation"), reason: form.get("reason"), publicMessage: form.get("publicMessage"), expectedReturnAt: form.get("expectedReturnAt") || null, override: form.get("override") === "on", overrideReason: form.get("overrideReason") })
    });
    const result = await response.json() as { message?: string };
    setBusy(false);
    setStatus(result.message || "The Kill Switch request could not be completed.");
    if (response.ok) {
      event.currentTarget.reset();
      await load();
    }
  }

  const active = data?.settings.enabled === true;
  return (
    <section className={`admin-card emergency-maintenance-panel${active ? " is-active" : ""}`}>
      <header className="emergency-maintenance-header">
        <div><p className="kicker">Critical control</p><h2>{active ? "RESTORE PUBLIC ACCESS" : "KILL SWITCH"}</h2></div>
        <span className={`security-state ${active ? "critical" : "operational"}`}>{active ? "ACTIVE" : "INACTIVE"}</span>
      </header>
      <p>{active ? "The public site is shut down by a server-stored Kill Switch. Admin, recovery, verified webhooks, and operational health paths remain available." : "One deliberate action shuts down the public site. Nothing changes until administrator reauthentication and exact confirmation succeed."}</p>
      <form onSubmit={submit} className="emergency-maintenance-form">
        {!active ? <>
          <label>Public message<textarea name="publicMessage" defaultValue="XMASKEDFREAKS is temporarily unavailable." maxLength={1000} rows={3} /></label>
          <label>Estimated return time<input name="expectedReturnAt" type="datetime-local" /></label>
        </> : <>
          <label className="admin-check-row"><input name="override" type="checkbox" /> Emergency override if a critical health check fails</label>
          <label>Override reason<textarea name="overrideReason" maxLength={1000} rows={2} /></label>
        </>}
        <label>{active ? "Restoration reason" : "Private shutdown reason"}<textarea name="reason" required minLength={8} maxLength={1000} rows={3} /></label>
        <label>Admin password<input name="password" type="password" required autoComplete="current-password" maxLength={256} /></label>
        <label>Type KILL SWITCH<input name="confirmation" required pattern="KILL SWITCH" autoComplete="off" /></label>
        <button className={active ? "primary" : "danger-button"} type="submit" disabled={busy}>{busy ? "Working..." : active ? "RESTORE PUBLIC ACCESS" : "ACTIVATE KILL SWITCH"}</button>
        <p role="status" className="status-line">{status}</p>
      </form>
      {!compact && data ? <div className="maintenance-evidence"><p><strong>State version:</strong> {data.settings.stateVersion} · <strong>Propagation:</strong> {data.propagation.status}</p><p>{data.propagation.message}</p><label>Search Kill Switch history<input type="search" value={filter} onChange={(event) => setFilter(event.target.value)} /></label>{history.slice(0, 8).map((item) => <p key={item.id}><time>{new Date(item.created_at).toLocaleString()}</time> · <strong>{item.action}</strong> · {item.scope} · {item.reason}</p>)}</div> : null}
    </section>
  );
}
