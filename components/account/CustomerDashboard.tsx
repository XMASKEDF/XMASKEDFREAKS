"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import BrandLogo from "@/components/BrandLogo";
import PublicNavigation from "@/components/PublicNavigation";
import { useAccount } from "@/components/account/AccountProvider";
import { useI18n } from "@/components/I18nProvider";
import { formatLanguageLabel, languageOptions } from "@/lib/i18n";
import { validateNickname } from "@/lib/account/nickname";
import type { CustomerProductReference } from "@/lib/account/types";

type AuthMode = "signin" | "signup";
type Availability = { state: "idle" | "checking" | "available" | "invalid" | "taken"; message: string };

function formatDate(value: string, locale: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function ProductTile({ item, favorite, onFavorite }: { item: CustomerProductReference; favorite: boolean; onFavorite: () => void }) {
  return (
    <article className="customer-product-tile">
      <Link href={item.href}>
        <Image src={item.imageUrl || "/branding/optimized/mask-logo-256.png"} alt="" width={240} height={150} unoptimized={item.imageUrl.startsWith("http")} />
        <span>{item.badge ? <b>{item.badge}</b> : null}<strong>{item.title}</strong><small>{item.productType}</small></span>
      </Link>
      <button type="button" aria-label={favorite ? `Remove ${item.title} from favorites` : `Add ${item.title} to favorites`} aria-pressed={favorite} onClick={onFavorite}>{favorite ? "♥" : "♡"}</button>
    </article>
  );
}

export default function CustomerDashboard() {
  const { account, loading, authBusy, message, signIn, signUp, signOut, updateNickname, updateEmail, updatePassword, updateProfileSettings, setFavorite } = useAccount();
  const { locale, setLocale, t } = useI18n();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [availability, setAvailability] = useState<Availability>({ state: "idle", message: "" });
  const [orderSearch, setOrderSearch] = useState("");
  const [orderType, setOrderType] = useState("all");
  const [orderSort, setOrderSort] = useState("newest");
  const [settingsNickname, setSettingsNickname] = useState("");
  const [settingsEmail, setSettingsEmail] = useState("");
  const [settingsPassword, setSettingsPassword] = useState("");
  const [settingsLanguage, setSettingsLanguage] = useState(locale);
  const [settingsAvatar, setSettingsAvatar] = useState("");
  const [liveAlerts, setLiveAlerts] = useState(true);
  const [productUpdates, setProductUpdates] = useState(true);

  useEffect(() => {
    setSettingsNickname(account.nickname);
    setSettingsEmail(account.email);
    setSettingsLanguage(account.preferredLanguage || locale);
    setSettingsAvatar(account.avatarUrl || "");
    setLiveAlerts(account.liveAlertsEnabled);
    setProductUpdates(account.productUpdatesEnabled);
  }, [account, locale]);

  useEffect(() => {
    if (mode !== "signup") return;
    const validation = validateNickname(nickname);
    if (!validation.valid) {
      setAvailability({ state: nickname ? "invalid" : "idle", message: nickname ? validation.message : "" });
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setAvailability({ state: "checking", message: t("account.checking") });
      const response = await fetch(`/api/account/nickname?value=${encodeURIComponent(validation.normalized)}`, { cache: "no-store", signal: controller.signal }).catch(() => null);
      if (!response) return;
      const result = await response.json() as { available?: boolean; message?: string };
      setAvailability({ state: result.available ? "available" : "taken", message: result.message || (result.available ? t("account.available") : t("account.taken")) });
    }, 320);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [mode, nickname, t]);

  const visibleOrders = useMemo(() => account.orders
    .filter((order) => `${order.productName} ${order.orderNumber}`.toLowerCase().includes(orderSearch.toLowerCase()))
    .filter((order) => orderType === "all" ? true : orderType === "digital" ? order.digital : order.productType === orderType)
    .sort((a, b) => orderSort === "oldest" ? a.createdAt.localeCompare(b.createdAt) : orderSort === "highest" ? b.coinsPaid - a.coinsPaid : b.createdAt.localeCompare(a.createdAt)), [account.orders, orderSearch, orderSort, orderType]);
  const digitalOrders = useMemo(() => account.orders.filter((order) => order.digital), [account.orders]);
  const physicalOrders = useMemo(() => account.orders.filter((order) => !order.digital), [account.orders]);
  const favoriteIds = useMemo(() => new Set(account.favorites.map((item) => `${item.productType}:${item.id}`)), [account.favorites]);
  const greeting = useMemo(() => {
    const options = [t("account.welcomeBack", { name: account.nickname }), t("account.goodToSee"), t("account.readyNew")];
    return options[new Date().getDate() % options.length];
  }, [account.nickname, t]);

  async function submitAuth(event: FormEvent) {
    event.preventDefault();
    if (mode === "signup") await signUp(email, password, nickname);
    else await signIn(email, password);
  }

  if (loading) return <main className="customer-account-page"><p className="customer-loading" role="status">{t("account.loading")}</p></main>;

  return (
    <main className="customer-account-page">
      <header className="site-header customer-account-header"><BrandLogo href="/" priority /><PublicNavigation /></header>
      {!account.authenticated ? (
        <section className="customer-auth-panel" aria-labelledby="customer-auth-title">
          <p className="kicker">{t("account.kicker")}</p>
          <h1 id="customer-auth-title">{mode === "signin" ? t("account.signIn") : t("account.signUp")}</h1>
          <p>{t("account.authCopy")}</p>
          <div className="customer-auth-switch" role="group" aria-label={t("account.authMode")}>
            <button type="button" className={mode === "signin" ? "is-active" : ""} onClick={() => setMode("signin")}>{t("account.signIn")}</button>
            <button type="button" className={mode === "signup" ? "is-active" : ""} onClick={() => setMode("signup")}>{t("account.signUp")}</button>
          </div>
          <form onSubmit={submitAuth}>
            {mode === "signup" ? <label>{t("account.nickname")}<input required minLength={3} maxLength={20} pattern="[A-Za-z0-9_]+" autoComplete="nickname" value={nickname} onChange={(event) => setNickname(event.target.value)} aria-describedby="nickname-status" /><span id="nickname-status" className={`nickname-status ${availability.state}`} aria-live="polite">{availability.message}</span></label> : null}
            <label>{t("auth.email")}<input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
            <label>{t("account.password")}<input type="password" required minLength={8} autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
            {mode === "signup" ? <p className="account-policy-links">By creating an account, you agree to the <Link href="/policies#terms" target="_blank">Terms of Service</Link> and acknowledge the <Link href="/policies#privacy" target="_blank">Privacy Policy</Link>.</p> : null}
            <button className="primary" type="submit" disabled={authBusy || (mode === "signup" && availability.state !== "available")}>{authBusy ? t("account.working") : mode === "signin" ? t("account.signIn") : t("account.create")}</button>
          </form>
          <p className="status-line" role="status">{message}</p>
        </section>
      ) : (
        <>
          <section className="customer-dashboard-intro">
            <div><p className="kicker">{t("account.dashboard")}</p><h1>{greeting}</h1><p>{t("account.dashboardCopy")}</p></div>
            <button className="secondary" type="button" onClick={() => void signOut()}>{t("account.signOut")}</button>
          </section>

          <section className="customer-balance-band" aria-labelledby="balance-title">
            <div><small id="balance-title">{t("account.currentBalance")}</small><strong><Image src="/branding/green-coin.png" alt="" aria-hidden="true" width={46} height={46} />{new Intl.NumberFormat(locale).format(account.balance || 0)}</strong><Link className="primary" href="/#coin-packages">{t("account.addCoins")}</Link></div>
            <dl>
              <div><dt>{t("account.lastDeposit")}</dt><dd>{account.lastDeposit ? `+${account.lastDeposit.amount} · ${formatDate(account.lastDeposit.createdAt, locale)}` : t("account.noneYet")}</dd></div>
              <div><dt>{t("account.lastPurchase")}</dt><dd>{account.lastPurchase ? `${account.lastPurchase.amount} · ${formatDate(account.lastPurchase.createdAt, locale)}` : t("account.noneYet")}</dd></div>
            </dl>
          </section>

          <section className="customer-dashboard-section" aria-labelledby="recent-orders-title">
            <div className="customer-section-heading"><div><p className="kicker">{t("account.purchases")}</p><h2 id="recent-orders-title">{t("account.recentOrders")}</h2></div></div>
            <div className="customer-order-toolbar">
              <label>{t("account.search")}<input type="search" value={orderSearch} onChange={(event) => setOrderSearch(event.target.value)} /></label>
              <label>{t("account.category")}<select value={orderType} onChange={(event) => setOrderType(event.target.value)}><option value="all">{t("account.all")}</option><option value="physical">{t("account.merch")}</option><option value="audio">{t("account.audio")}</option><option value="painting">{t("account.paintings")}</option><option value="digital">{t("account.digital")}</option></select></label>
              <label>{t("account.sort")}<select value={orderSort} onChange={(event) => setOrderSort(event.target.value)}><option value="newest">{t("account.newest")}</option><option value="oldest">{t("account.oldest")}</option><option value="highest">{t("account.highest")}</option></select></label>
            </div>
            {visibleOrders.length ? <div className="customer-order-list">{visibleOrders.map((order) => (
              <details key={order.id}>
                <summary><Image src={order.imageUrl || "/branding/optimized/mask-logo-256.png"} alt="" width={64} height={64} unoptimized={order.imageUrl.startsWith("http")} /><span><strong>{order.productName}</strong><small>{formatDate(order.createdAt, locale)} · {order.status}</small></span><b>{order.coinsPaid} {t("account.coins")}</b></summary>
                <div><span>{t("account.invoice")}<strong>{order.orderNumber}</strong></span><span>{t("account.type")}<strong>{order.productType}</strong></span>{order.merchandiseCoins !== null ? <span>{t("account.merchandiseCoins")}<strong>{order.merchandiseCoins}</strong></span> : null}{order.shippingCoins !== null ? <span>{t("account.shippingCoins")}<strong>{order.shippingCoins}</strong></span> : null}{order.taxCoins !== null ? <span>{t("account.taxCoins")}<strong>{order.taxCoins}</strong></span> : null}{order.trackingNumber ? <span>{t("account.tracking")}<strong>{order.trackingUrl ? <a href={order.trackingUrl} target="_blank" rel="noreferrer">{order.trackingNumber}</a> : order.trackingNumber}</strong></span> : null}{order.downloadUrl ? <a className="primary" href={order.downloadUrl}>{t("account.downloadAgain")}</a> : <span>{t("account.orderDetails")}<strong>{order.status}</strong></span>}</div>
              </details>
            ))}</div> : <div className="customer-empty-state"><h3>{t("account.noPurchases")}</h3><p>{t("account.noPurchasesCopy")}</p><Link className="primary" href="/merch">{t("account.exploreMerch")}</Link></div>}
          </section>

          <section className="customer-dashboard-columns customer-library-columns">
            <section className="customer-dashboard-section" aria-labelledby="digital-library-title">
              <div className="customer-section-heading"><div><p className="kicker">{t("account.digital")}</p><h2 id="digital-library-title">{t("account.digitalLibrary")}</h2></div></div>
              {digitalOrders.length ? <div className="customer-library-list">{digitalOrders.map((order) => <article key={order.id}><div><strong>{order.productName}</strong><small>{formatDate(order.createdAt, locale)} · {order.status}</small></div>{order.downloadUrl ? <a className="primary" href={order.downloadUrl}>{t("account.downloadAgain")}</a> : <span>{t("account.downloadUnavailable")}</span>}</article>)}</div> : <div className="customer-empty-state"><p>{t("account.noDigitalPurchases")}</p></div>}
            </section>
            <section className="customer-dashboard-section" aria-labelledby="physical-orders-title">
              <div className="customer-section-heading"><div><p className="kicker">{t("account.purchases")}</p><h2 id="physical-orders-title">{t("account.physicalOrders")}</h2></div></div>
              {physicalOrders.length ? <div className="customer-library-list">{physicalOrders.map((order) => <article key={order.id}><div><strong>{order.productName}</strong><small>{formatDate(order.createdAt, locale)} · {order.status}</small></div><span>{order.trackingNumber ? t("account.trackingReady") : t("account.fulfillmentPending")}</span></article>)}</div> : <div className="customer-empty-state"><p>{t("account.noPhysicalOrders")}</p></div>}
            </section>
          </section>

          <section className="customer-dashboard-section" aria-labelledby="account-notifications-title">
            <div className="customer-section-heading"><div><p className="kicker">{t("notifications.kicker")}</p><h2 id="account-notifications-title">{t("account.notifications")}</h2></div><Link href="/notifications">{t("notifications.viewAll")}</Link></div>
            {account.notifications.length ? <div className="customer-notification-list">{account.notifications.map((notice) => <article className={notice.readAt ? "" : "is-unread"} key={notice.id}><div><strong>{notice.title}</strong><p>{notice.message}</p><small>{formatDate(notice.createdAt, locale)} · {notice.priority}</small></div>{notice.destinationUrl?.startsWith("/") ? <Link className="secondary" href={notice.destinationUrl}>{t("notifications.open")}</Link> : null}</article>)}</div> : <div className="customer-empty-state"><p>{t("notifications.empty")}</p></div>}
          </section>

          <section className="customer-dashboard-section" aria-labelledby="whats-new-title">
            <div className="customer-section-heading"><div><p className="kicker">{t("account.discover")}</p><h2 id="whats-new-title">{t("account.whatsNew")}</h2></div></div>
            {account.whatsNew.length ? <div className="customer-product-grid">{account.whatsNew.map((item) => <ProductTile key={`${item.productType}:${item.id}`} item={item} favorite={favoriteIds.has(`${item.productType}:${item.id}`)} onFavorite={() => void setFavorite(item, !favoriteIds.has(`${item.productType}:${item.id}`))} />)}</div> : <div className="customer-empty-state"><h3>{t("account.noReleases")}</h3><p>{t("account.noReleasesCopy")}</p></div>}
          </section>

          <section className="customer-dashboard-columns">
            <section className="customer-dashboard-section" aria-labelledby="favorites-title"><div className="customer-section-heading"><h2 id="favorites-title">{t("account.favorites")}</h2></div>{account.favorites.length ? <div className="customer-compact-links">{account.favorites.map((item) => <Link href={item.href} key={`${item.productType}:${item.id}`}>{item.title}<small>{item.productType}</small></Link>)}</div> : <div className="customer-empty-state"><p>{t("account.noFavorites")}</p><Link href="/merch">{t("account.startSaving")}</Link></div>}</section>
            <section className="customer-dashboard-section" aria-labelledby="recently-viewed-title"><div className="customer-section-heading"><h2 id="recently-viewed-title">{t("account.recentlyViewed")}</h2></div>{account.recentlyViewed.length ? <div className="customer-compact-links">{account.recentlyViewed.map((item) => <Link href={item.href} key={`${item.productType}:${item.id}`}>{item.title}<small>{formatDate(item.createdAt, locale)}</small></Link>)}</div> : <div className="customer-empty-state"><p>{t("account.noRecent")}</p></div>}</section>
          </section>

          <section className="customer-dashboard-section" aria-labelledby="high-scores-title"><div className="customer-section-heading"><h2 id="high-scores-title">My High Scores</h2></div>{account.highScores.length ? <div className="wallet-history-table" role="table">{account.highScores.map((score) => <div role="row" key={score.gameId}><span role="cell">{score.gameTitle}</span><strong role="cell">{score.score.toLocaleString(locale)}</strong><span role="cell">{score.difficulty} · {score.roundLevel === null ? "—" : `Round ${score.roundLevel}`}</span><small role="cell">{formatDate(score.achievedAt, locale)}</small></div>)}</div> : <div className="customer-empty-state"><p>No high scores recorded yet.</p><Link href="/games">Play a game</Link></div>}</section>

          <section className="customer-dashboard-columns">
            <section className="customer-dashboard-section" aria-labelledby="wallet-history-title"><div className="customer-section-heading"><h2 id="wallet-history-title">{t("account.walletHistory")}</h2></div>{account.walletHistory.length ? <div className="wallet-history-table" role="table">{account.walletHistory.map((entry) => <div role="row" key={entry.id}><span role="cell">{formatDate(entry.createdAt, locale)}</span><span role="cell">{entry.reason}</span><strong role="cell" className={entry.amount >= 0 ? "positive" : "negative"}>{entry.amount >= 0 ? "+" : ""}{entry.amount}</strong><span role="cell">{entry.runningBalance}</span></div>)}</div> : <div className="customer-empty-state"><p>{t("account.noWalletHistory")}</p></div>}</section>
            <section className="customer-dashboard-section" aria-labelledby="activity-title"><div className="customer-section-heading"><h2 id="activity-title">{t("account.recentActivity")}</h2></div>{account.activity.length ? <div className="customer-activity-list">{account.activity.map((entry) => <p key={entry.id}><strong>{entry.title}</strong><span>{entry.detail}</span><small>{formatDate(entry.createdAt, locale)}</small></p>)}</div> : <div className="customer-empty-state"><p>{t("account.noActivity")}</p></div>}</section>
          </section>

          <section className="customer-dashboard-section customer-settings" aria-labelledby="account-settings-title">
            <div className="customer-section-heading"><div><p className="kicker">{t("account.profile")}</p><h2 id="account-settings-title">{t("account.settings")}</h2></div></div>
            <form onSubmit={(event) => { event.preventDefault(); void updateNickname(settingsNickname); }}>
              <label>{t("account.nickname")}<input minLength={3} maxLength={20} pattern="[A-Za-z0-9_]+" value={settingsNickname} onChange={(event) => setSettingsNickname(event.target.value)} /></label>
              <button className="primary" type="submit">{t("account.saveNickname")}</button>
            </form>
            <form onSubmit={(event) => { event.preventDefault(); void updateEmail(settingsEmail); }}>
              <label>{t("auth.email")}<input type="email" autoComplete="email" value={settingsEmail} onChange={(event) => setSettingsEmail(event.target.value)} /></label>
              <button className="primary" type="submit">{t("account.saveEmail")}</button>
            </form>
            <form onSubmit={(event) => { event.preventDefault(); void updatePassword(settingsPassword).then((saved) => { if (saved) setSettingsPassword(""); }); }}>
              <label>{t("account.newPassword")}<input type="password" minLength={8} autoComplete="new-password" value={settingsPassword} onChange={(event) => setSettingsPassword(event.target.value)} /></label>
              <button className="primary" type="submit" disabled={settingsPassword.length < 8}>{t("account.savePassword")}</button>
            </form>
            <form className="customer-preferences-form" onSubmit={(event) => {
              event.preventDefault();
              void updateProfileSettings({ preferredLanguage: settingsLanguage, avatarUrl: settingsAvatar, liveAlertsEnabled: liveAlerts, productUpdatesEnabled: productUpdates }).then((saved) => {
                if (saved) setLocale(settingsLanguage);
              });
            }}>
              <label>{t("account.language")}<select value={settingsLanguage} onChange={(event) => setSettingsLanguage(event.target.value)}>{languageOptions.filter((option) => option.enabled).map((option) => <option value={option.code} key={option.code}>{formatLanguageLabel(option.nativeName, option.name)}</option>)}</select></label>
              <label>{t("account.profileImage")}<input type="url" inputMode="url" placeholder="https://…" value={settingsAvatar} onChange={(event) => setSettingsAvatar(event.target.value)} /></label>
              <label className="customer-check-row"><input type="checkbox" checked={liveAlerts} onChange={(event) => setLiveAlerts(event.target.checked)} />{t("account.liveAlerts")}</label>
              <label className="customer-check-row"><input type="checkbox" checked={productUpdates} onChange={(event) => setProductUpdates(event.target.checked)} />{t("account.productUpdates")}</label>
              <button className="primary" type="submit">{t("account.savePreferences")}</button>
            </form>
            <p role="status">{message}</p>
          </section>
        </>
      )}
    </main>
  );
}
