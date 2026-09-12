"use client";

import { coinsToUsd } from "@/lib/contribution-policy";
import { useI18n } from "@/components/I18nProvider";

export type LiveTipReminderState = "due" | "payment_in_progress" | "success" | "failed";

type LiveTipReminderProps = {
  requiredCoins: number;
  state: LiveTipReminderState;
  onTipNow: () => void;
  onBuyCoins: () => void;
  onClose: () => void;
};

export default function LiveTipReminder({ requiredCoins, state, onTipNow, onBuyCoins, onClose }: LiveTipReminderProps) {
  const { locale, t } = useI18n();
  const amount = new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).format(coinsToUsd(requiredCoins));
  const processing = state === "payment_in_progress";
  const success = state === "success";
  const failed = state === "failed";

  return <div className="contribution-reminder-layer" role="presentation">
    <section className="contribution-reminder live-tip-reminder" role="dialog" aria-modal="false" aria-labelledby="contribution-reminder-title">
      <button type="button" className="contribution-reminder-close" aria-label={t("contribution.reminder.close")} onClick={onClose}>×</button>
      {success ? <div className="live-tip-reminder-result" role="status" aria-live="polite"><span aria-hidden="true">💋</span><h2 id="contribution-reminder-title">{t("contribution.reminder.success")}</h2></div> : <>
        <p className="live-tip-reminder-kicker">{t("contribution.reminder.title")}</p>
        <h2 id="contribution-reminder-title">{failed ? t("contribution.reminder.failed") : t("contribution.reminder.pleaseTip")}</h2>
        <strong className="live-tip-reminder-minimum">{t("contribution.reminder.minimum", { coins: requiredCoins })}</strong>
        <p className="live-tip-reminder-amount">{t("contribution.reminder.usd", { amount })}</p>
        <p className="live-tip-reminder-copy">{t("contribution.reminder.keepGoing")}</p>
        {failed ? <p className="live-tip-reminder-error" role="alert">{t("contribution.reminder.tryAgain")}</p> : null}
        <div className="live-tip-reminder-actions">
          <button type="button" className="primary" onClick={onTipNow} disabled={processing}>{processing ? t("contribution.reminder.processing") : t("contribution.reminder.tipNow")}</button>
          <button type="button" className="secondary" onClick={onBuyCoins} disabled={processing}>{t("contribution.reminder.buyCoins")}</button>
        </div>
        <small>{t("contribution.reminder.coinsAnywhere")}</small>
      </>}
    </section>
  </div>;
}
