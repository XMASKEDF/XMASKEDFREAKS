"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import BrandLogo from "@/components/BrandLogo";
import { useAccount } from "@/components/account/AccountProvider";
import { useI18n } from "@/components/I18nProvider";
import { formatNumber } from "@/lib/i18n";
import type { GameItem } from "@/lib/config";
import { getGameMuted, personalBestFor, saveGameScore, setGameMutedPreference } from "@/lib/games/scores";
import type { GamePhase, GameResultMetadata } from "./types";
import { useGameAudio } from "@/hooks/useGameAudio";

type RuntimeState = {
  paused: boolean;
  muted: boolean;
  restartSignal: number;
  onReady: () => void;
  onScoreChange: (score: number) => void;
  onLevelChange: (level: number) => void;
  onRunEnd: (score: number, sessionSeconds: number, metadata?: GameResultMetadata) => void;
  onPhaseChange: (phase: GamePhase) => void;
  onPauseToggle: () => void;
  personalBest: number;
  globalBest: number;
  leaderboardScores: number[];
};

type GamePlayShellProps = {
  game: GameItem;
  globalBest: number;
  leaderboardScores: number[];
  children: (state: RuntimeState) => ReactNode;
};

export default function GamePlayShell({ game, globalBest: initialGlobalBest, leaderboardScores, children }: GamePlayShellProps) {
  const { locale, t } = useI18n();
  const { account, recordRecentView } = useAccount();
  const router = useRouter();
  const shellRef = useRef<HTMLDivElement | null>(null);
  const recordedRunRef = useRef("");
  const sessionIdRef = useRef("");
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [personalBest, setPersonalBest] = useState(0);
  const [globalBest, setGlobalBest] = useState(initialGlobalBest);
  const [phase, setPhase] = useState<GamePhase>("loading");
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(true);
  const [restartSignal, setRestartSignal] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenAvailable, setFullscreenAvailable] = useState(true);
  const [newBestVisible, setNewBestVisible] = useState(false);
  const [securityNotice, setSecurityNotice] = useState("");
  const bestAtRunStartRef = useRef(0);
  const bestNoticeShownRef = useRef(false);
  const bestNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playSound = useGameAudio(muted);

  useEffect(() => {
    if (!account.authenticated) return;
    void recordRecentView({
      id: game.id,
      productType: "future",
      title: game.title,
      imageUrl: game.thumbnail || "",
      href: `/games/${game.slug}/play`
    });
  }, [account.authenticated, game.id, game.slug, game.thumbnail, game.title, recordRecentView]);

  useEffect(() => {
    sessionIdRef.current = crypto.randomUUID();
    const best = personalBestFor(game.id);
    setPersonalBest(best);
    bestAtRunStartRef.current = best;
    setMuted(getGameMuted());
    setFullscreenAvailable(Boolean(document.fullscreenEnabled));
    return () => { if (bestNoticeTimerRef.current) clearTimeout(bestNoticeTimerRef.current); };
  }, [game.id]);

  useEffect(() => {
    function onVisibilityChange() {
      if (document.hidden && phase === "running") setPaused(true);
    }
    function onFullscreenChange() {
      setFullscreen(document.fullscreenElement === shellRef.current);
      window.dispatchEvent(new Event("resize"));
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, [phase]);

  useEffect(() => {
    function onGameSecurity(event: Event) {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      setPaused(true);
      setSecurityNotice(detail?.message || "This game session was paused for a security check. Your current game state is preserved.");
    }
    window.addEventListener("xmf-game-security", onGameSecurity);
    return () => window.removeEventListener("xmf-game-security", onGameSecurity);
  }, []);

  const recordRun = useCallback((finalScore: number, sessionSeconds: number, metadata: GameResultMetadata = {}) => {
    const sessionId = sessionIdRef.current || crypto.randomUUID();
    sessionIdRef.current = sessionId;
    const key = sessionId;
    if (recordedRunRef.current === key) return;
    recordedRunRef.current = key;
    const displayName = localStorage.getItem("xmf-display-name") || "Player";
    saveGameScore({
      gameId: game.id,
      gameTitle: game.title,
      displayName,
      score: finalScore,
      sessionSeconds,
      sessionId,
      metadata: { difficulty: game.difficulty || "Medium", completed: metadata.completed !== false, ...metadata },
      createdAt: new Date().toISOString()
    });
    setPersonalBest((best) => Math.max(best, finalScore));
    setGlobalBest((best) => Math.max(best, finalScore));
    void fetch("/api/games/scores", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": sessionId },
      body: JSON.stringify({ gameId: game.id, gameTitle: game.title, displayName, score: finalScore, sessionSeconds, sessionId, metadata: { difficulty: game.difficulty || "Medium", completed: metadata.completed !== false, ...metadata } })
    }).then(async (response) => {
      const payload = await response.json().catch(() => ({})) as { code?: string; message?: string };
      if (payload.code === "BOT_CHALLENGE_REQUIRED" || payload.code === "GAME_SECURITY_REJECTED" || payload.code === "GAME_ANTICHEAT_REJECTED") {
        window.dispatchEvent(new CustomEvent("xmf-game-security", { detail: { message: "This game session was paused for a security check. Your current game state is preserved." } }));
      }
    }).catch(() => undefined);
  }, [game.difficulty, game.id, game.title]);

  const handleReady = useCallback(() => setPhase((current) => current === "loading" ? "ready" : current), []);
  const handleScoreChange = useCallback((nextScore: number) => {
    setScore(nextScore);
    setPersonalBest((best) => Math.max(best, nextScore));
    setGlobalBest((best) => Math.max(best, nextScore));
    if (nextScore > bestAtRunStartRef.current && !bestNoticeShownRef.current) {
      bestNoticeShownRef.current = true;
      setNewBestVisible(true);
      if (bestNoticeTimerRef.current) clearTimeout(bestNoticeTimerRef.current);
      bestNoticeTimerRef.current = setTimeout(() => setNewBestVisible(false), 2200);
    }
  }, []);
  const handleLevelChange = useCallback((nextLevel: number) => setLevel(Math.max(1, Math.floor(nextLevel))), []);
  const handlePauseToggle = useCallback(() => setPaused((value) => !value), []);
  const handlePhaseChange = useCallback((next: GamePhase) => {
    setPhase(next);
    if (next === "paused") setPaused(true);
    if (next === "running" || next === "countdown" || next === "restarting") setPaused(false);
  }, []);

  function toggleMuted() {
    setMuted((current) => {
      const next = !current;
      setGameMutedPreference(next);
      return next;
    });
  }

  function restart() {
    if (score > 0 && phase !== "game-over") recordRun(score, 0, { completed: false });
    recordedRunRef.current = "";
    sessionIdRef.current = crypto.randomUUID();
    setScore(0);
    setLevel(1);
    bestAtRunStartRef.current = personalBest;
    bestNoticeShownRef.current = false;
    setNewBestVisible(false);
    setPaused(false);
    setPhase("running");
    setRestartSignal((value) => value + 1);
  }

  async function toggleFullscreen() {
    if (!shellRef.current || !document.fullscreenEnabled) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await shellRef.current.requestFullscreen();
    } catch {
      setFullscreenAvailable(false);
    }
  }

  function returnToGames() {
    setPaused(true);
    if (score > 0 && phase !== "game-over" && !window.confirm(t("games.leaveConfirm"))) {
      setPaused(false);
      return;
    }
    if (score > 0 && phase !== "game-over") recordRun(score, 0, { completed: false });
    router.push("/games");
  }

  return (
    <main className="game-play-page">
      <header className="game-play-nav">
        <BrandLogo href="/" priority />
        <button className="secondary" type="button" onClick={returnToGames}>{t("games.back")}</button>
      </header>
      <div
        className={`game-play-shell ${fullscreen ? "is-fullscreen" : ""}`}
        ref={shellRef}
        onClickCapture={(event) => { if ((event.target as HTMLElement).closest("button")) playSound("click"); }}
        onPointerOver={(event) => {
          const button = (event.target as HTMLElement).closest("button");
          if (button && !button.contains(event.relatedTarget as Node | null)) playSound("click");
        }}
      >
        <section className="game-play-toolbar" aria-label={`${game.title} controls`}>
          <div className="game-play-title">
            <span>{game.category} · {game.difficulty}</span>
            <h1>{game.title}</h1>
          </div>
          <div className="game-play-metrics" aria-live="polite">
            <span>{t("games.score")}<strong>{formatNumber(score, locale)}</strong></span>
            <span>{t("games.personalHigh")}<strong>{formatNumber(personalBest, locale)}</strong></span>
            <span>{t("games.publicHigh")}<strong>{formatNumber(globalBest, locale)}</strong></span>
            <span>{t("games.level")}<strong>{formatNumber(level, locale)}</strong></span>
          </div>
          <div className="game-play-actions">
            <button className="secondary" type="button" onClick={() => setPaused((value) => !value)} disabled={phase === "loading" || phase === "ready" || phase === "countdown" || phase === "game-over"}>{paused ? t("games.resume") : t("games.pause")}</button>
            <button className="secondary" type="button" onClick={restart}>{t("games.restart")}</button>
            <button className="secondary" type="button" onClick={toggleMuted} aria-pressed={!muted}>{muted ? t("games.off") : t("games.on")}</button>
            <button className="secondary fullscreen-control" type="button" onClick={toggleFullscreen} disabled={!fullscreenAvailable} aria-label={fullscreen ? t("games.exitFullscreen") : t("games.enterFullscreen")}>
              <span aria-hidden="true" /> {fullscreen ? t("games.exitFullscreen") : t("games.fullscreen")}
            </button>
            <button className="secondary" type="button" onClick={returnToGames}>{t("games.exit")}</button>
          </div>
        </section>
        <section className="game-play-surface" aria-busy={phase === "loading"}>
          {phase === "loading" ? <div className="game-load-state" role="status">{t("games.loadingNamed", { game: game.title })}</div> : null}
          {phase === "error" ? <div className="game-error-state" role="alert">{t("games.loadError")}</div> : null}
          {securityNotice ? <div className="game-security-overlay" role="alert"><strong>SECURITY CHECK</strong><span>{securityNotice}</span><button className="primary" type="button" onClick={() => { setSecurityNotice(""); setPaused(false); }}>Continue game</button></div> : null}
          <div className={`game-best-notice ${newBestVisible ? "is-visible" : ""}`} role="status" aria-live="polite" aria-hidden={!newBestVisible}>{t("games.newBest")}</div>
          {children({
            paused,
            muted,
            restartSignal,
            onReady: handleReady,
            onScoreChange: handleScoreChange,
            onLevelChange: handleLevelChange,
            onRunEnd: recordRun,
            onPauseToggle: handlePauseToggle,
            onPhaseChange: handlePhaseChange,
            personalBest,
            globalBest,
            leaderboardScores
          })}
        </section>
      </div>
    </main>
  );
}
