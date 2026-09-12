"use client";

import Image from "next/image";
import { FormEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/components/I18nProvider";
import { formatCurrency, formatNumber } from "@/lib/i18n";
import { tipPhraseKey, type TipOption } from "@/lib/tips";

type QuickLiveTipModalProps = {
  open: boolean;
  amounts: TipOption[];
  selectedId: string | null;
  requiredCoins: number;
  stage: "entry" | "hourly" | "voluntary";
  status: string;
  submitting: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export default function QuickLiveTipModal(props: QuickLiveTipModalProps) {
  const { locale, t } = useI18n();
  const { open } = props;
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const onCloseRef = useRef(props.onClose);
  const submittingRef = useRef(props.submitting);
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    onCloseRef.current = props.onClose;
    submittingRef.current = props.submitting;
  }, [props.onClose, props.submitting]);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.classList.add("is-locked");
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submittingRef.current) onCloseRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.classList.remove("is-locked");
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [open, portalReady]);

  if (!props.open || !portalReady) return null;
  const coinsToUsd = (coins: number) => coins * 0.5;
  const selected = props.amounts.find((amount) => amount.id === props.selectedId) || props.amounts[0] || null;
  const selectedAmount = selected ? coinsToUsd(selected.tokenCost) : 0;
  const stageCopy = props.stage === "entry" ? t("quickTip.entry") : props.stage === "hourly" ? t("quickTip.hourly") : t("quickTip.voluntary");
  const selectedLabel = selected ? t(tipPhraseKey(selected.id)) : "";

  return createPortal((
    <div className="quick-live-tip-backdrop" role="presentation">
      <section className="quick-live-tip-modal" role="dialog" aria-modal="true" aria-labelledby="quick-live-tip-title" aria-describedby="quick-live-tip-subtitle">
        <header className="quick-live-tip-header">
          <div className="quick-live-tip-title">
            <span className="quick-live-tip-heart" aria-hidden="true">♥</span>
            <div><p className="kicker">{stageCopy}</p><h2 id="quick-live-tip-title">{t("quickTip.title")}</h2><p id="quick-live-tip-subtitle">{t("quickTip.subtitle")}</p></div>
          </div>
          <div className="quick-live-tip-promise"><span className="quick-live-tip-promise-icon" aria-hidden="true">⚡</span><div><strong>{t("quickTip.supportTitle")}</strong><span>{t("quickTip.supportCopy")}</span></div></div>
          <button ref={closeRef} className="tip-menu-close" type="button" aria-label={t("quickTip.close")} onClick={props.onClose} disabled={props.submitting}>×</button>
        </header>

        <form onSubmit={props.onSubmit}>
          <div className="quick-live-tip-grid">
            <section className="quick-live-tip-amounts" aria-labelledby="quick-live-tip-amounts-title">
              <h3 id="quick-live-tip-amounts-title">{t("quickTip.chooseAmount")}</h3>
              {props.stage !== "voluntary" ? <p className="quick-live-tip-required">{t("quickTip.required", { coins: formatNumber(props.requiredCoins, locale), amount: formatCurrency(coinsToUsd(props.requiredCoins), locale) })}</p> : null}
              <div className="quick-live-tip-amount-grid">
                {props.amounts.map((amount) => (
                  <button className={selected?.id === amount.id ? "is-selected" : ""} type="button" key={amount.id} onClick={() => props.onSelect(amount.id)} aria-label={t("tipMenu.optionLabel", { phrase: t(tipPhraseKey(amount.id)), tokens: formatNumber(amount.tokenCost, locale) })} aria-pressed={selected?.id === amount.id} disabled={props.submitting}>
                    <span className="quick-live-tip-amount-emoji" aria-hidden="true">{amount.artworkUrl ? <Image src={amount.artworkUrl} alt="" width={64} height={64} /> : amount.emoji}</span><strong>{t(tipPhraseKey(amount.id))}</strong><span>{formatNumber(amount.tokenCost, locale)} {t("tipMenu.tokens")}</span><small>{formatCurrency(coinsToUsd(amount.tokenCost), locale)}</small>
                  </button>
                ))}
              </div>
            </section>

            <section className="quick-live-tip-complete" aria-labelledby="quick-live-tip-complete-title">
              <p className="kicker">{t("quickTip.kicker")}</p>
              <h3 id="quick-live-tip-complete-title">{t("quickTip.complete")}</h3>
              {selected ? <div className="quick-live-tip-selected"><span className="quick-live-tip-selected-art" aria-hidden="true">{selected.artworkUrl ? <Image src={selected.artworkUrl} alt="" width={54} height={54} /> : selected.emoji}</span><div><small>{selectedLabel}</small><strong>{formatCurrency(selectedAmount, locale)}</strong><span>{formatNumber(selected.tokenCost, locale)} {t("tipMenu.tokens")}</span></div></div> : null}
              <p className="quick-live-tip-support">{t("quickTip.supportMessage")}</p>
              <div className="quick-live-tip-secure"><strong>🔒 {t("quickTip.secureTitle")}</strong><p>{t("quickTip.secureCopy")}</p></div>
              <button className="primary quick-live-tip-submit" type="submit" disabled={!selected || props.submitting}>{props.submitting ? t("quickTip.paymentPending") : t("quickTip.send", { coins: selected?.tokenCost || 0, amount: formatCurrency(selectedAmount, locale) })} <span aria-hidden="true">→</span></button>
              <p className="quick-live-tip-return">↻ {t("quickTip.return")}</p>
            </section>
          </div>
          {props.status ? <p className="quick-live-tip-status" role="status" aria-live="polite">{props.status}</p> : null}
          <button className="secondary quick-live-tip-cancel" type="button" onClick={props.onClose} disabled={props.submitting}>{t("quickTip.cancel")}</button>
        </form>
      </section>
    </div>
  ), document.body);
}
