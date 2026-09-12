"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type PaymentView = {
  status: string;
  purpose: string;
  expected_amount_minor: number;
  expected_currency: string;
  expected_total_coins: number;
  expected_base_coins: number;
  expected_bonus_coins: number;
  failure_reason?: string | null;
};

const pendingStatuses = new Set(["CREATED", "PENDING_REDIRECT", "REDIRECTED", "PROCESSING"]);

export default function HostedPaymentReturn({ paymentId, returnTo, cancelled = false }: { paymentId: string; returnTo?: "/live"; cancelled?: boolean }) {
  const [payment, setPayment] = useState<PaymentView | null>(null);
  const [message, setMessage] = useState("Checking the verified payment status...");
  const redirectedRef = useRef(false);

  const refresh = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const headers = token ? { authorization: `Bearer ${token}` } : undefined;
    const response = await fetch(`/api/payments/hosted/${paymentId}`, {
      cache: "no-store",
      headers
    });
    const body = await response.json().catch(() => ({})) as { payment?: PaymentView; message?: string };
    if (!response.ok || !body.payment) {
      setMessage(body.message || "Payment status is temporarily unavailable.");
      return;
    }
    setPayment(body.payment);
    const liveTip = body.payment.purpose === "tip";
    setMessage(pendingStatuses.has(body.payment.status)
      ? "The hosted payment is still processing. Live access changes only after verified confirmation."
      : body.payment.status === "CONFIRMED"
        ? liveTip ? "Live tip confirmed. Returning you to the show." : "Payment confirmed. Your wallet was credited exactly once."
        : liveTip ? "This Live tip did not complete. No contribution or access credit was added." : "This payment did not complete. No unverified wallet credit was added.");
  }, [paymentId]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 4000);
    const stop = window.setTimeout(() => window.clearInterval(timer), 60_000);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(stop);
    };
  }, [refresh]);

  useEffect(() => {
    if (!returnTo || redirectedRef.current || (!cancelled && !payment)) return;
    const terminal = cancelled || payment?.status === "CONFIRMED" || payment?.status === "FAILED" || payment?.status === "CANCELLED" || payment?.status === "DECLINED" || payment?.status === "EXPIRED";
    if (!terminal) return;
    redirectedRef.current = true;
    const timer = window.setTimeout(() => window.location.assign(`${returnTo}?payment=${cancelled ? "cancelled" : payment?.status.toLowerCase()}`), 900);
    return () => window.clearTimeout(timer);
  }, [cancelled, payment, returnTo]);

  return (
    <main className="legal-page hosted-payment-return">
      <section className="legal-card">
        <p className="kicker">SECURE HOSTED PAYMENT</p>
        <h1>{payment?.purpose === "tip" && payment.status === "CONFIRMED" ? "Tip confirmed" : payment?.status === "CONFIRMED" ? "Coins added" : "Payment status"}</h1>
        <p>{message}</p>
        {payment ? (
          <dl className="payment-return-summary">
            <div><dt>Status</dt><dd>{payment.status.replaceAll("_", " ")}</dd></div>
            <div><dt>{payment.purpose === "tip" ? "Live contribution" : "Package"}</dt><dd>{payment.expected_total_coins} coins</dd></div>
            <div><dt>Base and bonus</dt><dd>{payment.expected_base_coins} + {payment.expected_bonus_coins}</dd></div>
            <div><dt>Expected amount</dt><dd>{new Intl.NumberFormat("en-US", { style: "currency", currency: payment.expected_currency }).format(payment.expected_amount_minor / 100)}</dd></div>
          </dl>
        ) : null}
        <div className="action-row">
          <button type="button" className="primary" onClick={() => void refresh()}>Refresh status</button>
          <a className="secondary" href="/#wallet">Return to wallet</a>
        </div>
        <p className="status-line">Returning to this page does not confirm a payment. Only the payment provider’s verified server callback can add coins.</p>
      </section>
    </main>
  );
}
