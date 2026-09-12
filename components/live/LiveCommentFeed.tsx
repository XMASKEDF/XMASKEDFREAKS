"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useI18n } from "@/components/I18nProvider";

type FeedEvent = {
  id: string;
  type: "comment" | "tip";
  displayName: string;
  message: string;
  coins?: number;
  createdAt: string;
};

type FeedResponse = {
  configured?: boolean;
  events?: FeedEvent[];
  event?: FeedEvent;
  error?: string;
};

const MAX_EVENTS = 40;
const MAX_OVERLAY_EVENTS = 4;

function mergeEvents(current: FeedEvent[], incoming: FeedEvent[]) {
  const byId = new Map(current.map((event) => [event.id, event]));
  incoming.forEach((event) => byId.set(event.id, event));
  const next = [...byId.values()]
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .slice(-MAX_EVENTS);
  if (next.length === current.length && next.every((event, index) => {
    const previous = current[index];
    return previous?.id === event.id
      && previous.createdAt === event.createdAt
      && previous.displayName === event.displayName
      && previous.message === event.message
      && previous.type === event.type
      && previous.coins === event.coins;
  })) return current;
  return next;
}

function displayTime(value: string, locale: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(date)
    : "";
}

export default function LiveCommentFeed({ sandbox = false, liveSessionId }: { sandbox?: boolean; liveSessionId: string }) {
  const { locale, t } = useI18n();
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState("");
  const [sending, setSending] = useState(false);
  const [unread, setUnread] = useState(0);
  const [newWhileScrolled, setNewWhileScrolled] = useState(0);
  const knownIdsRef = useRef(new Set<string>());
  const initialLoadRef = useRef(true);
  const drawerOpenRef = useRef(drawerOpen);
  const historyRef = useRef<HTMLDivElement>(null);
  const historyAtBottomRef = useRef(true);
  const eventCountRef = useRef(0);

  useEffect(() => {
    drawerOpenRef.current = drawerOpen;
  }, [drawerOpen]);

  const sendPresence = useCallback(async (action: "presence" | "away" | "leave") => {
    await fetch("/api/live/comments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ liveSessionId, environment: sandbox ? "sandbox" : "production", action })
    }).catch(() => null);
  }, [liveSessionId, sandbox]);

  useEffect(() => {
    void sendPresence("presence");
    const heartbeat = window.setInterval(() => {
      if (!document.hidden) void sendPresence("presence");
    }, 20_000);
    const onVisibilityChange = () => void sendPresence(document.hidden ? "away" : "presence");
    const onPageHide = () => {
      const payload = JSON.stringify({ liveSessionId, environment: sandbox ? "sandbox" : "production", action: "leave" });
      const beacon = new Blob([payload], { type: "application/json" });
      if (!navigator.sendBeacon("/api/live/comments", beacon)) void sendPresence("leave");
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
      void sendPresence("leave");
    };
  }, [liveSessionId, sandbox, sendPresence]);

  const loadFeed = useCallback(async () => {
    const query = new URLSearchParams({
      sessionId: liveSessionId,
      environment: sandbox ? "sandbox" : "production"
    });
    const response = await fetch(`/api/live/comments?${query.toString()}`, { cache: "no-store" }).catch(() => null);
    if (!response?.ok) return;
    const payload = await response.json().catch(() => ({})) as FeedResponse;
    const incoming = Array.isArray(payload.events) ? payload.events : [];
    if (!initialLoadRef.current) {
      const newCount = incoming.filter((event) => !knownIdsRef.current.has(event.id)).length;
      if (newCount > 0 && !drawerOpenRef.current) setUnread((count) => Math.min(99, count + newCount));
    }
    incoming.forEach((event) => knownIdsRef.current.add(event.id));
    if (knownIdsRef.current.size > MAX_EVENTS * 3) {
      knownIdsRef.current = new Set([...knownIdsRef.current].slice(-MAX_EVENTS * 3));
    }
    setEvents((current) => mergeEvents(current, incoming));
    initialLoadRef.current = false;
  }, [liveSessionId, sandbox]);

  useEffect(() => {
    let active = true;
    const poll = () => { if (active) void loadFeed(); };
    poll();
    const timer = window.setInterval(poll, 8_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [loadFeed]);

  const overlayEvents = useMemo(() => events.slice(-MAX_OVERLAY_EVENTS), [events]);

  useEffect(() => {
    if (!drawerOpen || eventCountRef.current === 0) return;
    if (events.length > eventCountRef.current && !historyAtBottomRef.current) {
      setNewWhileScrolled((count) => Math.min(MAX_EVENTS, count + events.length - eventCountRef.current));
    }
    eventCountRef.current = events.length;
  }, [drawerOpen, events.length]);

  useEffect(() => {
    if (!drawerOpen) return;
    const history = historyRef.current;
    if (history && eventCountRef.current === 0) {
      history.scrollTop = history.scrollHeight;
      eventCountRef.current = events.length;
    }
  }, [drawerOpen, events.length]);

  function handleHistoryScroll() {
    const history = historyRef.current;
    if (!history) return;
    const atBottom = history.scrollHeight - history.scrollTop - history.clientHeight <= 32;
    historyAtBottomRef.current = atBottom;
    if (atBottom) setNewWhileScrolled(0);
  }

  function jumpToLatest() {
    const history = historyRef.current;
    if (history) history.scrollTop = history.scrollHeight;
    historyAtBottomRef.current = true;
    setNewWhileScrolled(0);
  }

  async function postComment(message: string) {
    if (!message) return;
    setStatus("");
    setSending(true);
    const clientMessageId = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `comment-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const response = await fetch("/api/live/comments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ liveSessionId, environment: sandbox ? "sandbox" : "production", message, clientMessageId })
    }).catch(() => null);
    const payload = await response?.json().catch(() => ({})) as FeedResponse;
    if (!response?.ok || !payload.event) {
      setStatus(payload.error || t("chat.failed"));
      setSending(false);
      return;
    }
    const createdEvent = payload.event;
    setEvents((current) => mergeEvents(current, [createdEvent]));
    knownIdsRef.current.add(createdEvent.id);
    setDraft("");
    setComposerOpen(false);
    setStatus("");
    setSending(false);
  }

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await postComment(draft.trim());
  }

  function openDrawer() {
    setDrawerOpen(true);
    setUnread(0);
  }

  return (
    <section className="live-comment-feed" aria-label={t("chat.title")}>
      <div className="live-comment-overlay" aria-live="polite">
        {overlayEvents.map((event) => (
          <article className={`live-comment-event ${event.type === "tip" ? "is-tip" : "is-comment"}`} key={event.id}>
            <strong>{event.displayName}</strong>
            <span>{event.type === "tip" ? t("chat.tipEvent", { coins: event.coins || 0 }) : event.message}</span>
          </article>
        ))}
      </div>

      <div className="live-comment-controls">
        <button className="live-comment-action" type="button" onClick={() => setComposerOpen((open) => !open)} aria-expanded={composerOpen}>
          {t("chat.comment")}
        </button>
        <button className="live-comment-action" type="button" onClick={openDrawer} aria-expanded={drawerOpen}>
          {t("chat.title")}{unread > 0 ? ` (${unread})` : ""}
        </button>
      </div>

      {composerOpen ? (
        <form className="live-comment-composer" onSubmit={submitComment}>
          <label htmlFor="live-comment-input">{t("chat.comment")}</label>
            <div>
              <input
              id="live-comment-input"
              value={draft}
              maxLength={280}
              placeholder={t("chat.placeholder")}
                onChange={(event) => setDraft(event.target.value)}
              />
            <button className="live-comment-send" type="submit" disabled={!draft.trim() || sending}>{sending ? "..." : t("chat.send")}</button>
          </div>
          <small>{t("chat.characterCount", { count: draft.length })}</small>
          {status ? <span className="live-comment-status" role="status">{status}</span> : null}
          {status && draft.trim() ? <button className="secondary live-comment-retry" type="button" onClick={() => void postComment(draft.trim())} disabled={sending}>{t("chat.retry")}</button> : null}
        </form>
      ) : null}

      {drawerOpen ? (
        <aside className="live-comments-drawer" role="dialog" aria-modal="false" aria-labelledby="live-comments-title">
          <header>
            <h2 id="live-comments-title">{t("chat.title")}</h2>
            <button className="live-comment-close" type="button" onClick={() => setDrawerOpen(false)} aria-label={t("chat.close")}>×</button>
          </header>
          <div className="live-comments-history" ref={historyRef} onScroll={handleHistoryScroll} aria-live="polite">
            {events.length ? events.map((event) => (
              <article className={`live-comment-history-event ${event.type === "tip" ? "is-tip" : "is-comment"}`} key={event.id}>
                <div><strong>{event.displayName}</strong><time>{displayTime(event.createdAt, locale)}</time></div>
                <p>{event.type === "tip" ? t("chat.tipEvent", { coins: event.coins || 0 }) : event.message}</p>
              </article>
            )) : <p className="live-comment-empty">{t("chat.empty")}</p>}
          </div>
          {newWhileScrolled > 0 ? <button className="secondary live-comment-new" type="button" onClick={jumpToLatest}>{t("chat.newComments", { count: newWhileScrolled })}</button> : null}
          <button className="secondary live-comment-drawer-compose" type="button" onClick={() => { setDrawerOpen(false); setComposerOpen(true); }}>{t("chat.comment")}</button>
        </aside>
      ) : null}
    </section>
  );
}
