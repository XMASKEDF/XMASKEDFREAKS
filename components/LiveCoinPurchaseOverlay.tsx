"use client";

import Image from "next/image";
import type { FormEvent } from "react";
import { useI18n } from "@/components/I18nProvider";
import { formatCurrency, formatNumber } from "@/lib/i18n";
import { quoteCoinPackage, type CoinPackage, type CoinPackageQuote } from "@/lib/config";

type LiveCoinPurchaseOverlayProps = {
  packages: CoinPackage[];
  selectedPackageId: string | null;
  selectedPackageQuote: CoinPackageQuote | null;
  walletCoins: number;
  email: string;
  paymentStatus: string;
  termsAccepted: boolean;
  coinPolicyAcknowledged: boolean;
  coinPolicyVisible: boolean;
  coinPolicyDisclosure: string;
  mayaPackageConfirmed: boolean;
  submitting: boolean;
  onClose: () => void;
  onSelectPackage: (packageId: string) => void;
  onEmailChange: (email: string) => void;
  onTermsChange: (accepted: boolean) => void;
  onAcknowledgeCoinPolicy: () => void;
  onAskMaya: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

const coinImage = "/branding/green-coin.png";

export default function LiveCoinPurchaseOverlay({
  packages,
  selectedPackageId,
  selectedPackageQuote,
  walletCoins,
  email,
  paymentStatus,
  termsAccepted,
  coinPolicyAcknowledged,
  coinPolicyVisible,
  coinPolicyDisclosure,
  mayaPackageConfirmed,
  submitting,
  onClose,
  onSelectPackage,
  onEmailChange,
  onTermsChange,
  onAcknowledgeCoinPolicy,
  onAskMaya,
  onSubmit
}: LiveCoinPurchaseOverlayProps) {
  const { locale, t } = useI18n();

  return <div className="live-coin-purchase-backdrop" role="presentation">
    <section className="live-coin-purchase-overlay" role="dialog" aria-modal="true" aria-labelledby="live-coin-purchase-title">
      <header className="live-coin-purchase-header">
        <div>
          <p className="kicker">{t("wallet.packages")}</p>
          <h2 id="live-coin-purchase-title">{t("wallet.addCoins")}</h2>
          <p>{t("wallet.packagesCopy")}</p>
        </div>
        <button className="icon-button" type="button" onClick={onClose} aria-label={t("contribution.reminder.close")}>×</button>
      </header>

      <div className="live-coin-purchase-balance">
        <span>{t("wallet.currentBalance")}</span>
        <strong>{formatNumber(walletCoins, locale)} {t("wallet.coins")}</strong>
      </div>

      <div className="live-coin-package-grid" role="list" aria-label={t("wallet.availablePackages")}>
        {packages.map((item) => {
          const quote = quoteCoinPackage(item);
          const selected = selectedPackageId === item.id;
          return <article className={`live-coin-package ${selected ? "is-selected" : ""} ${item.highlighted ? "is-highlighted" : ""}`} role="listitem" key={item.id}>
            {item.badge ? <span className="coin-package-badge">{item.badge}</span> : null}
            <p>{item.name}</p>
            <h3>{formatCurrency(quote.amount, locale)}</h3>
            <Image className="live-coin-art" src={coinImage} alt="" aria-hidden="true" width={56} height={56} />
            <small className="live-coin-package-description">{item.description}</small>
            <dl className="live-coin-breakdown">
              <div><dt>{t("wallet.base")}</dt><dd>{formatNumber(quote.baseCoins, locale)}</dd></div>
              <div><dt>{t("wallet.bonus")}</dt><dd>+ {formatNumber(quote.bonusCoins, locale)}</dd></div>
              <div className="live-coin-total"><dt>{t("wallet.total")}</dt><dd>{formatNumber(quote.totalCoins, locale)} {t("wallet.coins")}</dd></div>
            </dl>
            <small>{t("wallet.bonusPercent", { percent: quote.bonusPercent })}</small>
            <button className="coin-package-choose" type="button" aria-pressed={selected} aria-label={t("wallet.chooseLabel", { name: item.name, amount: formatCurrency(quote.amount, locale), coins: formatNumber(quote.totalCoins, locale) })} onClick={() => onSelectPackage(item.id)}>
              {selected ? t("wallet.selected") : t("wallet.choose")}
            </button>
          </article>;
        })}
      </div>

      <section className="live-coin-purchase-confirmation" aria-live="polite">
        <div>
          <strong>{t("wallet.confirmPackage")}</strong>
          <span>{selectedPackageQuote ? t("wallet.payReceive", { amount: formatCurrency(selectedPackageQuote.amount, locale), coins: formatNumber(selectedPackageQuote.totalCoins, locale) }) : t("wallet.chooseContinue")}</span>
        </div>
        <button className="maya-confirm-button" type="button" disabled={!selectedPackageQuote} onClick={onAskMaya}>{t("wallet.askMaya")}</button>
      </section>

      <form className="live-coin-purchase-form" onSubmit={onSubmit}>
        <label>{t("payment.receiptEmail")}<input type="email" value={email} onChange={(event) => onEmailChange(event.target.value)} placeholder="you@example.com" /></label>
        {coinPolicyVisible ? <label className="check-row"><input type="checkbox" checked={coinPolicyAcknowledged} onChange={(event) => { if (event.target.checked) onAcknowledgeCoinPolicy(); }} /> {coinPolicyDisclosure}</label> : null}
        <label className="check-row"><input type="checkbox" checked={termsAccepted} onChange={(event) => onTermsChange(event.target.checked)} /> {t("purchase.termsPrefix")} {t("footer.terms")}</label>
        <button className="primary" type="submit" disabled={!selectedPackageQuote || !termsAccepted || submitting} aria-busy={submitting}>{mayaPackageConfirmed ? t("wallet.askMaya") : t("wallet.chooseContinue")}</button>
        <p className="live-coin-purchase-status" role="status">{paymentStatus}</p>
      </form>
      <p className="live-coin-purchase-note">{t("purchase.noDeduction")}</p>
    </section>
  </div>;
}
