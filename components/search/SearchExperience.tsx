"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import BrandLogo from "@/components/BrandLogo";
import PublicNavigation from "@/components/PublicNavigation";
import { useI18n } from "@/components/I18nProvider";
import type { SearchRecord } from "@/lib/site-search";

type Payload = { results: SearchRecord[]; total: number; page: number; pages: number; query: string; error?: string };

export default function SearchExperience() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get("q") || "");
  const [filter, setFilter] = useState(params.get("filter") || "all");
  const [sort, setSort] = useState(params.get("sort") || "newest");
  const [page, setPage] = useState(Math.max(1, Number(params.get("page")) || 1));
  const [payload, setPayload] = useState<Payload>({ results: [], total: 0, page: 1, pages: 1, query: "" });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      const search = new URLSearchParams({ q: query, filter, sort, page: String(page) });
      router.replace(`/search?${search.toString()}`, { scroll: false });
      const response = await fetch(`/api/search?${search.toString()}`, { cache: "no-store", signal: controller.signal }).catch(() => null);
      if (response) setPayload(await response.json());
      else setPayload({ results: [], total: 0, page: 1, pages: 1, query, error: t("search.unavailable") });
      setLoading(false);
    }, 320);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [filter, page, query, router, sort, t]);

  const links = useMemo(() => [{ href: "/merch", label: "MERCH" }, { href: "/audio-clips", label: "AudioClips" }, { href: "/paintings", label: "Paintings" }, { href: "/feet", label: "Feet" }, { href: "/upcoming", label: "Upcoming" }], []);
  return <main className="search-page">
    <header className="site-header"><BrandLogo href="/" priority /><PublicNavigation /></header>
    <section className="search-hero"><p className="kicker">{t("search.kicker")}</p><h1>{t("search.title")}</h1><p>{t("search.description")}</p></section>
    <section className="search-controls" aria-label={t("search.controls")}>
      <label>{t("search.label")}<span><input type="search" autoFocus value={query} maxLength={80} onChange={(event) => { setQuery(event.target.value); setPage(1); }} /><button type="button" aria-label={t("search.clear")} disabled={!query} onClick={() => setQuery("")}>×</button></span></label>
      <label>{t("search.filter")}<select value={filter} onChange={(event) => { setFilter(event.target.value); setPage(1); }}>{["all","merch","audio","painting","feet","clips4sale","upcoming","available","sold-out","digital","physical"].map((value) => <option value={value} key={value}>{t(`search.filter.${value}`)}</option>)}</select></label>
      <label>{t("search.sort")}<select value={sort} onChange={(event) => setSort(event.target.value)}><option value="newest">{t("search.newest")}</option><option value="oldest">{t("search.oldest")}</option><option value="price-low">{t("search.priceLow")}</option><option value="price-high">{t("search.priceHigh")}</option></select></label>
    </section>
    <p className="search-status" role="status" aria-live="polite">{loading ? t("search.loading") : payload.error || t("search.count", { count: payload.total })}</p>
    {payload.results.length ? <section className="search-grid" aria-label={t("search.results")}>{payload.results.map((item) => <article key={`${item.type}:${item.id}`}><div className="search-result-image"><Image src={item.imageUrl || "/branding/optimized/mask-logo-512.png"} alt="" fill sizes="(max-width: 680px) 100vw, 33vw" /></div><div><span>{item.type}</span>{item.badge ? <b>{item.badge}</b> : null}<h2>{item.title}</h2><p>{item.description}</p><small>{item.available ? t("search.available") : t("search.soldOut")}{item.coinPrice !== null ? ` · ${item.coinPrice} ${t("account.coins")}` : ""}</small><Link className="primary" href={item.href} onClick={() => void fetch("/api/search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query, filter, resultCount: payload.total, contentType: item.type, contentId: item.id }) })}>{t("search.open")}</Link></div></article>)}</section> : !loading ? <section className="search-empty"><h2>{t("search.noMatches")}</h2><p>{t("search.noMatchesCopy")}</p><div>{links.map((item) => <Link href={item.href} key={item.href}>{item.label}</Link>)}</div></section> : null}
    {payload.pages > 1 ? <nav className="search-pagination" aria-label={t("search.pagination")}><button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>{t("search.previous")}</button><span>{page} / {payload.pages}</span><button type="button" disabled={page >= payload.pages} onClick={() => setPage((value) => value + 1)}>{t("search.next")}</button></nav> : null}
  </main>;
}
