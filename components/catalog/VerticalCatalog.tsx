"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { CatalogEntry } from "@/lib/commerce/types";
import { useI18n } from "@/components/I18nProvider";

function safeDestination(value: string | null) {
  if (!value) return null;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try { const url = new URL(value); return url.protocol === "https:" ? url.toString() : null; } catch { return null; }
}

export default function VerticalCatalog({ entries, speedSeconds = 36, pausedByAdmin = false }: { entries: CatalogEntry[]; speedSeconds?: number; pausedByAdmin?: boolean }) {
  const { t } = useI18n();
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(media.matches);
    const visibility = () => setPaused(document.hidden);
    sync(); media.addEventListener("change", sync); document.addEventListener("visibilitychange", visibility);
    return () => { media.removeEventListener("change", sync); document.removeEventListener("visibilitychange", visibility); };
  }, []);
  const visible = useMemo(() => entries.filter((entry) => entry.status === "published"), [entries]);
  const loop = reduced || visible.length < 2 ? visible : [...visible, ...visible];
  return <section className="vertical-catalog" aria-labelledby="vertical-catalog-title"><header><div><p className="kicker">XMASKEDFREAKS</p><h2 id="vertical-catalog-title">{t("catalog.title")}</h2></div><span>{t("catalog.updates")}</span></header><div className={`vertical-catalog-viewport ${paused || pausedByAdmin || reduced ? "is-paused" : ""}`} tabIndex={0} aria-label={t("catalog.viewportLabel")} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}><div className="vertical-catalog-track" style={{ "--catalog-speed": `${Math.max(12, speedSeconds)}s` } as React.CSSProperties}>{loop.map((entry, index) => { const destination = safeDestination(entry.destinationUrl); return <article className="vertical-catalog-card" key={`${entry.id}-${index}`} aria-hidden={!reduced && index >= visible.length}><div className="vertical-catalog-image"><Image src={entry.imageUrl} alt="" fill priority={index === 0} sizes="240px" /></div><div><span>{entry.category}</span><h3>{entry.title}</h3><p>{entry.description}</p><small>{entry.displayDate}</small>{destination && entry.actionLabel ? <Link href={destination}>{entry.actionLabel}</Link> : null}</div></article>; })}</div></div></section>;
}
