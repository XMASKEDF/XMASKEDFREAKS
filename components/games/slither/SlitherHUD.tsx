"use client";

import { SlitherSnapshot } from "@/lib/slither/types";
import { leaderboardPosition } from "@/lib/games/leaderboard";
import { useI18n } from "@/components/I18nProvider";
import { formatNumber } from "@/lib/i18n";

type SlitherHUDProps = {
  snapshot: SlitherSnapshot;
  personalBest: number;
  leaderboardScores: number[];
};

export default function SlitherHUD({ snapshot, personalBest, leaderboardScores }: SlitherHUDProps) {
  const { locale, t } = useI18n();
  const globalPosition = leaderboardPosition(snapshot.score, leaderboardScores);
  return (
    <div className="slither-hud" aria-live="polite">
      <span>{t("games.score")} <strong>{formatNumber(snapshot.score, locale)}</strong></span>
      <span>{t("gameUi.length")} <strong>{formatNumber(snapshot.length, locale)}</strong></span>
      <span>{t("gameUi.rank")} <strong>#{formatNumber(snapshot.rank, locale)}</strong></span>
      <span>{t("games.personalHigh")} <strong>{formatNumber(Math.max(personalBest, snapshot.score), locale)}</strong></span>
      <span>{t("gameUi.globalPosition")} <strong>#{formatNumber(globalPosition, locale)}</strong></span>
    </div>
  );
}
