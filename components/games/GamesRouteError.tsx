"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import { GAME_RECOVERY_DELAYS, isRecoverableGameError, reportGameError } from "@/lib/games/recovery";

export default function GamesRouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n();
  const [attempt, setAttempt] = useState(0);
  const [reported, setReported] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recoverable = isRecoverableGameError(error);

  const record = useCallback((recoveryAction: string, retryCount = attempt) => reportGameError({ error, retryCount, componentName: "GamesRoute", gameId: location.pathname.split("/")[2] || null, recoveryAction }), [attempt, error]);

  useEffect(() => {
    void record("route-error-detected", attempt);
    if (!recoverable || attempt >= GAME_RECOVERY_DELAYS.length) return;
    timer.current = setTimeout(() => { window.dispatchEvent(new CustomEvent("xmf:game-recovery", { detail: { attempt: attempt + 1 } })); setAttempt((value) => value + 1); reset(); }, GAME_RECOVERY_DELAYS[attempt]);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [attempt, recoverable, record, reset]);

  function retry() { if (timer.current) clearTimeout(timer.current); setAttempt(0); reset(); }
  function report() { void record("visitor-report"); setReported(true); }

  return <main className="games-route games-recovery-page"><section className="games-recovery-panel" role="alert" aria-live="assertive"><p className="kicker">{t("gamesRecovery.failed")}</p><h1>{recoverable && attempt < GAME_RECOVERY_DELAYS.length ? t("gamesRecovery.recovering") : t("gamesRecovery.failed")}</h1><div className="games-recovery-actions"><button className="primary" type="button" onClick={retry}>{t("gamesRecovery.retry")}</button><button className="secondary" type="button" onClick={() => location.assign(location.pathname)}>{t("gamesRecovery.reload")}</button><Link className="secondary" href="/">{t("gamesRecovery.home")}</Link><button className="secondary" type="button" onClick={report}>{reported ? t("gamesRecovery.reported") : t("gamesRecovery.report")}</button></div></section></main>;
}
