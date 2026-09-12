"use client";

import Link from "next/link";
import { Component, Fragment, type ErrorInfo, type ReactNode } from "react";
import { useI18n } from "@/components/I18nProvider";
import { GAME_RECOVERY_DELAYS, isRecoverableGameError, reportGameError } from "@/lib/games/recovery";

type Labels = { failed: string; recovering: string; reload: string; home: string; report: string; retry: string; reported: string };
type Props = { children: ReactNode; labels: Labels; componentName: string; gameId?: string | null; compact?: boolean };
type State = { error: Error | null; retryCount: number; recoveryKey: number; reported: boolean };

export default class GamesErrorBoundary extends Component<Props, State> {
  state: State = { error: null, retryCount: 0, recoveryKey: 0, reported: false };
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private componentStack = "";

  static getDerivedStateFromError(error: Error): Partial<State> { return { error }; }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.componentStack = info.componentStack || "";
    const retryCount = this.state.retryCount;
    void reportGameError({ error, componentStack: this.componentStack, retryCount, gameId: this.props.gameId, componentName: this.props.componentName });
    if (isRecoverableGameError(error) && retryCount < GAME_RECOVERY_DELAYS.length) this.scheduleRetry(retryCount);
  }

  componentWillUnmount() { if (this.retryTimer) clearTimeout(this.retryTimer); }

  private scheduleRetry(attempt: number) {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      window.dispatchEvent(new CustomEvent("xmf:game-recovery", { detail: { gameId: this.props.gameId, attempt: attempt + 1 } }));
      this.setState((state) => ({ retryCount: state.retryCount + 1, recoveryKey: state.recoveryKey + 1, reported: false }), () => {
        this.setState({ error: null });
      });
    }, GAME_RECOVERY_DELAYS[attempt]);
  }

  private retry = () => {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    window.dispatchEvent(new CustomEvent("xmf:game-recovery", { detail: { gameId: this.props.gameId, attempt: 0 } }));
    this.setState((state) => ({ retryCount: 0, recoveryKey: state.recoveryKey + 1, reported: false }), () => {
      this.setState({ error: null });
    });
  };

  private report = () => {
    if (!this.state.error) return;
    void reportGameError({ error: this.state.error, componentStack: this.componentStack, retryCount: this.state.retryCount, gameId: this.props.gameId, componentName: this.props.componentName, recoveryAction: "visitor-report" });
    this.setState({ reported: true });
  };

  render() {
    if (!this.state.error) return <Fragment key={this.state.recoveryKey}>{this.props.children}</Fragment>;
    const recovering = isRecoverableGameError(this.state.error) && this.state.retryCount < GAME_RECOVERY_DELAYS.length;
    return <section className={`games-recovery-panel ${this.props.compact ? "is-compact" : ""}`} role="alert" aria-live="assertive">
      <p className="kicker">{this.props.labels.failed}</p><h2>{recovering ? this.props.labels.recovering : this.props.labels.failed}</h2>
      <div className="games-recovery-actions"><button className="primary" type="button" onClick={this.retry}>{this.props.labels.retry}</button><button className="secondary" type="button" onClick={() => location.assign(location.pathname)}>{this.props.labels.reload}</button><Link className="secondary" href="/">{this.props.labels.home}</Link><button className="secondary" type="button" onClick={this.report}>{this.state.reported ? this.props.labels.reported : this.props.labels.report}</button></div>
    </section>;
  }
}

export function GamesBoundary({ children, componentName, gameId, compact = false }: Omit<Props, "labels">) {
  const { t } = useI18n();
  const labels = { failed: t("gamesRecovery.failed"), recovering: t("gamesRecovery.recovering"), reload: t("gamesRecovery.reload"), home: t("gamesRecovery.home"), report: t("gamesRecovery.report"), retry: t("gamesRecovery.retry"), reported: t("gamesRecovery.reported") };
  return <GamesErrorBoundary labels={labels} componentName={componentName} gameId={gameId} compact={compact}>{children}</GamesErrorBoundary>;
}
