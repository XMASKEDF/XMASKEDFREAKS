"use client";

import { SlitherScoreEntry } from "@/lib/slither/types";
import { mergeLeaderboardScores } from "@/lib/slither/leaderboard";
import { useI18n } from "@/components/I18nProvider";

type SlitherLeaderboardProps = {
  scores: SlitherScoreEntry[];
  personalBest?: number;
  publicBest?: number;
};

export default function SlitherLeaderboard({ scores, personalBest = 0, publicBest = 0 }: SlitherLeaderboardProps) {
  const { t } = useI18n();
  const mergedScores = mergeLeaderboardScores(scores, personalBest, publicBest);
  return (
    <div className="slither-leaderboard" aria-label={t("gameUi.leaderboard")}>
      <strong>{t("gameUi.localBoard")}</strong>
      {mergedScores.length ? mergedScores.slice(0, 3).map((entry) => (
        <span key={`${entry.name}-${entry.score}`}>{entry.name}: {entry.score}</span>
      )) : <span>{t("gameUi.noRuns")}</span>}
    </div>
  );
}
