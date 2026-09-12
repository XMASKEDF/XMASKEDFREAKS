"use client";

import { useEffect, useMemo, useState } from "react";

type Customer = {
  id: string;
  email: string;
  nickname: string;
  createdAt: string;
  balance: number;
  walletHistory: Array<Record<string, unknown>>;
  adminActions: Array<Record<string, unknown>>;
};

export default function AdminCustomerManager() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [configured, setConfigured] = useState(true);
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [amount, setAmount] = useState(0);
  const [adjustmentType, setAdjustmentType] = useState("balance_adjustment");
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState("Loading customer records…");
  const [busy, setBusy] = useState(false);
  const [release, setRelease] = useState({ title: "", productType: "announcement", href: "/", imageUrl: "", badge: "NEW", published: true, pinned: false });

  async function load() {
    const response = await fetch("/api/admin/customers", { cache: "no-store" });
    const data = await response.json().catch(() => ({})) as { configured?: boolean; customers?: Customer[]; error?: string };
    setConfigured(data.configured !== false);
    setCustomers(data.customers || []);
    setSelectedId((current) => current || data.customers?.[0]?.id || "");
    setStatus(response.ok ? "" : data.error || "Customer records could not be loaded.");
  }

  useEffect(() => { void load(); }, []);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term ? customers.filter((customer) => customer.nickname.toLowerCase().includes(term) || customer.email.toLowerCase().includes(term) || customer.id.includes(term)) : customers;
  }, [customers, search]);
  const selected = customers.find((customer) => customer.id === selectedId) || null;

  async function adjustWallet() {
    if (!selected || busy) return;
    setBusy(true);
    const response = await fetch("/api/admin/customers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "adjust-wallet", userId: selected.id, coinAmount: amount, adjustmentType, reason, idempotencyKey: crypto.randomUUID() })
    });
    const data = await response.json().catch(() => ({})) as { error?: string };
    setStatus(response.ok ? "Wallet updated and recorded." : data.error || "Wallet adjustment failed.");
    if (response.ok) { setAmount(0); setReason(""); await load(); }
    setBusy(false);
  }

  async function publishRelease() {
    if (busy) return;
    setBusy(true);
    const response = await fetch("/api/admin/customers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "publish-release", ...release })
    });
    const data = await response.json().catch(() => ({})) as { error?: string };
    setStatus(response.ok ? "Customer dashboard release saved." : data.error || "Release could not be saved.");
    if (response.ok) setRelease({ title: "", productType: "announcement", href: "/", imageUrl: "", badge: "NEW", published: true, pinned: false });
    setBusy(false);
  }

  if (!configured) return <section className="admin-auth-panel"><h2>Customer Accounts</h2><p>Connect Supabase to manage customer accounts.</p></section>;

  return <div className="admin-customer-manager">
    <p className="admin-form-status" role="status" aria-live="polite">{status}</p>
    <section className="admin-auth-panel">
      <p className="kicker">CUSTOMERS</p><h2>Accounts and Wallets</h2>
      <label>Search customers<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nickname, email, or ID" /></label>
      <div className="admin-customer-layout">
        <div className="admin-customer-list" role="listbox" aria-label="Customer accounts">
          {visible.map((customer) => <button type="button" role="option" aria-selected={selectedId === customer.id} className={selectedId === customer.id ? "is-selected" : ""} onClick={() => setSelectedId(customer.id)} key={customer.id}><span><strong>{customer.nickname || "Unnamed customer"}</strong><small>{customer.email}</small></span><b>{customer.balance.toLocaleString()} coins</b></button>)}
        </div>
        {selected ? <article className="admin-customer-detail">
          <h3>{selected.nickname || "Unnamed customer"}</h3><p>{selected.email}</p><strong>{selected.balance.toLocaleString()} coins</strong>
          <div className="admin-customer-adjustment">
            <label>Action<select value={adjustmentType} onChange={(event) => setAdjustmentType(event.target.value)}><option value="balance_adjustment">Balance adjustment</option><option value="promotional_coins">Promotional coins</option><option value="refund">Refund</option></select></label>
            <label>Coin amount<input type="number" step="1" value={amount} onChange={(event) => setAmount(Number(event.target.value))} /></label>
            <label>Required reason<textarea value={reason} onChange={(event) => setReason(event.target.value)} /></label>
            <button className="primary" type="button" disabled={busy || !amount || reason.trim().length < 4} onClick={() => void adjustWallet()}>Confirm wallet action</button>
          </div>
          <details><summary>Recent wallet history ({selected.walletHistory.length})</summary><pre>{JSON.stringify(selected.walletHistory, null, 2)}</pre></details>
          <details><summary>Administrator actions ({selected.adminActions.length})</summary><pre>{JSON.stringify(selected.adminActions, null, 2)}</pre></details>
        </article> : <p>Select a customer.</p>}
      </div>
    </section>
    <section className="admin-auth-panel">
      <p className="kicker">WHAT&apos;S NEW</p><h2>Customer Dashboard Release</h2>
      <div className="admin-release-form">
        <label>Title<input value={release.title} onChange={(event) => setRelease({ ...release, title: event.target.value })} /></label>
        <label>Type<select value={release.productType} onChange={(event) => setRelease({ ...release, productType: event.target.value })}><option value="announcement">Announcement</option><option value="merch">Merch</option><option value="audio">Audio</option><option value="painting">Painting</option><option value="upcoming">Upcoming event</option><option value="digital">Digital</option><option value="physical">Physical</option></select></label>
        <label>Internal destination<input value={release.href} onChange={(event) => setRelease({ ...release, href: event.target.value })} /></label>
        <label>Image URL<input value={release.imageUrl} onChange={(event) => setRelease({ ...release, imageUrl: event.target.value })} /></label>
        <label>Badge<input value={release.badge} onChange={(event) => setRelease({ ...release, badge: event.target.value })} /></label>
        <label className="admin-check-row"><input type="checkbox" checked={release.published} onChange={(event) => setRelease({ ...release, published: event.target.checked })} /> Publish now</label>
        <label className="admin-check-row"><input type="checkbox" checked={release.pinned} onChange={(event) => setRelease({ ...release, pinned: event.target.checked })} /> Pin release</label>
        <button className="primary" type="button" disabled={busy || release.title.trim().length < 3} onClick={() => void publishRelease()}>Save release</button>
      </div>
    </section>
  </div>;
}
