"use client";

import { useState } from "react";

type Feedback = { id: string; category: string; original_text: string; original_language: string; english_translation: string | null; translation_status: string; status: string; admin_notes: string | null; created_at: string };

export default function AdminFeedbackManager({ initialFeedback }: { initialFeedback: Feedback[] }) {
  const [items, setItems] = useState(initialFeedback); const [message, setMessage] = useState("");
  async function save(item: Feedback) {
    const response = await fetch("/api/admin/feedback", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, status: item.status, adminNotes: item.admin_notes }) });
    if (!response.ok) { setMessage("Feedback could not be saved."); return; }
    setMessage("Saved.");
  }
  return <section className="admin-commerce-panel feedback-admin"><header><div><p className="kicker">ADMIN · CUSTOMER EXPERIENCE</p><h2>Feedback</h2><p>Private submissions, preserved originals, translation status, and internal notes.</p></div></header>{message ? <p role="status">{message}</p> : null}<div className="feedback-admin-list">{items.length ? items.map((item) => <article key={item.id}><header><strong>{item.category}</strong><time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString()}</time></header><p><strong>English:</strong> {item.english_translation || "Translation pending"}</p><p><strong>Original ({item.original_language}):</strong> {item.original_text}</p><label>Status<select value={item.status} onChange={(event) => setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: event.target.value } : entry))}><option>New</option><option>Reviewed</option><option>Responded</option><option>Archived</option></select></label><label>Admin notes<textarea value={item.admin_notes || ""} onChange={(event) => setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, admin_notes: event.target.value.slice(0, 2000) } : entry))} rows={3} /></label><button className="primary" type="button" onClick={() => void save(item)}>Save</button></article>) : <p>No feedback submissions.</p>}</div></section>;
}
