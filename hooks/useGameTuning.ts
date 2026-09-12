"use client";

import { useEffect, useState } from "react";
import { DEFAULT_GAME_TUNING, GAME_SETTINGS_EVENT, readGameTuning, type GameTuningSettings } from "@/lib/games/settings";

let remoteSettingsPromise: Promise<GameTuningSettings | null> | null = null;

function loadRemoteSettings() {
  if (!remoteSettingsPromise) {
    remoteSettingsPromise = fetch("/api/games/settings")
      .then((response) => response.json())
      .then((data: { settings?: GameTuningSettings }) => data.settings || null)
      .catch(() => null)
      .finally(() => { window.setTimeout(() => { remoteSettingsPromise = null; }, 1000); });
  }
  return remoteSettingsPromise;
}

export function useGameTuning() {
  const [settings, setSettings] = useState<GameTuningSettings>(DEFAULT_GAME_TUNING);

  useEffect(() => {
    setSettings(readGameTuning());
    loadRemoteSettings()
      .then((remote) => {
        if (!remote) return;
        localStorage.setItem("xmf-game-tuning", JSON.stringify(remote));
        setSettings(remote);
      })
      .catch(() => undefined);
    const update = (event: Event) => setSettings((event as CustomEvent<GameTuningSettings>).detail || readGameTuning());
    const sync = () => setSettings(readGameTuning());
    window.addEventListener(GAME_SETTINGS_EVENT, update);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(GAME_SETTINGS_EVENT, update);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return settings;
}
