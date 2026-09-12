"use client";

import { useEffect, useState } from "react";
import { clearLocalGameScores } from "@/lib/games/scores";
import { DEFAULT_GAME_TUNING, readGameTuning, saveGameTuning, type GameTuningSettings } from "@/lib/games/settings";

type NumericKey = Exclude<keyof GameTuningSettings, "gamesEnabled">;
const CONTROLS: Array<{ key: NumericKey; label: string; min: number; max: number; step: number; suffix: string }> = [
  { key: "gameVolume", label: "Master game volume", min: 0, max: 0.25, step: 0.01, suffix: "" },
  { key: "powerUpDropChance", label: "MASK INVADERS power-up frequency", min: 0, max: 0.5, step: 0.01, suffix: "" },
  { key: "multiShotSeconds", label: "Multi Shot duration", min: 1, max: 30, step: 1, suffix: " sec" },
  { key: "rapidFireSeconds", label: "Rapid Fire duration", min: 1, max: 30, step: 1, suffix: " sec" },
  { key: "shieldSeconds", label: "Energy Shield duration", min: 1, max: 30, step: 1, suffix: " sec" },
  { key: "fruitSpawnChancePerSecond", label: "Pac-Mask fruit frequency", min: 0, max: 0.2, step: 0.005, suffix: "" },
  { key: "fruitVisibleSeconds", label: "Fruit visibility", min: 2, max: 30, step: 1, suffix: " sec" },
  { key: "powerPelletSeconds", label: "Power pellet duration", min: 2, max: 15, step: 0.5, suffix: " sec" },
  { key: "enemyDifficulty", label: "Enemy difficulty", min: 0.6, max: 2, step: 0.1, suffix: "x" },
  { key: "maskedUpCameraScale", label: "MASKED UP visible map area", min: 1, max: 3, step: 0.1, suffix: "x" }
];

export default function AdminGameTuning() {
  const [settings, setSettings] = useState<GameTuningSettings>(DEFAULT_GAME_TUNING);
  const [savingAvailability, setSavingAvailability] = useState(false);
  const [status, setStatus] = useState("Settings are preserved in this browser until production settings storage is connected.");

  useEffect(() => {
    const localSettings = readGameTuning();
    setSettings(localSettings);
    void fetch("/api/games/settings", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return;
        const result = await response.json() as { settings?: Partial<GameTuningSettings>; persisted?: boolean };
        if (!result.settings) return;
        const normalized = saveGameTuning({ ...localSettings, ...result.settings });
        setSettings(normalized);
        setStatus(result.persisted ? "Shared game controls are connected." : "Using default game controls until production storage is connected.");
      })
      .catch(() => setStatus("Using locally saved controls. Shared game controls could not be reached."));
  }, []);

  function update(key: NumericKey, value: number) { setSettings((current) => ({ ...current, [key]: value })); }
  async function save() {
    const normalized = saveGameTuning(settings);
    setSettings(normalized);
    const response = await fetch("/api/games/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(normalized) });
    setStatus(response.ok
      ? `Saved ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}. Visitor games receive the shared settings automatically.`
      : "Saved in this browser. Shared production storage is not connected yet.");
  }
  async function setGamesAvailability(enabled: boolean) {
    if (!enabled && !window.confirm("Turn off all visitor games? Scores, settings, and assets will be preserved.")) return;
    const previous = settings;
    const next = saveGameTuning({ ...settings, gamesEnabled: enabled });
    setSettings(next);
    setSavingAvailability(true);
    setStatus(`${enabled ? "Turning on" : "Turning off"} visitor games...`);
    const response = await fetch("/api/games/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(next) }).catch(() => null);
    setSavingAvailability(false);
    if (!response?.ok) {
      saveGameTuning(previous);
      setSettings(previous);
      setStatus("Games were not changed because shared production storage could not save the new state.");
      return;
    }
    setStatus(`Games are now ${enabled ? "ON and available to visitors" : "OFF for visitors"}. Existing scores and configuration were preserved.`);
  }
  function resetHighScores() {
    if (!window.confirm("Reset personal high scores saved in this browser?")) return;
    clearLocalGameScores();
    setStatus("Personal high scores saved in this browser were reset.");
  }
  async function resetLeaderboards() {
    if (!window.confirm("Reset the public server leaderboard? This cannot be undone.")) return;
    const response = await fetch("/api/games/scores", { method: "DELETE" });
    setStatus(response.ok ? "The public server leaderboard was reset." : "The server leaderboard could not be reset.");
  }
  async function simulateSecurity(scenario: "game_bot_attack" | "bot_challenge" | "impossible_score" | "replay" | "duplicate_submission") {
    const response = await fetch("/api/admin/games/security-test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenario }) });
    const result = await response.json().catch(() => ({}));
    setStatus(response.ok ? `Simulation complete: ${scenario.replaceAll("_", " ")} test recorded. Game bot detection and challenges remain OFF; anti-cheat remains ON.` : result.error || "Security simulation could not be recorded.");
  }

  return (
    <section className="admin-game-tuning" aria-labelledby="game-tuning-title">
      <header><div><p className="kicker">Todd · Game systems</p><h2 id="game-tuning-title">Gameplay & Feedback</h2></div><span>ADMIN only</span></header>
      <div className={`admin-games-master ${settings.gamesEnabled ? "is-on" : "is-off"}`}>
        <div>
          <span className="admin-games-master-label">Visitor game access</span>
          <strong>{settings.gamesEnabled ? "Games are ON" : "Games are OFF"}</strong>
          <small>{settings.gamesEnabled ? "Visitors can open the arcade and enabled games." : "The arcade is unavailable, while scores and settings remain preserved."}</small>
        </div>
        <div className="admin-games-toggle" role="group" aria-label="Visitor game access">
          <button type="button" className={settings.gamesEnabled ? "active" : ""} aria-pressed={settings.gamesEnabled} disabled={savingAvailability} onClick={() => void setGamesAvailability(true)}>On</button>
          <button type="button" className={!settings.gamesEnabled ? "active" : ""} aria-pressed={!settings.gamesEnabled} disabled={savingAvailability} onClick={() => void setGamesAvailability(false)}>Off</button>
        </div>
      </div>
      <div className="admin-game-tuning-grid">
        {CONTROLS.map((control) => (
          <label key={control.key}>
            <span>{control.label}<strong>{settings[control.key].toFixed(control.step < 0.1 ? 2 : 1)}{control.suffix}</strong></span>
            <input type="range" min={control.min} max={control.max} step={control.step} value={settings[control.key]} onChange={(event) => update(control.key, Number(event.target.value))} />
          </label>
        ))}
      </div>
      <div className="admin-game-rules" aria-label="Player movement and Space Invaders progression rules">
        <article><span>Player Movement Rule</span><strong>+32%</strong><small>Applied to direct player locomotion only. Enemy, projectile, and timer speeds are unchanged.</small></article>
        <article><span>Cursor Responsiveness</span><strong>Frame-sampled</strong><small>Pointer targets are consumed by the fixed game loop with smoothing to avoid event-driven jumps.</small></article>
        <article><span>Space Invaders Player Power</span><strong>×1.64 start · ×0.97 / round</strong><small>Every third completed round applies the additional ×1.08 boost, within engine safety bounds.</small></article>
        <article><span>Space Invaders Enemy Damage</span><strong>+10% / 2 rounds</strong><small>Damage progression is separate from firing cadence, projectile velocity, enemy speed, and enemy health.</small></article>
      </div>
      <div className="admin-game-tuning-actions">
        <button className="primary" type="button" onClick={save}>Save game settings</button>
        <button className="secondary" type="button" onClick={() => { setSettings(DEFAULT_GAME_TUNING); setStatus("Defaults loaded. Save to apply them."); }}>Restore defaults</button>
        <button className="secondary danger" type="button" onClick={resetHighScores}>Reset personal high scores</button>
        <button className="secondary danger" type="button" onClick={resetLeaderboards}>Reset public leaderboard</button>
      </div>
      <div className="admin-game-tuning-actions" aria-label="Security simulations">
        <button className="secondary" type="button" onClick={() => void simulateSecurity("game_bot_attack")}>Simulate game bot attack</button>
        <button className="secondary" type="button" onClick={() => void simulateSecurity("bot_challenge")}>Simulate bot challenge</button>
        <button className="secondary" type="button" onClick={() => void simulateSecurity("impossible_score")}>Simulate impossible score</button>
        <button className="secondary" type="button" onClick={() => void simulateSecurity("replay")}>Simulate replay</button>
        <button className="secondary" type="button" onClick={() => void simulateSecurity("duplicate_submission")}>Simulate duplicate score</button>
      </div>
      <p role="status">{status}</p>
    </section>
  );
}
