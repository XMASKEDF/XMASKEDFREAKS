"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import StoreHeader from "@/components/store/StoreHeader";
import { useAccount } from "@/components/account/AccountProvider";
import { useI18n } from "@/components/I18nProvider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { coinsToUsdMinor, type FeetRequestPreset } from "@/lib/feet/types";

type FeetPayload = { configured: boolean; presets: FeetRequestPreset[] };

const money = (minor: number) => `$${(minor / 100).toFixed(2)}`;

export default function FeetRequests() {
  const { account, refresh } = useAccount();
  const { t } = useI18n();
  const [data, setData] = useState<FeetPayload>({ configured: false, presets: [] });
  const [selected, setSelected] = useState<FeetRequestPreset | null>(null);
  const [details, setDetails] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch("/api/feet", { cache: "no-store" }).then(async (response) => {
      const next = await response.json().catch(() => null) as FeetPayload | null;
      if (response.ok && next) setData(next);
    }).catch(() => undefined);
  }, []);

  async function confirmRequest() {
    if (!selected || busy) return;
    setBusy(true);
    setMessage("");
    let token: string | null = null;
    try {
      token = (await createSupabaseBrowserClient().auth.getSession()).data.session?.access_token || null;
    } catch {
      token = null;
    }
    if (!token) {
      setMessage(t("feet.signInRequired"));
      setBusy(false);
      return;
    }
    const response = await fetch("/api/feet", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
      body: JSON.stringify({ presetId: selected.id, requestDetails: details })
    }).catch(() => null);
    const result = await response?.json().catch(() => ({})) as { code?: string; message?: string; tokenBalance?: number; request?: unknown };
    if (response?.ok) {
      setMessage(t("feet.requestSubmitted"));
      setSelected(null);
      setDetails("");
      await refresh();
    } else if (result.code === "INSUFFICIENT_TOKENS") setMessage(`${result.message || t("feet.requestFailed")} ${t("feet.buyCoinsHint")}`);
    else setMessage(result.message || t("feet.requestFailed"));
    setBusy(false);
  }

  const insufficientCoins = account.balance !== null && selected !== null && account.balance < selected.coinPrice;

  return <main className="feet-page">
    <StoreHeader />
    <section className="feet-hero">
      <div><p className="kicker">{t("feet.kicker")}</p><h1>{t("feet.title")}</h1><p>{t("feet.intro")}</p></div>
      <aside><span>{t("wallet.currentBalance")}</span><strong>{account.balance === null ? "—" : `${account.balance} ${t("feet.coins")}`}</strong><Link className="secondary" href="/account">{t("feet.account")}</Link></aside>
    </section>
    <section className="feet-request-section" aria-labelledby="feet-requests-title">
      <header><div><p className="kicker">{t("feet.kicker")}</p><h2 id="feet-requests-title">{t("feet.requestsTitle")}</h2><p>{t("feet.requestsIntro")}</p></div><span className="feet-site-note">{t("feet.siteWallet")}</span></header>
      {data.presets.length ? <div className="feet-request-grid">{data.presets.map((preset) => {
        const available = preset.status === "ACTIVE";
        return <article className={`feet-request-card ${available ? "is-available" : "is-unavailable"}`} key={preset.id}>
        <div className="feet-request-image">{preset.thumbnailUrl ? <Image src={preset.thumbnailUrl} alt={`${preset.name} preview`} fill sizes="(max-width: 720px) 100vw, (max-width: 980px) 50vw, 33vw" /> : <span aria-hidden="true">◉</span>}</div>
        <div className="feet-request-card-content"><div className="feet-request-meta"><span>FEET REQUEST</span><b>{available ? "AVAILABLE" : preset.status}</b></div><h3>{preset.name}</h3><p>{preset.description}</p><div className="feet-request-price"><strong>{preset.coinPrice} {t("feet.coins")}</strong><span>{money(coinsToUsdMinor(preset.coinPrice))}</span></div><button className="primary" type="button" disabled={!available} onClick={() => { setSelected(preset); setMessage(""); }}>{available ? t("feet.request") : preset.status}</button></div>
      </article>;
      })}</div> : <p className="admin-empty-state">{t("feet.noRequests")}</p>}
    </section>
    {message ? <p className="feet-status" role="status">{message}</p> : null}
    {selected ? <div className="feet-confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setSelected(null); }}>
      <section className="feet-confirm" role="dialog" aria-modal="true" aria-labelledby="feet-confirm-title">
        <header><div><p className="kicker">{t("feet.confirmKicker")}</p><h2 id="feet-confirm-title">{selected.name}</h2></div><button className="icon-button" type="button" onClick={() => setSelected(null)} aria-label={t("feet.close")}>×</button></header>
        <p>{selected.description}</p>
        <div className="feet-confirm-summary">
          <span>{t("feet.price")}<strong>{selected.coinPrice} {t("feet.coins")} · {money(coinsToUsdMinor(selected.coinPrice))}</strong></span>
          <span>{t("feet.balance")}<strong>{account.balance === null ? "—" : `${account.balance} ${t("feet.coins")}`}</strong></span>
          <span>{t("feet.remaining")}<strong>{account.balance === null ? "—" : `${Math.max(0, account.balance - selected.coinPrice)} ${t("feet.coins")}`}</strong></span>
        </div>
        <label>{t("feet.details")}<textarea value={details} maxLength={1000} rows={4} onChange={(event) => setDetails(event.target.value)} placeholder={t("feet.detailsPlaceholder")} /></label>
        <p className="feet-confirm-note">{t("feet.fulfillmentNote")}</p>
        <footer>
          <button className="secondary" type="button" disabled={busy} onClick={() => setSelected(null)}>{t("feet.cancel")}</button>
          <button className="primary" type="button" disabled={busy || account.balance === null} onClick={() => { if (insufficientCoins) window.location.assign("/live#coin-packages"); else void confirmRequest(); }}>{busy ? t("feet.submitting") : insufficientCoins ? t("feet.buyCoins") : t("feet.confirm")}</button>
        </footer>
      </section>
    </div> : null}
  </main>;
}
