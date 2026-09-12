"use client";

import Image from "next/image";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import { formatNumber } from "@/lib/i18n";
import type { TipMenuSettings, TipOption } from "@/lib/tips";
import { tipPhraseKey, validateCustomTipTokens } from "@/lib/tips";

type TipMenuProps = {
  open: boolean;
  options: TipOption[];
  settings: TipMenuSettings;
  tokenBalance: number | null;
  processingId: string | null;
  successfulId: string | null;
  feedback: string;
  onOpen: () => void;
  onClose: () => void;
  onTip: (option: TipOption) => void;
  onCustomTip: (coins: number, message?: string) => void;
  onRefill: () => void;
  onQuickTip: () => void;
};

function TokenIcon() {
  return <Image src="/branding/green-coin.png" alt="" aria-hidden="true" width={30} height={30} />;
}

function timer(seconds: number) {
  const hours = Math.floor(seconds / 3600).toString().padStart(2, "0");
  const minutes = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
  const remainder = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}:${remainder}`;
}

export default function TipMenu(props: TipMenuProps) {
  const { locale, t } = useI18n();
  const { onClose, open } = props;
  const [customTokens, setCustomTokens] = useState("");
  const [customMessage, setCustomMessage] = useState("");
  const [customOpen, setCustomOpen] = useState(false);
  const [customError, setCustomError] = useState("");
  const [liveSeconds, setLiveSeconds] = useState(0);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const onCloseRef = useRef(onClose);
  const liveStartedAtRef = useRef(Date.now());

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;
    const updateClock = () => setLiveSeconds(Math.floor((Date.now() - liveStartedAtRef.current) / 1000));
    updateClock();
    const timerId = window.setInterval(updateClock, 1000);
    return () => window.clearInterval(timerId);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function close() {
    onClose();
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }

  function submitCustom(event: FormEvent) {
    event.preventDefault();
    const result = validateCustomTipTokens(customTokens, props.settings);
    if (!result.ok) {
      setCustomError(t("tipMenu.customRange", {
        minimum: props.settings.minimumCustomTokens,
        maximum: props.settings.maximumCustomTokens
      }));
      return;
    }
    setCustomError("");
    props.onCustomTip(result.tokens, customMessage.trim().slice(0, 120));
  }

  if (!open) {
    return (
      <>
        <aside className="tip-dock tip-dock-collapsed">
          <p className="kicker">{t("tipMenu.liveTipping")}</p>
          <button ref={triggerRef} className="primary" type="button" onClick={props.onOpen}>{t("tipMenu.send")}</button>
        </aside>
        {props.settings.customTipsEnabled ? <aside className={`custom-tip-pocket ${customOpen ? "is-open" : ""}`}>
          <button type="button" className="custom-tip-pocket-trigger" onClick={() => setCustomOpen((value) => !value)} aria-expanded={customOpen}>CUSTOM TIP <span aria-hidden="true">{customOpen ? "−" : "+"}</span></button>
          {customOpen ? <form className="custom-tip-pocket-form" onSubmit={submitCustom}>
            <label htmlFor="custom-tip-pocket-coins">COIN AMOUNT</label>
            <input id="custom-tip-pocket-coins" inputMode="numeric" value={customTokens} onChange={(event) => setCustomTokens(event.target.value)} placeholder="75" />
            <output>${(Math.max(0, Number(customTokens) || 0) * 0.5).toFixed(2)}</output>
            <label htmlFor="custom-tip-pocket-message">MESSAGE <span>(optional)</span></label>
            <input id="custom-tip-pocket-message" maxLength={120} value={customMessage} onChange={(event) => setCustomMessage(event.target.value)} placeholder="Keep it up!" />
            <button type="submit">TIP COINS</button>
            {customError ? <small role="alert">{customError}</small> : null}
          </form> : null}
        </aside> : null}
      </>
    );
  }

  return (
    <div className="tip-menu-backdrop" role="presentation">
      <section className="interactive-tip-menu" role="dialog" aria-modal="true" aria-labelledby="tip-menu-title">
        <header className="interactive-tip-header">
          <div className="tip-live-clock"><span>● {t("tipMenu.liveNow")}</span><strong>{timer(liveSeconds)}</strong></div>
          <div className="tip-title-lockup"><span aria-hidden="true">💋</span><h2 id="tip-menu-title">{t("tipMenu.send")}</h2><p>{t("tipMenu.subtitle")}</p></div>
          <aside className="tip-token-balance" aria-label={t("tipMenu.balanceLabel")}><span>{t("tipMenu.yourTokens")}</span><strong>{props.tokenBalance === null ? "—" : formatNumber(props.tokenBalance, locale)} <TokenIcon /></strong><div className="tip-token-actions"><button type="button" onClick={props.onQuickTip}>{t("quickTip.card")}</button><button type="button" onClick={props.onRefill}>{t("tipMenu.refillTokens")}</button></div></aside>
          <button ref={closeRef} className="tip-menu-close" type="button" aria-label={t("tipMenu.close")} onClick={close}>×</button>
        </header>

        <div className="interactive-tip-grid" aria-label={t("tipMenu.optionsLabel")}>
          {props.options.filter((option) => option.enabled && option.temporaryAvailable).sort((a, b) => a.tokenCost - b.tokenCost).map((option) => {
            const processing = props.processingId === option.id;
            const success = props.successfulId === option.id;
            return (
              <button
                className={`interactive-tip-option ${option.featured ? "is-featured" : ""} ${processing ? "is-processing" : ""} ${success ? "is-success" : ""}`}
                type="button"
                key={option.id}
                aria-label={t("tipMenu.optionLabel", { phrase: t(tipPhraseKey(option.id)), tokens: formatNumber(option.tokenCost, locale) })}
                aria-busy={processing}
                onClick={() => props.onTip(option)}
              >
                <span className="tip-option-emoji" aria-hidden="true">{success ? "✓" : option.artworkUrl ? <Image src={option.artworkUrl} alt="" width={96} height={96} /> : option.emoji}</span>
                <strong>{processing ? t("tipMenu.sending") : success ? t("tipMenu.sent") : t(tipPhraseKey(option.id))}</strong>
                <small><TokenIcon /> {formatNumber(option.tokenCost, locale)} {t("wallet.coins")} · ${(option.tokenCost * 0.5).toFixed(2)}</small>
              </button>
            );
          })}

          {props.settings.customTipsEnabled ? (
            <form className="custom-token-tip" onSubmit={submitCustom}>
              <p>{t("tipMenu.custom")}</p>
              <label htmlFor="custom-tip-tokens">{t("tipMenu.customLabel")}</label>
              <input id="custom-tip-tokens" inputMode="numeric" value={customTokens} onChange={(event) => setCustomTokens(event.target.value)} placeholder={t("tipMenu.example", { amount: props.settings.minimumCustomTokens })} />
              <output aria-live="polite">${(Math.max(0, Number(customTokens) || 0) * 0.5).toFixed(2)}</output>
              <button type="submit">{t("tipMenu.sendCustom")}</button>
              {customError ? <small role="alert">{customError}</small> : null}
            </form>
          ) : null}
        </div>

        <div className="tip-menu-refill-row">
          <span aria-hidden="true">⟳</span>
          <p><strong>{t("tipMenu.runningLow")}</strong><small>{t("tipMenu.runningLowCopy")}</small></p>
          <button type="button" onClick={props.onRefill}><TokenIcon /> {t("tipMenu.refillResume")}</button>
        </div>
        <div className="tip-menu-trust-row"><span>{t("tipMenu.instant")}</span><span>{t("tipMenu.secure")}</span><span>{t("tipMenu.nonRefundable")}</span><span>{t("tipMenu.adultsOnly")}</span></div>
        <p className="tip-menu-feedback" role="status" aria-live="polite">{props.feedback || t("tipMenu.feedback")}</p>
      </section>
    </div>
  );
}
