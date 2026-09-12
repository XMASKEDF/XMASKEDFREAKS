"use client";

import { useEffect, useRef } from "react";
import { useArcadeInput } from "@/hooks/useArcadeInput";
import { useGameInput } from "@/hooks/useGameInput";
import { useSlitherGame } from "@/hooks/useSlitherGame";
import SlitherCanvas from "./SlitherCanvas";
import SlitherGameOver from "./SlitherGameOver";
import SlitherHUD from "./SlitherHUD";
import SlitherLeaderboard from "./SlitherLeaderboard";
import SlitherMinimap from "./SlitherMinimap";
import SlitherJoystick from "./SlitherJoystick";
import SlitherPauseMenu from "./SlitherPauseMenu";
import SlitherMenu from "./SlitherMenu";
import type { GamePhase, GameResultMetadata } from "../types";
import { useGameAudio } from "@/hooks/useGameAudio";
import { useI18n } from "@/components/I18nProvider";

type SlitherGameProps = {
  displayName: string;
  personalBest: number;
  publicBest: number;
  leaderboardScores: number[];
  muted: boolean;
  onScore?: (score: number, sessionSeconds: number, metadata?: GameResultMetadata) => void;
  paused?: boolean;
  restartSignal?: number;
  onReady?: () => void;
  onScoreChange?: (score: number) => void;
  onLevelChange?: (level: number) => void;
  onPhaseChange?: (phase: GamePhase) => void;
  onPauseToggle?: () => void;
};

export default function SlitherGame({ displayName, personalBest, publicBest, leaderboardScores, muted, onScore, paused, restartSignal = 0, onReady, onScoreChange, onLevelChange, onPhaseChange, onPauseToggle }: SlitherGameProps) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { inputRef, setPointer, clearPointer, setBoost } = useGameInput();
  const { inputRef: keyboardInputRef, focused, activate, clear: clearInput } = useArcadeInput(containerRef, onPauseToggle);
  const game = useSlitherGame({ inputRef, keyboardInputRef, onScore });
  const restartRef = useRef(restartSignal);
  const externalPausedRef = useRef(paused);
  const lastScoreRef = useRef(0);
  const lastPhaseRef = useRef(game.phase);
  const playSound = useGameAudio(muted);

  useEffect(() => {
    onReady?.();
  }, [onReady]);

  useEffect(() => {
    onScoreChange?.(game.snapshot.score);
    onLevelChange?.(game.snapshot.level);
    if (game.snapshot.score > lastScoreRef.current) playSound("collect");
    lastScoreRef.current = game.snapshot.score;
  }, [game.snapshot.level, game.snapshot.score, onLevelChange, onScoreChange, playSound]);

  useEffect(() => {
    onPhaseChange?.(game.phase === "idle" ? "ready" : game.phase);
    if (game.phase === "game-over" && lastPhaseRef.current !== "game-over") playSound("gameover");
    lastPhaseRef.current = game.phase;
  }, [game.phase, onPhaseChange, playSound]);

  useEffect(() => { if (paused || game.phase === "paused") clearInput(); }, [clearInput, game.phase, paused]);

  useEffect(() => {
    if (externalPausedRef.current === paused) return;
    externalPausedRef.current = paused;
    if (paused) game.controls.pauseGame();
    else game.controls.resumeGame();
  }, [game.controls, game.phase, paused]);

  useEffect(() => {
    if (restartRef.current === restartSignal) return;
    restartRef.current = restartSignal;
    clearInput();
    if (game.phase === "idle") game.controls.startGame(displayName, "xmf-green", game.settings);
    else game.controls.restartGame();
  }, [clearInput, displayName, game.controls, game.phase, game.settings, restartSignal]);

  return (
    <div className="slither-game game-focus-region" ref={containerRef} tabIndex={0} aria-label={t("gameUi.slitherControls")}>
      {game.phase === "idle" ? (
        <SlitherMenu displayName={displayName} palettes={game.paletteOptions} onStart={game.controls.startGame} />
      ) : (
        <>
          <SlitherHUD snapshot={game.snapshot} personalBest={personalBest} leaderboardScores={leaderboardScores} />
          <div className="slither-playfield">
            <SlitherCanvas
              stateRef={game.stateRef}
              reducedGlow={game.settings.reducedGlow}
              onPointerMove={setPointer}
              onPointerLeave={clearPointer}
              onBoostChange={setBoost}
            />
            <SlitherMinimap stateRef={game.stateRef} />
            {game.phase === "paused" ? <SlitherPauseMenu onResume={game.controls.resumeGame} onRestart={game.controls.restartGame} /> : null}
            {game.phase === "game-over" ? <SlitherGameOver score={game.snapshot.score} message={game.snapshot.message} onRestart={game.controls.restartGame} /> : null}
          </div>
          <div className="slither-status-row">
            <span>{t("gameUi.longest")}: <strong>{game.snapshot.longestSnake}</strong></span>
            <span>{t("gameUi.boost")} <strong>{game.snapshot.mass > 18 ? t("gameUi.ready") : t("gameUi.low")}</strong></span>
            <span>{t("gameUi.ping")} <strong>{t("gameUi.local")}</strong></span>
            <span>FPS <strong>60</strong></span>
          </div>
          <SlitherJoystick
            onBoost={setBoost}
            onPause={game.phase === "paused" ? game.controls.resumeGame : game.controls.pauseGame}
            paused={game.phase === "paused"}
          />
          <SlitherLeaderboard scores={game.localLeaderboard} personalBest={personalBest} publicBest={publicBest} />
          {!focused ? <button className="game-focus-prompt" type="button" onClick={activate}>{t("gameUi.activate")}</button> : null}
        </>
      )}
    </div>
  );
}
