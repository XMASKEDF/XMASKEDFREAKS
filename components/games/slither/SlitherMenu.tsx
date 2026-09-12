"use client";

import { FormEvent, useState } from "react";
import { DEFAULT_SETTINGS } from "@/lib/slither/constants";
import { SlitherSettings, SnakePalette, SnakePaletteId } from "@/lib/slither/types";
import { useI18n } from "@/components/I18nProvider";

type SlitherMenuProps = {
  displayName: string;
  palettes: SnakePalette[];
  onStart: (name: string, palette: SnakePaletteId, settings: SlitherSettings) => void;
};

export default function SlitherMenu({ displayName, palettes, onStart }: SlitherMenuProps) {
  const { t } = useI18n();
  const [name, setName] = useState(displayName || "Player");
  const [palette, setPalette] = useState<SnakePaletteId>("xmf-green");
  const [settings, setSettings] = useState<SlitherSettings>(DEFAULT_SETTINGS);
  const [showHowTo, setShowHowTo] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onStart(name, palette, settings);
  }

  return (
    <form className="slither-start" onSubmit={submit}>
      <div>
        <strong>MASKED UP</strong>
        <span>{t("gameUi.slitherSubtitle")}</span>
      </div>
      <p>{t("gameUi.slitherCopy")}</p>
      <label>
        {t("gameUi.player")}
        <input
          value={name}
          maxLength={18}
          onChange={(event) => setName(event.target.value)}
          aria-label={t("gameUi.playerName")}
        />
      </label>
      <label>
        {t("gameUi.creatureColor")}
        <select value={palette} onChange={(event) => setPalette(event.target.value as SnakePaletteId)}>
          {palettes.map((item) => (
            <option value={item.id} key={item.id}>{item.label}</option>
          ))}
        </select>
      </label>
      <div className="slither-settings">
        <label><input type="checkbox" checked={settings.sound} onChange={(event) => setSettings((current) => ({ ...current, sound: event.target.checked }))} /> {t("gameUi.sound")}</label>
        <label><input type="checkbox" checked={settings.reducedGlow} onChange={(event) => setSettings((current) => ({ ...current, reducedGlow: event.target.checked }))} /> {t("gameUi.reducedGlow")}</label>
      </div>
      <div className="slither-actions">
        <button className="primary" type="submit">{t("gameUi.enterArena")}</button>
        <button className="secondary" type="button" onClick={() => setShowHowTo((value) => !value)}>{t("gameUi.howTo")}</button>
      </div>
      {showHowTo ? (
        <p>{t("gameUi.howToCopy")}</p>
      ) : null}
    </form>
  );
}
