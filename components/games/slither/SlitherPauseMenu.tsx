"use client";
import { useI18n } from "@/components/I18nProvider";

type SlitherPauseMenuProps = {
  onResume: () => void;
  onRestart: () => void;
};

export default function SlitherPauseMenu({ onResume, onRestart }: SlitherPauseMenuProps) {
  const { t } = useI18n();
  return (
    <div className="slither-overlay" role="dialog" aria-label={t("gameUi.pausedLabel")}>
      <strong>{t("games.pause")}</strong>
      <span>{t("gameUi.pausedCopy")}</span>
      <button className="primary" type="button" onClick={onResume}>{t("games.resume")}</button>
      <button className="secondary" type="button" onClick={onRestart}>{t("games.restart")}</button>
    </div>
  );
}
