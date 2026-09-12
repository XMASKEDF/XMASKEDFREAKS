"use client";

import { useState } from "react";
import { useI18n } from "@/components/I18nProvider";

export default function FeedbackForm() {
  const { t } = useI18n();
  const [category, setCategory] = useState("general");
  const [text, setText] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setStatus("");
    const response = await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ category, text }) });
    const data = await response.json().catch(() => ({})) as { ok?: boolean; error?: string };
    setBusy(false);
    if (!response.ok || !data.ok) { setStatus(data.error || "Feedback could not be sent."); return; }
    setText(""); setStatus(t("feedback.thankYou"));
  }
  return <form className="feedback-form" onSubmit={(event) => void submit(event)}><label>{t("feedback.category")}<select value={category} onChange={(event) => setCategory(event.target.value)}><option value="concern">{t("feedback.concern")}</option><option value="appreciation">{t("feedback.appreciation")}</option><option value="suggestion">{t("feedback.suggestion")}</option><option value="general">{t("feedback.general")}</option></select></label><label>{t("feedback.message")}<textarea value={text} onChange={(event) => setText(event.target.value.slice(0, 100))} maxLength={100} rows={4} required /><small>{text.length}/100</small></label><button className="primary" type="submit" disabled={busy || !text.trim()}>{busy ? t("feedback.sending") : t("feedback.submit")}</button>{status ? <p role="status">{status}</p> : null}</form>;
}
