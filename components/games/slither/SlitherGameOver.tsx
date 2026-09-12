"use client";
import { useI18n } from "@/components/I18nProvider";
import { formatNumber } from "@/lib/i18n";

type SlitherGameOverProps = {
  score: number;
  message: string;
  onRestart: () => void;
};

export default function SlitherGameOver({ score, message, onRestart }: SlitherGameOverProps) {
  const { locale, t } = useI18n();
  return (
    <div className="slither-overlay" role="status">
      <strong>{t("gameUi.runComplete")}</strong>
      <span>{message}</span>
      <span>{t("gameUi.finalScore", { score: formatNumber(score, locale) })}</span>
      <button className="primary" type="button" onClick={onRestart}>{t("gameUi.playAgain")}</button>
    </div>
  );
}
