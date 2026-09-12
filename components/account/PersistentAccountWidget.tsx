"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAccount } from "@/components/account/AccountProvider";
import { useI18n } from "@/components/I18nProvider";

export default function PersistentAccountWidget() {
  const pathname = usePathname();
  const { account, loading } = useAccount();
  const { locale, t } = useI18n();
  const [commerceOpen, setCommerceOpen] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const isAdminRoute = /^\/admin(?:\/|$)/.test(pathname || "");
  useEffect(() => {
    if (isAdminRoute) return;
    const onCartUpdated = (event: Event) => {
      const count = Number((event as CustomEvent<{ count?: number }>).detail?.count);
      if (Number.isFinite(count)) setCartCount(Math.max(0, Math.floor(count)));
    };
    window.addEventListener("xmf:cart-updated", onCartUpdated);
    return () => window.removeEventListener("xmf:cart-updated", onCartUpdated);
  }, [isAdminRoute, pathname]);

  if (isAdminRoute) return null;
  const balance = account.balance === null ? "—" : new Intl.NumberFormat(locale).format(account.balance);
  const openCart = () => {
    setCommerceOpen(false);
    window.dispatchEvent(new CustomEvent("xmf:cart-open"));
    window.setTimeout(() => {
      if (!document.querySelector(".purchase-modal")) window.location.assign("/merch?openCart=1");
    }, 80);
  };
  return (
    <aside className="persistent-account-widget" aria-label={t("account.walletIdentity")}>
      <Link href="/account" aria-label={account.authenticated ? t("account.openDashboard") : t("account.signIn")}>
        {account.avatarUrl ? <Image src={account.avatarUrl} alt="" width={34} height={34} /> : <span className="account-avatar" aria-hidden="true">{account.nickname.slice(0, 1).toUpperCase() || "?"}</span>}
        <span>
          <small>{loading ? t("account.syncing") : account.authenticated ? account.nickname : t("account.guest")}</small>
          <strong><Image src="/branding/green-coin.png" alt="" aria-hidden="true" width={20} height={20} />{balance} {t("account.coins")}</strong>
        </span>
      </Link>
      <button className="global-commerce-toggle" type="button" aria-label={`${t("account.walletIdentity")}. ${t("audioStore.cart")}: ${cartCount}`} aria-expanded={commerceOpen} aria-controls="global-commerce-launcher" onClick={() => setCommerceOpen((value) => !value)}>
        <Image src="/branding/green-coin.png" alt="" aria-hidden="true" width={20} height={20} /><span>{balance} {t("account.coins")}</span><span className="global-commerce-caret" aria-hidden="true">⌄</span>
      </button>
      {commerceOpen ? <div className="global-commerce-launcher" id="global-commerce-launcher" role="dialog" aria-label={t("account.walletIdentity")}>
        <strong>{t("account.walletIdentity")}</strong>
        <button className="secondary" type="button" onClick={() => window.location.assign("/live#coin-packages")}><Image src="/branding/green-coin.png" alt="" aria-hidden="true" width={18} height={18} />{t("purchase.addTokens")}</button>
        <button className="primary" type="button" onClick={openCart}><span aria-hidden="true">⌁</span>{t("audioStore.cart")} ({cartCount})</button>
      </div> : null}
    </aside>
  );
}
