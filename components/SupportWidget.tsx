"use client";

import { FormEvent, useEffect, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import { normalizeLocale } from "@/lib/i18n";

type Message = {
  role: "assistant" | "user";
  content: string;
};

export default function SupportWidget() {
  const { locale: language, t } = useI18n();
  const [open, setOpen] = useState(false);
  const [thread, setThread] = useState<Message[]>([
    {
      role: "assistant",
      content: t("support.starter")
    }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setThread((items) => {
      if (items.length > 1) return items;
      return [{ role: "assistant", content: t("support.starter") }];
    });
  }, [t]);

  useEffect(() => {
    const openSupport = () => setOpen(true);
    window.addEventListener("xmf:open-support", openSupport);
    return () => window.removeEventListener("xmf:open-support", openSupport);
  }, []);

  async function sendSupportMessage(content: string) {
    const trimmed = content.trim();
    if (!trimmed || loading) return;

    const nextMessages: Message[] = [...thread, { role: "user", content: trimmed }];
    setThread(nextMessages);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: trimmed,
            history: nextMessages.slice(-8),
            language: normalizeLocale(language),
            metadata: {
              pageUrl: typeof window === "undefined" ? "/" : window.location.href,
              deviceType: typeof navigator !== "undefined" && /iphone|ipad|android/i.test(navigator.userAgent) ? "Mobile" : "Desktop",
              browser: typeof navigator === "undefined" ? "unknown" : navigator.userAgent
            }
          })
        });
      const data = (await response.json()) as { reply?: string };
      setThread([...nextMessages, { role: "assistant", content: data.reply || t("support.fallback") }]);
    } catch {
      setThread([...nextMessages, { role: "assistant", content: t("support.offline") }]);
    } finally {
      setLoading(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void sendSupportMessage(input);
  }

  const latestMessage = thread[thread.length - 1];

  return (
    <aside className={`support-widget ${open ? "is-open" : ""}`} aria-label={t("support.title")}>
      {open ? (
        <div className="support-panel">
          <div className="support-header">
            <strong>{t("support.ask")}</strong>
            <span className={`support-message ${latestMessage?.role || "assistant"}`} aria-live="polite">
              {loading ? t("support.thinking") : latestMessage?.content || t("support.starter")}
            </span>
          </div>

          <form className="support-form" onSubmit={submit}>
            <input
              aria-label={t("support.messageLabel")}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={t("support.placeholder")}
            />
            <button className="primary" type="submit">{t("support.send")}</button>
          </form>
          <button className="secondary support-close" type="button" onClick={() => setOpen(false)} aria-label={t("support.close")}>
            ×
          </button>
        </div>
      ) : (
        <button id="maya-support" className="support-toggle primary" type="button" onClick={() => setOpen(true)}>
          {t("support.ask")}
        </button>
      )}
    </aside>
  );
}
