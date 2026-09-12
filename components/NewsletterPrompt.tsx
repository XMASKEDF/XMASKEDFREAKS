"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/I18nProvider";

const shownKey = "xmf-newsletter-shown-at";
const subscribedKey = "xmf-newsletter-subscribed";

export default function NewsletterPrompt() {
  const pathname = usePathname();
  const { locale } = useI18n();
  const [open, setOpen] = useState(false);
  const queuedRef = useRef(false);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (pathname.startsWith("/admin") || pathname.startsWith("/auth")) return;
    const started = Date.now();
    const timer = window.setTimeout(() => {
      if (window.localStorage.getItem(subscribedKey)) return;
      const lastShown = Number(window.localStorage.getItem(shownKey) || 0);
      if (Date.now() - lastShown < 30 * 86400000) return;
      if (document.fullscreenElement) queuedRef.current = true;
      else setOpen(true);
      window.localStorage.setItem(shownKey, String(started));
    }, 10 * 60 * 1000);
    const onFullscreen = () => {
      if (!document.fullscreenElement && queuedRef.current) { queuedRef.current = false; setOpen(true); }
    };
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => { window.clearTimeout(timer); document.removeEventListener("fullscreenchange", onFullscreen); };
  }, [pathname]);

  async function submit() {
    setBusy(true); setMessage("");
    const response = await fetch("/api/newsletter", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, language: locale, source: "newsletter_popup" }) });
    const data = await response.json().catch(() => ({})) as { ok?: boolean; error?: string };
    setBusy(false);
    if (!response.ok || !data.ok) { setMessage(data.error || "Please try again."); return; }
    window.localStorage.setItem(subscribedKey, "1"); setMessage("You are on the list."); window.setTimeout(() => setOpen(false), 900);
  }

  if (!open) return null;
  return <div className="newsletter-prompt" role="dialog" aria-modal="true" aria-labelledby="newsletter-title"><button className="newsletter-close" type="button" onClick={() => setOpen(false)} aria-label="Close">×</button><p className="kicker">XMASKEDFREAKS</p><h2 id="newsletter-title">Stay in the loop</h2><p>Get live alerts and new release notes. We will only email you with consent.</p><label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label><button className="primary" type="button" disabled={busy || !email} onClick={() => void submit()}>{busy ? "Saving..." : "Subscribe"}</button><a href="/privacy">Privacy</a>{message ? <p role="status">{message}</p> : null}</div>;
}
