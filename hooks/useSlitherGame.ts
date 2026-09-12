"use client";

import { MutableRefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_SETTINGS, SNAKE_PALETTES } from "@/lib/slither/constants";
import { createInitialState, snapshotFromState, updateGame } from "@/lib/slither/engine";
import { advanceFixedClock } from "@/lib/games/mechanics";
import type { ArcadeInputState } from "./useArcadeInput";
import { saveLocalSlitherScore } from "@/lib/slither/persistence";
import {
  GamePhase,
  SlitherGameState,
  SlitherInputState,
  SlitherScoreEntry,
  SlitherSettings,
  SlitherSnapshot,
  SnakePaletteId
} from "@/lib/slither/types";
import { useGameVisibility } from "./useGameVisibility";
import { getArcadeMovementIntent } from "@/lib/games/input";

const initialSnapshot: SlitherSnapshot = {
  phase: "idle",
  elapsedSeconds: 0,
  score: 0,
  level: 1,
  mass: 0,
  playerName: "Player",
  playerAlive: true,
  longestSnake: "Player",
  rank: 1,
  foodCount: 0,
  botCount: 0,
  message: "Ready.",
  length: 0,
  peakLength: 0,
  kills: 0
};

type UseSlitherGameOptions = {
  inputRef: MutableRefObject<SlitherInputState>;
  keyboardInputRef?: MutableRefObject<ArcadeInputState>;
  onScore?: (score: number, sessionSeconds: number, metadata?: Record<string, string | number | boolean>) => void;
};

export function useSlitherGame({ inputRef, keyboardInputRef, onScore }: UseSlitherGameOptions) {
  const visible = useGameVisibility();
  const stateRef = useRef<SlitherGameState | null>(null);
  const onScoreRef = useRef(onScore);
  const savedGameOverScoreRef = useRef(false);
  const phaseRef = useRef<GamePhase>("idle");
  const [phase, setPhase] = useState<GamePhase>("idle");
  const [snapshot, setSnapshot] = useState<SlitherSnapshot>(initialSnapshot);
  const [localLeaderboard, setLocalLeaderboard] = useState<SlitherScoreEntry[]>([]);
  const [selectedPalette, setSelectedPalette] = useState<SnakePaletteId>("xmf-green");
  const [settings, setSettings] = useState<SlitherSettings>(DEFAULT_SETTINGS);
  const [lastStartedName, setLastStartedName] = useState("Player");

  useEffect(() => {
    onScoreRef.current = onScore;
  }, [onScore]);

  const publishSnapshot = useCallback(() => {
    if (!stateRef.current) {
      setSnapshot(initialSnapshot);
      return;
    }
    setSnapshot(snapshotFromState(stateRef.current));
  }, []);

  const startGame = useCallback((name: string, paletteId: SnakePaletteId, nextSettings: SlitherSettings) => {
    stateRef.current = createInitialState(name, paletteId, nextSettings);
    savedGameOverScoreRef.current = false;
    setSelectedPalette(paletteId);
    setSettings(nextSettings);
    setLastStartedName(name);
    phaseRef.current = "running";
    setPhase("running");
    setSnapshot(snapshotFromState(stateRef.current));
  }, []);

  const pauseGame = useCallback(() => {
    if (!stateRef.current || stateRef.current.phase !== "running") return;
    stateRef.current = { ...stateRef.current, phase: "paused" };
    phaseRef.current = "paused";
    setPhase("paused");
    publishSnapshot();
  }, [publishSnapshot]);

  const resumeGame = useCallback(() => {
    if (!stateRef.current || stateRef.current.phase !== "paused") return;
    stateRef.current = { ...stateRef.current, phase: "running" };
    phaseRef.current = "running";
    setPhase("running");
    publishSnapshot();
  }, [publishSnapshot]);

  const endGame = useCallback((message = "Game ended.") => {
    if (!stateRef.current) return;
    stateRef.current = { ...stateRef.current, phase: "game-over", message, endedAt: performance.now() / 1000 };
    phaseRef.current = "game-over";
    setPhase("game-over");
    publishSnapshot();
  }, [publishSnapshot]);

  const restartGame = useCallback(() => {
    startGame(lastStartedName, selectedPalette, settings);
  }, [lastStartedName, selectedPalette, settings, startGame]);

  useEffect(() => {
    let frame = 0;
    const clock = { previousSeconds: performance.now() / 1000, accumulator: 0 };
    let lastPublishedAt = 0;

    function tick(now: number) {
      const current = stateRef.current;
      if (current?.phase === "running" && visible) {
        const keys = keyboardInputRef?.current.keys;
        const intent = keys ? getArcadeMovementIntent(keys) : { horizontal: 0 as const, vertical: 0 as const };
        const frameInput = {
          ...inputRef.current,
          keyboardTurn: intent.horizontal,
          // Slither has continuous heading rather than a vertical axis; up/W
          // retain their established boost behavior and down/S remain neutral.
          boost: inputRef.current.boost || intent.vertical === -1 || Boolean(keys?.has(" "))
        };
        advanceFixedClock(clock, now / 1000, (step) => {
          if (stateRef.current?.phase === "running") stateRef.current = updateGame(stateRef.current, frameInput, step);
        });
        if (!stateRef.current) return;
        const phaseChanged = stateRef.current.phase !== phaseRef.current;
        if (now - lastPublishedAt >= 100 || phaseChanged) {
          lastPublishedAt = now;
          phaseRef.current = stateRef.current.phase;
          setPhase(stateRef.current.phase);
          setSnapshot(snapshotFromState(stateRef.current));
        }
        if (stateRef.current.phase === "game-over" && !savedGameOverScoreRef.current) {
          savedGameOverScoreRef.current = true;
          const scoreEntry = { name: stateRef.current.player.name, score: stateRef.current.score };
          setLocalLeaderboard(saveLocalSlitherScore(scoreEntry));
          onScoreRef.current?.(stateRef.current.score, Math.round(stateRef.current.elapsedSeconds), {
            completed: true,
            finalLength: snapshotFromState(stateRef.current).length,
            peakLength: snapshotFromState(stateRef.current).peakLength,
            kills: stateRef.current.player.kills,
            survivalTime: Math.round(stateRef.current.elapsedSeconds)
          });
        }
      } else {
        clock.previousSeconds = now / 1000;
        clock.accumulator = 0;
      }
      frame = window.requestAnimationFrame(tick);
    }

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [inputRef, keyboardInputRef, visible]);

  const controls = useMemo(() => ({
    startGame,
    pauseGame,
    resumeGame,
    restartGame,
    endGame
  }), [endGame, pauseGame, restartGame, resumeGame, startGame]);

  return {
    stateRef,
    phase,
    snapshot,
    controls,
    localLeaderboard,
    paletteOptions: SNAKE_PALETTES,
    selectedPalette,
    settings,
    setSettings
  };
}
