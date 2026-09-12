"use client";

import { useEffect, useRef } from "react";
import { useI18n } from "@/components/I18nProvider";
import { formatNumber } from "@/lib/i18n";
import type { TipOption } from "@/lib/tips";
import { tipPhraseKey } from "@/lib/tips";

export type RefillResumeReason = "insufficientTokens" | "zeroBalance" | "twentyFiveMinuteThreshold" | "paymentCompleted" | "paymentFailed";

type RefillResumeModalProps = {
  reason: RefillResumeReason | null;
  tokenBalance: number;
  pendingTip: TipOption | null;
  checkoutRemaining: number;
  accessCopy: string;
  accessCostLabel: string;
  accessLockReason: string;
  onRefill: () => void;
  onReturnToLive: () => void;
  onResumeAccess: () => void;
  onDeclineAccess: () => void;
  onQuickTip?: () => void;
};

export default function RefillResumeModal(props: RefillResumeModalProps) {
  const { locale, t } = useI18n();
  const { onReturnToLive, reason } = props;
  const modalRef = useRef<HTMLDivElement | null>(null);
  const onReturnRef = useRef(onReturnToLive);
  const threshold = reason === "twentyFiveMinuteThreshold";
  const required = props.pendingTip?.tokenCost || 0;

  useEffect(() => { onReturnRef.current = onReturnToLive; }, [onReturnToLive]);

  useEffect(() => {
    if (!reason) return;
    const prior = document.activeElement as HTMLElement | null;
    const modal = modalRef.current;
    modal?.querySelector<HTMLButtonElement>("button")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !threshold) onReturnRef.current();
      if (event.key !== "Tab" || !modal) return;
      const focusable = Array.from(modal.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], input:not([disabled])"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => { window.removeEventListener("keydown", onKeyDown); prior?.focus(); };
  }, [reason, threshold]);

  if (!reason) return null;

  return (
    <div className={`refill-resume-overlay ${threshold ? "is-access-threshold" : "is-token-shortage"}`} role="presentation">
      <div className="resume-card refill-resume-card" ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="refill-resume-title">
        <p className="kicker">{threshold ? t("wallet.access.title") : t("wallet.tokenWallet")}</p>
        <h2 id="refill-resume-title">{threshold ? t("wallet.refillResume") : t("wallet.refillTokens")}</h2>
        {threshold ? (
          <>
            <p>{props.accessCopy}</p>
            <p className="status-line">{t("wallet.access.resumeCost")}: <strong>{props.accessCostLabel}</strong></p>
            <div className="resume-timer">{t("wallet.access.checkoutTimer")} <strong>{String(Math.max(0, props.checkoutRemaining)).padStart(2, "0")}s</strong></div>
            <div className="resume-actions">
              <button className="primary" type="button" onClick={props.onResumeAccess}>{t("wallet.access.unlock")}</button>
              {props.onQuickTip ? <button className="secondary" type="button" onClick={props.onQuickTip}>{t("quickTip.card")}</button> : null}
              <button className="secondary" type="button" onClick={props.onDeclineAccess}>{t("wallet.access.leave")}</button>
            </div>
            <p className="status-line">{props.accessLockReason}</p>
          </>
        ) : (
          <>
            <p>{t("wallet.shortage.copy")}</p>
            <dl className="token-shortage-summary">
              <div><dt>{t("wallet.currentBalance")}</dt><dd>{formatNumber(props.tokenBalance, locale)} {t("tipMenu.tokens")}</dd></div>
              {props.pendingTip ? <div><dt>{t("wallet.selectedTip")}</dt><dd>{props.pendingTip.emoji} {t(tipPhraseKey(props.pendingTip.id))}</dd></div> : null}
              {props.pendingTip ? <div><dt>{t("wallet.required")}</dt><dd>{formatNumber(required, locale)} {t("tipMenu.tokens")}</dd></div> : null}
              {props.pendingTip ? <div><dt>{t("wallet.stillNeeded")}</dt><dd>{formatNumber(Math.max(0, required - props.tokenBalance), locale)} {t("tipMenu.tokens")}</dd></div> : null}
            </dl>
            <div className="resume-actions">
              <button className="primary" type="button" onClick={props.onRefill}>{t("wallet.refillTokens")}</button>
              {props.onQuickTip ? <button className="secondary" type="button" onClick={props.onQuickTip}>{t("quickTip.card")}</button> : null}
              <button className="secondary" type="button" onClick={props.onReturnToLive}>{t("wallet.returnLive")}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
