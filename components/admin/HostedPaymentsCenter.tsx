"use client";

import { useMemo, useState } from "react";
import type { HostedPaymentsAdminData } from "@/lib/payments/admin";

export default function HostedPaymentsCenter({ initialData }: { initialData: HostedPaymentsAdminData }) {
  const [data, setData] = useState(initialData);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [message, setMessage] = useState("");
  const filtered = useMemo(() => data.payments.filter((payment) => {
    if (status !== "all" && payment.status !== status) return false;
    return JSON.stringify(payment).toLowerCase().includes(query.trim().toLowerCase());
  }), [data.payments, query, status]);

  async function refresh() {
    const response = await fetch("/api/admin/payments", { cache: "no-store" });
    if (!response.ok) {
      setMessage("Payment records could not be refreshed.");
      return;
    }
    setData(await response.json() as HostedPaymentsAdminData);
    setMessage("Hosted payment records refreshed.");
  }

  return (
    <>
      <section className="reliability-status-bar" data-status={data.configured ? "Operational" : "Degraded"}>
        <div><span>Processor</span><strong>{data.processor}</strong></div>
        <div><span>Provider</span><strong>{data.provider.toUpperCase()}</strong></div>
        <div><span>Mode</span><strong>{data.mode}</strong></div>
        <div><span>Status</span><strong>{data.providerStatus.replaceAll("_", " ")}</strong></div>
        <div><span>Customer mode</span><strong>{data.configured ? "ENABLED" : data.displayMode.replaceAll("_", " ").toUpperCase()}</strong></div>
        <button className="primary" type="button" onClick={() => void refresh()}>Refresh</button>
      </section>
      <section className="admin-card payment-safety-card">
        <p className="kicker">PROVIDER CONTROL</p>
        <h2>Hosted checkout is deployment-controlled</h2>
        <p>{data.providerHealthDetail}</p>
        <p>Provider selection is read from server-only configuration. No card data or provider secrets are exposed to this panel, and Segpay/CCBill remain inactive until their approved integration requirements are configured.</p>
      </section>
      <section className="reliability-panel payment-provider-panel">
        <h2>Payment processor</h2>
        <div className="reliability-toolbar">
          <label>Active processor
            <select value={data.processor} disabled aria-label="Active payment processor">
              <option value="NONE">NOT CONNECTED</option>
              <option value="SEGPAY">SEGPAY</option>
              <option value="CCBILL">CCBILL</option>
            </select>
          </label>
          <span><small>Last verified</small><strong>{data.lastVerifiedAt ? formatValue("last_verified_at", data.lastVerifiedAt) : "UNVERIFIED"}</strong></span>
        </div>
        <p className="reliability-message">Changing the processor requires an authorized server configuration change. This browser panel never receives provider secrets.</p>
        <h3>Callback URLs</h3>
        <div className="reliability-record-table">
          {Object.entries(data.callbackUrls).map(([key, value]) => <span key={key}><small>{key}</small><strong>{value}</strong></span>)}
        </div>
      </section>
      <section className="reliability-panel payment-provider-panel">
        <h2>Integration checklist</h2>
        <div className="payment-checklist-grid">
          {Object.entries(data.integrationChecklist).map(([provider, items]) => (
            <div key={provider}><h3>{provider.toUpperCase()}</h3>{items.map((item) => <p key={item.label}>{item.verified ? "✓" : "□"} {item.label}</p>)}</div>
          ))}
        </div>
      </section>
      {!data.configured ? <p className="reliability-message">No production hosted-payment provider is active. Coin checkout fails closed and the existing wallet remains usable.</p> : null}
      {message ? <p className="reliability-message" role="status">{message}</p> : null}
      <section className="reliability-toolbar">
        <input aria-label="Search hosted payments" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search payment, user, package, or reference" />
        <select aria-label="Filter payment status" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="all">All statuses</option>
          {["CREATED","PENDING_REDIRECT","REDIRECTED","PROCESSING","CONFIRMED","DECLINED","CANCELLED","EXPIRED","FAILED","REQUIRES_REVIEW","RECONCILIATION_MISMATCH"].map((item) => <option value={item} key={item}>{item.replaceAll("_", " ")}</option>)}
        </select>
      </section>
      <PaymentTable title="Payment attempts" rows={filtered} empty="No hosted payment attempts were returned." />
      <PaymentTable title="Reconciliation findings" rows={data.findings} empty="No reconciliation findings were returned." />
      <PaymentTable title="Verified callback events" rows={data.events} empty="No verified callback events were returned." />
      <section className="admin-card payment-safety-card">
        <p className="kicker">BOUNDARY</p>
        <h2>Card details stay with the provider</h2>
        <p>This station exposes internal status, provider references, amount, currency, callbacks, and reconciliation evidence only. It never displays or retrieves card numbers, expiration dates, CVV codes, raw credentials, or provider login secrets.</p>
      </section>
    </>
  );
}

function PaymentTable({ title, rows, empty }: { title: string; rows: Array<Record<string, unknown>>; empty: string }) {
  return (
    <section className="reliability-panel hosted-payments-table">
      <h2>{title}</h2>
      {rows.length ? (
        <div className="reliability-record-table">
          {rows.map((row, index) => (
            <article key={String(row.id || index)}>
              {Object.entries(row).slice(0, 10).map(([key, value]) => (
                <span key={key}><small>{key.replaceAll("_", " ")}</small><strong>{formatValue(key, value)}</strong></span>
              ))}
            </article>
          ))}
        </div>
      ) : <p>{empty}</p>}
    </section>
  );
}

function formatValue(key: string, value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (key.includes("amount_minor")) return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value) / 100);
  if (key.includes("_at")) {
    const date = new Date(String(value));
    if (!Number.isNaN(date.valueOf())) return date.toLocaleString();
  }
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return text.length > 90 ? `${text.slice(0, 87)}...` : text;
}
