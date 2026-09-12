"use client";

import { useMemo, useState } from "react";

type Subscriber = { id: string; email: string; language_code: string; consent_status: string; source: string; subscribed_at: string; last_email_sent_at: string | null; delivery_status: string };

export default function AdminEmailList({ initialSubscribers }: { initialSubscribers: Subscriber[] }) {
  const [query, setQuery] = useState(""); const [items, setItems] = useState(initialSubscribers); const [message, setMessage] = useState("");
  const visible = useMemo(() => items.filter((item) => `${item.email} ${item.language_code} ${item.source}`.toLowerCase().includes(query.toLowerCase())), [items, query]);
  async function unsubscribe(id: string) {
    const item = items.find((entry) => entry.id === id); if (!item) return;
    const response = await fetch("/api/newsletter", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "unsubscribe", email: item.email, language: item.language_code, source: "admin_suppression" }) });
    if (!response.ok) { setMessage("Could not update subscriber."); return; }
    setItems((current) => current.map((entry) => entry.id === id ? { ...entry, consent_status: "unsubscribed" } : entry)); setMessage("Subscriber suppressed.");
  }
  return <section className="admin-commerce-panel"><header><div><p className="kicker">ADMIN · MESSAGING</p><h2>Email List</h2><p>Consent-aware newsletter subscribers. Transactional recipients remain in the protected delivery queue.</p></div></header><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search email, language, source" />{message ? <p role="status">{message}</p> : null}<div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Email</th><th>Subscribed</th><th>Language</th><th>Consent</th><th>Source</th><th>Delivery</th><th>Action</th></tr></thead><tbody>{visible.map((item) => <tr key={item.id}><td>{item.email}</td><td>{new Date(item.subscribed_at).toLocaleDateString()}</td><td>{item.language_code}</td><td>{item.consent_status}</td><td>{item.source}</td><td>{item.delivery_status}</td><td><button className="secondary" type="button" disabled={item.consent_status !== "subscribed"} onClick={() => void unsubscribe(item.id)}>Unsubscribe</button></td></tr>)}</tbody></table></div></section>;
}
