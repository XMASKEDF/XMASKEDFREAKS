"use client";

import { type PointerEvent, useEffect, useRef } from "react";
import type { GameRuntimeProps } from "../types";
import { useArcadeInput } from "@/hooks/useArcadeInput";
import { gameAssetManager } from "@/lib/games/assets/asset-manager";
import { drawAssetOrFallback, drawEnvironment } from "@/lib/games/assets/rendering";
import { useGameAssets } from "@/lib/games/assets/use-game-assets";
import type { GameRenderableAsset } from "@/lib/games/assets/types";
import { advanceFixedClock } from "@/lib/games/mechanics";
import {
  createPacMaskState,
  PAC_HEIGHT,
  PAC_MAZE,
  PAC_TILE,
  PAC_WIDTH,
  pacCellAt,
  pacDebugSnapshot,
  requestPacDirection,
  updatePacMask,
  type PacDirectionName,
  type PacGhost
} from "@/lib/games/pacmask-engine";
import { useGameTuning } from "@/hooks/useGameTuning";
import { useGameAudio } from "@/hooks/useGameAudio";
import { useI18n } from "@/components/I18nProvider";
import { getArcadeMovementIntent } from "@/lib/games/input";

function drawGhostFallback(context: CanvasRenderingContext2D, ghost: PacGhost, frightenedFlash = false) {
  context.save(); context.translate(ghost.x, ghost.y);
  if (ghost.mode === "EATEN") {
    context.fillStyle = "#fff"; context.beginPath(); context.arc(-5, -2, 5, 0, Math.PI * 2); context.arc(5, -2, 5, 0, Math.PI * 2); context.fill();
    context.fillStyle = "#247cff"; context.beginPath(); context.arc(-4, -2, 2.3, 0, Math.PI * 2); context.arc(6, -2, 2.3, 0, Math.PI * 2); context.fill(); context.restore(); return;
  }
  context.fillStyle = ghost.mode === "FRIGHTENED" ? (frightenedFlash ? "#f7f0ea" : "#516cff") : ghost.color;
  context.shadowColor = context.fillStyle; context.shadowBlur = 12;
  context.beginPath(); context.arc(0, -2, 14, Math.PI, 0); context.lineTo(14, 15); context.lineTo(7, 10); context.lineTo(0, 15); context.lineTo(-7, 10); context.lineTo(-14, 15); context.closePath(); context.fill();
  context.shadowBlur = 0; context.fillStyle = "#fff"; context.beginPath(); context.arc(-5, -3, 4, 0, Math.PI * 2); context.arc(5, -3, 4, 0, Math.PI * 2); context.fill();
  context.fillStyle = "#050505"; context.beginPath(); context.arc(-4, -2, 2, 0, Math.PI * 2); context.arc(6, -2, 2, 0, Math.PI * 2); context.fill(); context.restore();
}

export default function PacMaskGame({ paused, muted, restartSignal, onReady, onScoreChange, onLevelChange, onRunEnd, onPhaseChange, onPauseToggle }: GameRuntimeProps) {
  const { t } = useI18n();
  const assetPack = useGameAssets("pac-mask-chase");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imagesRef = useRef<Record<string, GameRenderableAsset | null>>({});
  const stateRef = useRef(createPacMaskState());
  const callbacksRef = useRef({ onScoreChange, onLevelChange, onRunEnd, onPhaseChange });
  const swipeRef = useRef<{ x: number; y: number } | null>(null);
  const lastScoreRef = useRef(0);
  const lastPhaseRef = useRef<string>("");
  const lastLevelRef = useRef(1);
  const submittedRef = useRef(false);
  const lastEventRef = useRef("");
  const lastAudioEventRef = useRef("");
  const tuning = useGameTuning();
  const playSound = useGameAudio(muted);
  const { inputRef, focused, activate, clear: clearInput } = useArcadeInput(containerRef, onPauseToggle);

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
    stateRef.current = createPacMaskState();
    lastScoreRef.current = 0;
    lastPhaseRef.current = "countdown";
    lastLevelRef.current = 1;
    submittedRef.current = false;
    onScoreChange(0);
    onLevelChange(1);
    onPhaseChange("countdown");
    activate();
  }, [activate, clearInput, onLevelChange, onPhaseChange, onScoreChange, restartSignal]);
  useEffect(() => { if (paused) clearInput(); }, [clearInput, paused]);
  useEffect(() => { onReady(); }, [onReady]);

  useEffect(() => {
    let frame = 0;
    const clock = { previousSeconds: performance.now() / 1000, accumulator: 0 };
    function loop(nowMs: number) {
      const state = stateRef.current;
      const now = nowMs / 1000;
      if (!paused) {
        advanceFixedClock(clock, now, (step) => {
          const held = inputRef.current.keys;
          const intent = getArcadeMovementIntent(held);
          // Pac-Mask is intentionally grid-based, so a diagonal intent resolves
          // to one legal maze direction instead of changing its movement model.
          if (intent.vertical === -1) requestPacDirection(state, "up");
          else if (intent.vertical === 1) requestPacDirection(state, "down");
          else if (intent.horizontal === -1) requestPacDirection(state, "left");
          else if (intent.horizontal === 1) requestPacDirection(state, "right");
          updatePacMask(state, step, tuning);
        });
      } else {
        clock.previousSeconds = now;
        clock.accumulator = 0;
      }

      if (state.score !== lastScoreRef.current) {
        lastScoreRef.current = state.score;
        callbacksRef.current.onScoreChange(state.score);
      }
      if (state.level !== lastLevelRef.current) { lastLevelRef.current = state.level; callbacksRef.current.onLevelChange(state.level); }
      if (state.lastScoreEvent && state.lastScoreEvent !== lastEventRef.current) {
        lastEventRef.current = state.lastScoreEvent;
        if (state.lastScoreEvent.startsWith("pellet") || state.lastScoreEvent.startsWith("fruit")) playSound("collect");
      }
      if (state.lastAudioEvent && state.lastAudioEvent !== lastAudioEventRef.current) {
        lastAudioEventRef.current = state.lastAudioEvent;
        if (state.lastAudioEvent.startsWith("player-death")) playSound("hit");
        else if (state.lastAudioEvent.startsWith("power-start")) playSound("power");
        else if (state.lastAudioEvent.startsWith("power-warning")) playSound("shield");
        else if (state.lastAudioEvent.startsWith("ghost-eaten")) playSound("life");
        else if (state.lastAudioEvent.startsWith("ghost-returned") || state.lastAudioEvent.startsWith("ghost-respawn")) playSound("click");
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
        callbacksRef.current.onRunEnd(state.score, Math.round(state.elapsed), {
          completed: true, level: state.level, pelletsEaten: state.pelletsEaten, ghostsEaten: state.ghostsEaten, livesRemaining: state.lives
        });
      }

      const context = canvasRef.current?.getContext("2d");
      if (context) {
        if (process.env.NODE_ENV !== "production") {
          context.canvas.dataset.phase = phase;
          context.canvas.dataset.score = String(state.score);
          context.canvas.dataset.playerCell = JSON.stringify(pacCellAt(state.player.x, state.player.y));
          context.canvas.dataset.pellets = String(state.pellets.size + state.powerPellets.size);
          context.canvas.dataset.ghostStates = state.ghosts.map((ghost) => `${ghost.id}:${ghost.mode}`).join(",");
        }
        const environment = assetPack?.environments.find((item) => item.id === assetPack.activeEnvironment) || assetPack?.environments[0];
        if (environment) drawEnvironment(context, PAC_WIDTH, PAC_HEIGHT, environment, now, imagesRef.current["background-primary"]);
        else { context.fillStyle = "#030304"; context.fillRect(0, 0, PAC_WIDTH, PAC_HEIGHT); }
        context.strokeStyle = "#7057ff"; context.lineWidth = 4; context.shadowColor = "#7057ff"; context.shadowBlur = 8;
        PAC_MAZE.forEach((line, row) => [...line].forEach((cell, column) => {
          if (cell !== "#") return;
          const wall = imagesRef.current["maze-wall"];
          if (wall) context.drawImage(wall, column * PAC_TILE + 2, row * PAC_TILE + 2, PAC_TILE - 4, PAC_TILE - 4);
          else context.strokeRect(column * PAC_TILE + 3, row * PAC_TILE + 3, PAC_TILE - 6, PAC_TILE - 6);
        }));
        context.shadowBlur = 0;
        const drawPellet = (key: string, power: boolean) => {
          const [column, row] = key.split(":").map(Number);
          const pellet = power ? imagesRef.current["pellet-power"] : null;
          const pulse = power ? 1 + Math.sin(nowMs / 145 + column + row) * 0.12 : 1;
          if (pellet) {
            const size = 18 * pulse;
            context.drawImage(pellet, (column + 0.5) * PAC_TILE - size / 2, (row + 0.5) * PAC_TILE - size / 2, size, size);
          } else {
            context.fillStyle = power ? "#7dff9b" : "#e4b45d";
            context.shadowColor = context.fillStyle;
            context.shadowBlur = power ? 16 : 6;
            context.beginPath();
            context.arc((column + 0.5) * PAC_TILE, (row + 0.5) * PAC_TILE, (power ? 7 : 3) * pulse, 0, Math.PI * 2);
            context.fill();
          }
        };
        state.pellets.forEach((key) => drawPellet(key, false));
        state.powerPellets.forEach((key) => drawPellet(key, true));
        if (state.fruit) {
          const fruitColors = { cherry: "#ff365e", strawberry: "#ff527a", orange: "#ff9f43", apple: "#9cff57", melon: "#66ffd1" };
          context.fillStyle = fruitColors[state.fruit.kind]; context.shadowColor = context.fillStyle; context.shadowBlur = 16;
          context.beginPath(); context.arc(state.fruit.x, state.fruit.y, 12 + Math.sin(nowMs / 120) * 1.5, 0, Math.PI * 2); context.fill();
          context.strokeStyle = "#7dff9b"; context.lineWidth = 3; context.beginPath(); context.moveTo(state.fruit.x, state.fruit.y - 10); context.quadraticCurveTo(state.fruit.x + 6, state.fruit.y - 20, state.fruit.x + 11, state.fruit.y - 15); context.stroke(); context.shadowBlur = 0;
        }
        const vectors: Record<PacDirectionName, { x: number; y: number }> = { left: { x: -1, y: 0 }, right: { x: 1, y: 0 }, up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, none: { x: 1, y: 0 } };
        const vector = vectors[state.player.direction];
        const angle = Math.atan2(vector.y, vector.x); const mouth = 0.3 + Math.abs(Math.sin(nowMs / 95)) * 0.25;
        drawAssetOrFallback(context, imagesRef.current["player-mask"], state.player.x, state.player.y, 35, 42, angle + Math.PI / 2, () => { context.fillStyle = "#e4b45d"; context.beginPath(); context.moveTo(state.player.x, state.player.y); context.arc(state.player.x, state.player.y, 15, angle + mouth, angle + Math.PI * 2 - mouth); context.closePath(); context.fill(); });
        state.ghosts.forEach((ghost, index) => {
          const slots = ["enemy-ghost-red", "enemy-ghost-blue", "enemy-ghost-orange", "enemy-ghost-red"];
          const eyesOnly = ghost.mode === "EATEN";
          const frightenedFlash = ghost.mode === "FRIGHTENED"
            && state.frightenedRemaining <= 2
            && Math.floor(state.frightenedRemaining * 8) % 2 === 0;
          if (eyesOnly || ghost.mode === "FRIGHTENED") {
            drawGhostFallback(context, ghost, frightenedFlash);
          } else {
            context.save();
            if (ghost.mode === "RESPAWNING") context.globalAlpha = 0.55 + Math.sin(nowMs / 90) * 0.2;
            drawAssetOrFallback(context, imagesRef.current[slots[index]], ghost.x, ghost.y + Math.sin(nowMs / 170 + index) * 2, 34, 42, 0, () => drawGhostFallback(context, ghost));
            context.restore();
          }
        });
        state.scorePopups.forEach((popup) => {
          context.save();
          context.globalAlpha = Math.min(1, popup.remaining * 2);
          context.fillStyle = "#fff46d";
          context.shadowColor = "#7dff9b";
          context.shadowBlur = 10;
          context.font = "900 20px Arial";
          context.textAlign = "center";
          context.fillText(String(popup.points), popup.x, popup.y);
          context.restore();
        });
        context.shadowBlur = 0; context.fillStyle = "#f7f0ea"; context.font = "700 16px Arial";
        context.fillText(`LIVES ${state.lives}`, 16, 25); context.fillText(`LEVEL ${state.level}`, PAC_WIDTH - 95, 25);
        if (state.frightenedRemaining > 0) { context.fillStyle = "#52c7ff"; context.textAlign = "center"; context.fillText(`POWER ${state.frightenedRemaining.toFixed(1)}s · COMBO x${state.ghostChain}`, PAC_WIDTH / 2, 25); context.textAlign = "start"; }
        if (state.notification) { context.fillStyle = "#7dff9b"; context.font = "900 22px Arial"; context.textAlign = "center"; context.fillText(state.notification, PAC_WIDTH / 2, PAC_HEIGHT - 22); context.textAlign = "start"; }
        const debugParams = process.env.NODE_ENV !== "production" ? new URLSearchParams(window.location.search) : null;
        if (debugParams?.has("debugCollisions")) {
          context.strokeStyle = "#7dff9b"; context.lineWidth = 1; context.beginPath(); context.arc(state.player.x, state.player.y, 11, 0, Math.PI * 2); context.stroke();
          state.ghosts.forEach((ghost) => { context.beginPath(); context.arc(ghost.x, ghost.y, 12, 0, Math.PI * 2); context.stroke(); });
          const cell = pacCellAt(state.player.x, state.player.y); context.strokeRect(cell.column * PAC_TILE, cell.row * PAC_TILE, PAC_TILE, PAC_TILE);
        }
        if (debugParams?.has("debugPacAi")) {
          const debug = pacDebugSnapshot(state);
          context.save();
          context.fillStyle = "rgba(0,0,0,.82)";
          context.fillRect(8, 34, 286, 118);
          context.font = "700 11px monospace";
          context.fillStyle = "#7dff9b";
          context.fillText(`${debug.globalMode} ${debug.globalModeRemaining.toFixed(1)}s | POWER ${debug.frightenedRemaining.toFixed(1)}s`, 16, 51);
          debug.ghosts.forEach((ghost, index) => {
            context.fillStyle = state.ghosts[index]?.color || "#fff";
            const target = `${ghost.target.column},${ghost.target.row}`;
            context.fillText(`${ghost.id.padEnd(6)} ${ghost.mode.padEnd(10)} ${ghost.direction.padEnd(5)} -> ${target} [${ghost.validDirections.join(",")}]`, 16, 69 + index * 19);
          });
          context.restore();
        }
        const overlay = paused ? "PAUSED" : state.phase === "gameOver" ? "GAME OVER" : state.phase === "countdown" ? "READY" : state.phase === "levelComplete" ? "LEVEL CLEAR" : "";
        if (overlay) { context.fillStyle = "rgba(0,0,0,.66)"; context.fillRect(0, 0, PAC_WIDTH, PAC_HEIGHT); context.fillStyle = "#7dff9b"; context.font = "800 38px Arial"; context.textAlign = "center"; context.fillText(overlay, PAC_WIDTH / 2, PAC_HEIGHT / 2); context.textAlign = "start"; }
      }
      frame = requestAnimationFrame(loop);
    }
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [assetPack, inputRef, paused, playSound, restartSignal, tuning]);

  function finishSwipe(event: PointerEvent<HTMLCanvasElement>) {
    const start = swipeRef.current; swipeRef.current = null; if (!start) return;
    const dx = event.clientX - start.x; const dy = event.clientY - start.y;
    requestPacDirection(stateRef.current, Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"));
  }

  return (
    <div
      className="large-arcade-runtime pac-runtime game-focus-region"
      ref={containerRef}
      tabIndex={0}
      aria-label={t("gameUi.pacControls")}
    >
      <canvas ref={canvasRef} width={PAC_WIDTH} height={PAC_HEIGHT} className="large-game-canvas maze" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); swipeRef.current = { x: event.clientX, y: event.clientY }; }} onPointerUp={finishSwipe} onPointerCancel={() => { swipeRef.current = null; }} aria-label={t("gameUi.pacMaze")} />
      <p className="game-runtime-instructions">{t("gameUi.pacInstructions")}</p>
      {!focused ? <button className="game-focus-prompt" type="button" onClick={activate}>{t("gameUi.activate")}</button> : null}
    </div>
  );
}
