"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import { formatNumber } from "@/lib/i18n";
import type { GameItem } from "@/lib/config";
import { personalBestFor } from "@/lib/games/scores";

type GameCardProps = {
  game: GameItem;
  personalBest: number;
  globalBest: number;
};

export default function GameCard({ game, personalBest, globalBest }: GameCardProps) {
  const { locale, t } = useI18n();
  const fallback = `/games/thumbnails/${game.slug}.svg`;
  const [source, setSource] = useState(game.thumbnail || fallback);
  const [savedPersonalBest, setSavedPersonalBest] = useState(personalBest);
  const usesComposite = source === "/games/thumbnails/xmaskedfreaks-game-library.png" && Boolean(game.thumbnailRegion);
  const regionIndex = game.thumbnailRegion === "middle" ? 1 : game.thumbnailRegion === "bottom" ? 2 : 0;

  useEffect(() => {
    setSavedPersonalBest(Math.max(personalBest, personalBestFor(game.id)));
  }, [game.id, personalBest]);

  return (
    <article className={`game-launch-card games-route-card ${usesComposite ? "uses-composite-thumbnail" : ""} ${game.featured ? "is-featured" : ""}`}>
      <Link className="game-thumbnail-link" href={`/games/${game.slug}/play`} aria-label={t("games.playNamed", { game: game.title })}>
      <div className={`game-card-thumbnail ${usesComposite ? `is-composite-row is-${game.thumbnailRegion}` : ""}`}>
        {usesComposite ? <Image
          src={source}
          alt={game.thumbnailAlt}
          width={1672}
          height={941}
          sizes="(max-width: 1500px) 100vw, 1500px"
          loading="lazy"
          className="composite-row-image"
          style={{ position: "absolute", width: "100%", height: "300%", left: 0, top: `${regionIndex * -100}%` }}
          onError={() => setSource(fallback)}
        /> : <Image
          src={source}
          alt={game.thumbnailAlt}
          fill
          sizes="(max-width: 720px) 100vw, (max-width: 1180px) 50vw, 33vw"
          loading="lazy"
          onError={() => setSource(fallback)}
        />}
        {usesComposite ? <div className="composite-title-panel"><strong>{game.title}</strong><em>{game.description}</em><span>{game.category || "Arcade"} · {game.difficulty || "Medium"}</span></div> : null}
        {game.featured ? <span className="game-featured-badge">{t("games.featured")}</span> : null}
      </div>
      </Link>
      {!usesComposite ? <><span>{game.category || "Arcade"} · {game.difficulty || "Medium"}</span><strong>{game.title}</strong><em>{game.description || "Fast lightweight browser gameplay built into XMASKEDFREAKS."}</em></> : null}
      <div className="game-card-scores">
        <small>{t("games.personalHigh", { score: "" }).trim()} <b>{formatNumber(savedPersonalBest, locale)}</b></small>
        <small>{t("games.publicHigh", { score: "" }).trim()} <b>{formatNumber(globalBest, locale)}</b></small>
      </div>
      <Link className="primary games-play-link" href={`/games/${game.slug}/play`}>{t("games.play")}</Link>
    </article>
  );
}
