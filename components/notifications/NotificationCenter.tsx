"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAccount } from "@/components/account/AccountProvider";
import { useI18n } from "@/components/I18nProvider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Notice = { id: string; title: string; message: string; image_url?: string; destination_url?: string; priority: string; read_at?: string; created_at: string };

export default function NotificationCenter({ page = false }: { page?: boolean }) {
  const { account } = useAccount();
  const { locale, t } = useI18n();
  const [open, setOpen] = useState(page);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [announcements, setAnnouncements] = useState<Notice[]>([]);
  const [unread, setUnread] = useState(0);
  const [status, setStatus] = useState("");

  const token = useCallback(async () => {
    try { return (await createSupabaseBrowserClient().auth.getSession()).data.session?.access_token || null; } catch { return null; }
  }, []);
  const refresh = useCallback(async () => {
    const accessToken = await token();
    const response = await fetch("/api/notifications", { cache: "no-store", headers: accessToken ? { authorization: `Bearer ${accessToken}` } : {} }).catch(() => null);
    if (!response?.ok) { setStatus(t("notifications.unavailable")); return; }
    const data = await response.json() as { notifications?: Notice[]; announcements?: Notice[]; unread?: number };
    setNotices(data.notifications || []); setAnnouncements(data.announcements || []); setUnread(data.unread || 0); setStatus("");
  }, [t, token]);

  useEffect(() => {
    void refresh();
    const onFocus = () => { if (!document.hidden) void refresh(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => { window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onFocus); };
  }, [account.userId, refresh]);

  useEffect(() => {
    if (!account.userId) return;
    let client;
    try { client = createSupabaseBrowserClient(); } catch { return; }
    const channel = client.channel(`notifications:${account.userId}`).on("postgres_changes", { event: "*", schema: "public", table: "customer_notifications", filter: `user_id=eq.${account.userId}` }, () => void refresh()).subscribe();
    return () => { void client.removeChannel(channel); };
  }, [account.userId, refresh]);

  async function update(action: "read" | "read-all" | "dismiss", id?: string) {
    const accessToken = await token();
    if (!accessToken) return;
    await fetch("/api/notifications", { method: "PATCH", headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" }, body: JSON.stringify({ action, id }) });
    await refresh();
  }
  const content = <section className={`notification-panel ${page ? "is-page" : ""}`} aria-label={t("notifications.title")}>
    <header><div><p className="kicker">{t("notifications.kicker")}</p><h2>{t("notifications.title")}</h2></div>{unread ? <button type="button" onClick={() => void update("read-all")}>{t("notifications.markAll")}</button> : null}</header>
    <p role="status">{status}</p>
    {[...notices, ...announcements].length ? <div className="notification-list">{[...notices, ...announcements].map((notice) => <article className={!notice.read_at && notices.includes(notice) ? "is-unread" : ""} key={notice.id}>{notice.image_url ? <Image src={notice.image_url} alt="" width={52} height={52} /> : null}<div><span>{notice.priority}</span><strong>{notice.title}</strong><p>{notice.message}</p><time dateTime={notice.created_at}>{new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(Math.round((new Date(notice.created_at).getTime() - Date.now()) / 3_600_000), "hour")}</time>{notice.destination_url?.startsWith("/") ? <Link href={notice.destination_url} onClick={() => void update("read", notice.id)}>{t("notifications.open")}</Link> : null}</div>{notices.includes(notice) ? <button type="button" aria-label={t("notifications.dismiss")} onClick={() => void update("dismiss", notice.id)}>×</button> : null}</article>)}</div> : <p className="notification-empty">{t("notifications.empty")}</p>}
    {!page ? <Link className="notification-all-link" href="/notifications">{t("notifications.viewAll")}</Link> : null}
  </section>;
  if (page) return content;
  return <div className="notification-center"><button className="notification-trigger" type="button" aria-label={t("notifications.openLabel", { count: unread })} aria-expanded={open} onClick={() => setOpen((value) => !value)}>♢{unread ? <b>{unread > 99 ? "99+" : unread}</b> : null}</button>{open ? content : null}</div>;
}
