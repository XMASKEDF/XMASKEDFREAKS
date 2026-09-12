"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useI18n } from "@/components/I18nProvider";
import { PUBLIC_NAVIGATION } from "@/lib/public-navigation";
import { useEffect, useState } from "react";

const PREFETCH_ROUTES = [
  "/live",
  "/merch",
  "/games",
  "/audio-clips",
  "/fansly",
  "/paintings",
  "/feet",
  "/upcoming",
  "/feedback",
  "/account"
] as const;

export default function PublicNavigation({ gamesEnabled }: { gamesEnabled?: boolean }) {
  void gamesEnabled;
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useI18n();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    const prefetch = () => PREFETCH_ROUTES.forEach((href) => router.prefetch(href));
    let idleHandle: number | null = null;
    let usesIdleCallback = false;
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    if (idleWindow.requestIdleCallback) {
      usesIdleCallback = true;
      idleHandle = idleWindow.requestIdleCallback(prefetch, { timeout: 1200 });
    } else {
      idleHandle = window.setTimeout(prefetch, 250);
    }
    return () => {
      if (idleHandle === null) return;
      if (usesIdleCallback) idleWindow.cancelIdleCallback?.(idleHandle);
      else window.clearTimeout(idleHandle);
    };
  }, [router]);

  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  const prefetchOnIntent = (href: string) => router.prefetch(href);
  const markPending = (href: string) => {
    if (href !== pathname) setPendingHref(href);
  };

  return (
    <nav aria-label={t("nav.primary")}>
      {PUBLIC_NAVIGATION.map((item) => {
        const active = pathname === item.href || (item.href !== "/live" && pathname.startsWith(`${item.href}/`));
        return <Link
          className={active || pendingHref === item.href ? "is-active" : ""}
          href={item.href}
          aria-current={active ? "page" : undefined}
          key={item.id}
          onMouseEnter={() => prefetchOnIntent(item.href)}
          onFocus={() => prefetchOnIntent(item.href)}
          onPointerDown={() => markPending(item.href)}
          onClick={() => markPending(item.href)}
        >{t(item.translationKey)}</Link>;
      })}
      <Link className={`nav-search-link ${pathname === "/search" || pendingHref === "/search" ? "is-active" : ""}`} href="/search" aria-current={pathname === "/search" ? "page" : undefined} aria-label={t("search.title")} onMouseEnter={() => prefetchOnIntent("/search")} onFocus={() => prefetchOnIntent("/search")} onPointerDown={() => markPending("/search")} onClick={() => markPending("/search")}>
        <span aria-hidden="true">⌕</span><span>{t("search.nav")}</span>
      </Link>
    </nav>
  );
}
