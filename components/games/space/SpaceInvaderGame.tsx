"use client";

import { type PointerEvent, useCallback, useEffect, useRef } from "react";
import type { GameRuntimeProps } from "../types";
import { useArcadeInput } from "@/hooks/useArcadeInput";
import { gameAssetManager } from "@/lib/games/assets/asset-manager";
import { drawAssetOrFallback, drawEnvironment } from "@/lib/games/assets/rendering";
import { useGameAssets } from "@/lib/games/assets/use-game-assets";
import type { GameRenderableAsset } from "@/lib/games/assets/types";
import { advanceFixedClock } from "@/lib/games/mechanics";
import { createSpaceState, formatLifeUnits, SPACE_HEIGHT, SPACE_WIDTH, spaceAccuracy, updateSpace, type SpaceEnemy } from "@/lib/games/space-engine";
import { useGameTuning } from "@/hooks/useGameTuning";
import { useGameAudio } from "@/hooks/useGameAudio";
import { useI18n } from "@/components/I18nProvider";
import { getArcadeMovementIntent } from "@/lib/games/input";

function drawShipFallback(context: CanvasRenderingContext2D, x: number, y: number) {
  context.save(); context.translate(x, y); context.shadowColor = "#7dff9b"; context.shadowBlur = 18; context.fillStyle = "#dffff0";
  context.beginPath(); context.moveTo(0, -22); context.lineTo(34, 20); context.lineTo(12, 13); context.lineTo(0, 22); context.lineTo(-12, 13); context.lineTo(-34, 20); context.closePath(); context.fill();
  context.fillStyle = "#0b8f4a"; context.fillRect(-8, 2, 16, 17); context.restore();
}

function drawEnemyFallback(context: CanvasRenderingContext2D, enemy: SpaceEnemy) {
  const colors = ["#ff4f70", "#ff9f4f", "#7b61ff", "#52c7ff", "#7dff9b"];
  const color = enemy.kind === "boss" ? "#ffcf5c" : enemy.kind === "armored" ? "#ff4f70" : colors[enemy.row % colors.length];
  context.save(); context.translate(enemy.x, enemy.y); context.fillStyle = color; context.shadowColor = color; context.shadowBlur = enemy.kind === "boss" ? 24 : 14;
  context.beginPath(); context.moveTo(-22, -10); context.lineTo(-11, -22); context.lineTo(11, -22); context.lineTo(22, -10); context.lineTo(30, 10); context.lineTo(12, 7); context.lineTo(5, 20); context.lineTo(-5, 20); context.lineTo(-12, 7); context.lineTo(-30, 10); context.closePath(); context.fill();
  context.fillStyle = "#030504"; context.fillRect(-12, -7, 7, 7); context.fillRect(5, -7, 7, 7); if (enemy.hitPoints > 1) { context.strokeStyle = "#fff"; context.lineWidth = 2; context.strokeRect(-enemy.width / 2, -enemy.height / 2, enemy.width, enemy.height); } context.restore();
}

export default function SpaceInvaderGame({ paused, muted, restartSignal, onReady, onScoreChange, onLevelChange, onRunEnd, onPhaseChange, onPauseToggle }: GameRuntimeProps) {
  const { t } = useI18n();
  const assetPack = useGameAssets("space-invader-sweep");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imagesRef = useRef<Record<string, GameRenderableAsset | null>>({});
  const stateRef = useRef(createSpaceState());
  const callbacksRef = useRef({ onScoreChange, onLevelChange, onRunEnd, onPhaseChange });
  const lastScoreRef = useRef(0);
  const lastPhaseRef = useRef<string>("");
  const lastLevelRef = useRef(1);
  const submittedRef = useRef(false);
  const pointerTargetRef = useRef<number | null>(null);
  const lastActionRef = useRef("");
  const tuning = useGameTuning();
  const playSound = useGameAudio(muted);
  const { inputRef, focused, activate, clear: clearInput } = useArcadeInput(containerRef, onPauseToggle);

  const sandboxState = useCallback(() => {
    if (typeof window === "undefined" || new URLSearchParams(window.location.search).get("xmfSandbox") !== "1") return createSpaceState();
    const test = new URLSearchParams(window.location.search).get("spaceTest");
    const wave = test === "simulate-129" ? 4 : test === "simulate-214" ? 5 : 1;
    const state = createSpaceState(wave);
    state.phase = "playing";
    state.phaseTimer = 0;
    if (test === "lives-1") state.lifeUnits = 2;
    if (test === "lives-3") state.lifeUnits = 6;
    if (test === "half-life") state.lifeUnits = 7;
    state.lives = Math.floor(state.lifeUnits / 2);
    state.highestLifeUnits = state.lifeUnits;
    if (test === "spawn-heart") state.powerUps = [{ id: "sandbox-heart", kind: "heart", x: state.playerX, y: state.playerY - 30, active: true }];
    if (test === "simulate-29") state.waveElapsed = 29.9;
    if (test === "simulate-129") state.waveElapsed = 89.9;
    if (test === "simulate-214") state.waveElapsed = 134.9;
    if (test === "simulate-missed") state.waveElapsed = state.waveRewardTarget + 0.1;
    if (test?.startsWith("simulate-")) state.enemies.forEach((enemy) => { enemy.alive = false; });
    return state;
  }, []);

  useEffect(() => {
    if (!assetPack) return;
    let active = true;
    Promise.all(assetPack.slots.filter((slot) => slot.kind === "image").map(async (slot) => [slot.id, await gameAssetManager.loadSlot(assetPack, slot.id)] as const)).then((entries) => {
      if (active) imagesRef.current = Object.fromEntries(entries);
    });
    return () => { active = false; };
  }, [assetPack]);
  useEffect(() => { callbacksRef.current = { onScoreChange, onLevelChange, onRunEnd, onPhaseChange }; }, [onLevelChange, onPhaseChange, onRunEnd, onScoreChange]);
  useEffect(() => {
    clearInput();
    stateRef.current = sandboxState(); lastScoreRef.current = 0; lastPhaseRef.current = "countdown"; lastLevelRef.current = 1; submittedRef.current = false;
    pointerTargetRef.current = null;
    onScoreChange(0); onLevelChange(1); onPhaseChange("countdown"); activate();
  }, [activate, clearInput, onLevelChange, onPhaseChange, onScoreChange, restartSignal, sandboxState]);
  useEffect(() => { if (paused) clearInput(); }, [clearInput, paused]);
  useEffect(() => { onReady(); }, [onReady]);

  useEffect(() => {
    let frame = 0;
    const clock = { previousSeconds: performance.now() / 1000, accumulator: 0 };
    function loop(nowMs: number) {
      const now = nowMs / 1000;
      const state = stateRef.current;
      if (!paused) {
        advanceFixedClock(clock, now, (step) => {
          const keys = inputRef.current.keys;
          const intent = getArcadeMovementIntent(keys);
          updateSpace(state, {
            left: intent.horizontal === -1,
            right: intent.horizontal === 1,
            fire: keys.has(" ") || inputRef.current.pointerDown
          }, step, Math.random, tuning);
          if (pointerTargetRef.current !== null && state.phase === "playing") {
            state.playerX += (pointerTargetRef.current - state.playerX) * Math.min(1, step * 22);
            state.playerX = Math.max(38, Math.min(SPACE_WIDTH - 38, state.playerX));
          }
        });
      } else {
        clock.previousSeconds = now;
        clock.accumulator = 0;
      }
      if (state.score !== lastScoreRef.current) { lastScoreRef.current = state.score; callbacksRef.current.onScoreChange(state.score); playSound("collect"); }
      if (state.wave !== lastLevelRef.current) { lastLevelRef.current = state.wave; callbacksRef.current.onLevelChange(state.wave); }
      if (state.lastActionEvent && state.lastActionEvent !== lastActionRef.current) {
        lastActionRef.current = state.lastActionEvent;
        playSound(state.lastActionEvent.startsWith("player-hit") ? "hit" : state.lastActionEvent.startsWith("shield-block") ? "shield" : state.lastActionEvent.startsWith("extraLife") || state.lastActionEvent.startsWith("heart") || state.lastActionEvent.startsWith("speed-life") ? "life" : "power");
      }
      const phase = paused ? "paused" : state.phase === "gameOver" ? "game-over" : state.phase === "levelComplete" ? "level-complete" : state.phase === "countdown" ? "countdown" : "running";
      if (phase !== lastPhaseRef.current) {
        lastPhaseRef.current = phase;
        callbacksRef.current.onPhaseChange(phase);
        if (phase === "level-complete") playSound("level");
      }
      if (state.phase === "gameOver" && !submittedRef.current) {
        submittedRef.current = true;
        playSound("gameover");
        callbacksRef.current.onRunEnd(state.score, Math.round(state.elapsed), { completed: true, wave: state.wave, enemiesDestroyed: state.enemiesDestroyed, livesRemaining: state.lives, lifeUnits: state.lifeUnits, effectiveLives: Number((state.lifeUnits / 2).toFixed(1)), speedLifeBonuses: state.speedLifeBonuses, heartPickups: state.heartPickups, highestLifeUnits: state.highestLifeUnits, bestWaveClearTime: state.bestWaveClearTime === null ? 0 : Number(state.bestWaveClearTime.toFixed(2)), accuracy: spaceAccuracy(state), playerPower: Number(state.playerPower.toFixed(4)), enemyDamagePower: Number(state.enemyDamagePower.toFixed(4)) });
      }

      const context = canvasRef.current?.getContext("2d");
      if (context) {
        if (process.env.NODE_ENV !== "production") {
          context.canvas.dataset.phase = phase;
          context.canvas.dataset.score = String(state.score);
          context.canvas.dataset.playerX = String(Math.round(state.playerX));
          context.canvas.dataset.enemies = String(state.enemies.filter((enemy) => enemy.alive).length);
          context.canvas.dataset.shots = String(state.shots.length);
        }
        const environment = assetPack?.environments.find((item) => item.id === assetPack.activeEnvironment) || assetPack?.environments[0];
        if (environment) drawEnvironment(context, SPACE_WIDTH, SPACE_HEIGHT, environment, now, imagesRef.current["background-primary"]);
        else { context.fillStyle = "#020504"; context.fillRect(0, 0, SPACE_WIDTH, SPACE_HEIGHT); }
        state.enemies.forEach((enemy) => {
          if (!enemy.alive) return;
          const enemyAsset = imagesRef.current[enemy.kind === "boss" || enemy.kind === "armored" ? "enemy-raider" : enemy.row < 3 ? "enemy-striker" : "enemy-scout"];
          drawAssetOrFallback(context, enemyAsset, enemy.x, enemy.y + Math.sin(nowMs / 210 + enemy.x * 0.02) * 2.4, 58, 52, 0, () => drawEnemyFallback(context, enemy));
        });
        [250, 480, 710].forEach((x, index) => {
          const shieldAsset = imagesRef.current.shield;
          if (shieldAsset) { context.globalAlpha = 0.7; context.drawImage(shieldAsset, x - 50, 405, 100, 45); context.globalAlpha = 1; }
          state.shieldCells.filter((cell) => cell.id.startsWith(`shield-${index}`) && !cell.alive).forEach((cell) => { context.fillStyle = "#020504"; context.fillRect(cell.x - 1, cell.y - 1, cell.size + 2, cell.size + 2); });
          if (!shieldAsset) state.shieldCells.filter((cell) => cell.id.startsWith(`shield-${index}`) && cell.alive).forEach((cell) => { context.fillStyle = "rgba(125,255,155,.72)"; context.fillRect(cell.x, cell.y, cell.size - 1, cell.size - 1); });
        });
        state.shots.forEach((shot) => {
          const projectile = imagesRef.current[shot.enemy ? "projectile-enemy" : "projectile-player"];
          if (projectile) context.drawImage(projectile, shot.x - 6, shot.y - 12, 12, 24);
          else { context.fillStyle = shot.enemy ? "#ff4f70" : "#52c7ff"; context.fillRect(shot.x - 3, shot.y - 9, 6, 18); }
        });
        state.explosions.forEach((explosion) => {
          const progress = explosion.age / 0.5; const size = 32 + progress * 62; context.globalAlpha = 1 - progress;
          drawAssetOrFallback(context, imagesRef.current.explosion, explosion.x, explosion.y, size, size, progress * 0.4, () => { context.fillStyle = "#ffad4f"; context.beginPath(); context.arc(explosion.x, explosion.y, size * 0.32, 0, Math.PI * 2); context.fill(); }); context.globalAlpha = 1;
        });
        state.powerUps.forEach((powerUp) => {
          const colors = { multiShot: "#b05cff", rapidFire: "#52c7ff", energyShield: "#7dff9b", extraLife: "#ff4f70", heart: "#ff4f70", spreadShot: "#ff9f4f", damageBoost: "#ff5ce1", scoreMultiplier: "#ffe45c", freeze: "#8cdcff", invincibility: "#fff", magnet: "#c68cff", piercing: "#ffcf5c", drone: "#70ffcf" };
          context.fillStyle = colors[powerUp.kind]; context.shadowColor = colors[powerUp.kind]; context.shadowBlur = 18;
          context.beginPath(); context.arc(powerUp.x, powerUp.y, 13, 0, Math.PI * 2); context.fill(); context.shadowBlur = 0;
          context.fillStyle = "#041008"; context.font = "900 11px Arial"; context.textAlign = "center";
          const labels = { multiShot: "3X", rapidFire: "RF", energyShield: "S", extraLife: "+1", heart: "♥", spreadShot: "SP", damageBoost: "DMG", scoreMultiplier: "2X", freeze: "ICE", invincibility: "I", magnet: "M", piercing: "P", drone: "D" };
          context.fillText(labels[powerUp.kind], powerUp.x, powerUp.y + 4); context.textAlign = "start";
        });
        if (state.activePowerUps.energyShield > 0) {
          context.strokeStyle = `rgba(125,255,155,${Math.min(0.85, 0.3 + state.activePowerUps.energyShield / tuning.shieldSeconds * 0.5)})`;
          context.lineWidth = 4; context.shadowColor = "#7dff9b"; context.shadowBlur = 16; context.beginPath(); context.arc(state.playerX, state.playerY, 43, 0, Math.PI * 2); context.stroke(); context.shadowBlur = 0;
        }
        if (state.playerInvulnerable <= 0 || Math.floor(state.playerInvulnerable * 12) % 2 === 0) drawAssetOrFallback(context, imagesRef.current["player-ship"], state.playerX, state.playerY, 82, 64, 0, () => drawShipFallback(context, state.playerX, state.playerY));
        context.fillStyle = "#f7f0ea"; context.font = "700 18px Arial"; context.fillText(`LIVES ${formatLifeUnits(state.lifeUnits)}`, 24, 32); context.fillText(`WAVE ${state.wave}`, 840, 32);
        const active = Object.entries(state.activePowerUps).filter(([, seconds]) => seconds > 0).map(([name, seconds]) => `${name.replace(/[A-Z]/g, (letter) => ` ${letter}`).toUpperCase()} ${Math.ceil(seconds)}s`).join("  ·  ");
        if (active) { context.fillStyle = "#7dff9b"; context.font = "800 14px Arial"; context.textAlign = "center"; context.fillText(active, SPACE_WIDTH / 2, 30); context.textAlign = "start"; }
        if (state.waveSummary && state.waveSummarySeconds > 0) {
          const summary = state.waveSummary;
          const rewardLabel = summary.reward === "full" ? "+1 LIFE" : summary.reward === "half" ? "+½ LIFE" : "NO LIFE BONUS";
          context.fillStyle = "rgba(0,0,0,.78)"; context.fillRect(SPACE_WIDTH / 2 - 190, 58, 380, 72);
          context.fillStyle = summary.reward === "none" ? "#ffcf5c" : "#7dff9b"; context.font = "800 16px Arial"; context.textAlign = "center";
          context.fillText(`${summary.classification} · ${rewardLabel}`, SPACE_WIDTH / 2, 82);
          context.fillStyle = "#f7f0ea"; context.font = "600 13px Arial"; context.fillText(`TIME ${summary.clearTime.toFixed(1)}s · TARGET ${summary.targetSeconds}s`, SPACE_WIDTH / 2, 105);
          context.textAlign = "start";
        }
        if (process.env.NODE_ENV !== "production" && new URLSearchParams(window.location.search).has("debugCollisions")) {
          context.strokeStyle = "#7dff9b"; context.lineWidth = 1;
          state.enemies.filter((enemy) => enemy.alive).forEach((enemy) => context.strokeRect(enemy.x - enemy.width / 2 + 4, enemy.y - enemy.height / 2 + 4, enemy.width - 8, enemy.height - 8));
          state.shots.forEach((shot) => context.strokeRect(shot.x - 3, shot.y - 9, 6, 18));
        }
        const overlay = paused ? "PAUSED" : state.phase === "gameOver" ? "GAME OVER" : state.phase === "countdown" ? "READY" : state.phase === "levelComplete" ? "WAVE CLEAR" : "";
        if (overlay) { context.fillStyle = "rgba(0,0,0,.68)"; context.fillRect(0, 0, SPACE_WIDTH, SPACE_HEIGHT); context.fillStyle = "#7dff9b"; context.font = "800 42px Arial"; context.textAlign = "center"; context.fillText(overlay, SPACE_WIDTH / 2, SPACE_HEIGHT / 2); context.textAlign = "start"; }
      }
      frame = requestAnimationFrame(loop);
    }
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [assetPack, inputRef, paused, playSound, restartSignal, tuning]);

  function movePlayer(event: PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    pointerTargetRef.current = Math.max(38, Math.min(SPACE_WIDTH - 38, ((event.clientX - rect.left) / rect.width) * SPACE_WIDTH));
  }
  const holdKey = (key: "arrowleft" | "arrowright" | " ", down: boolean) => down ? inputRef.current.keys.add(key) : inputRef.current.keys.delete(key);
  const releaseKey = (key: "arrowleft" | "arrowright" | " ") => inputRef.current.keys.delete(key);

  return (
    <div className="large-arcade-runtime game-focus-region" ref={containerRef} tabIndex={0} aria-label={t("gameUi.spaceControls")}>
      <canvas ref={canvasRef} width={SPACE_WIDTH} height={SPACE_HEIGHT} className="large-game-canvas wide" onPointerDown={movePlayer} onPointerMove={movePlayer} aria-label={t("gameUi.spaceArea")} />
      <div className="mobile-arcade-controls" aria-label={t("gameUi.touchControls")}>
        <button type="button" onPointerDown={() => holdKey("arrowleft", true)} onPointerUp={() => releaseKey("arrowleft")} onPointerCancel={() => releaseKey("arrowleft")} onPointerLeave={() => releaseKey("arrowleft")}>{t("gameUi.left")}</button>
        <button type="button" onPointerDown={() => holdKey(" ", true)} onPointerUp={() => releaseKey(" ")} onPointerCancel={() => releaseKey(" ")} onPointerLeave={() => releaseKey(" ")}>{t("gameUi.fire")}</button>
        <button type="button" onPointerDown={() => holdKey("arrowright", true)} onPointerUp={() => releaseKey("arrowright")} onPointerCancel={() => releaseKey("arrowright")} onPointerLeave={() => releaseKey("arrowright")}>{t("gameUi.right")}</button>
      </div>
      <p className="game-runtime-instructions">{t("gameUi.spaceInstructions")}</p>
      {!focused ? <button className="game-focus-prompt" type="button" onClick={activate}>{t("gameUi.activate")}</button> : null}
    </div>
  );
}
