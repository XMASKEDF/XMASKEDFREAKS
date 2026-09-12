"use client";

import { useEffect, useState } from "react";
import { useAccount } from "@/components/account/AccountProvider";

type FavoriteProduct = {
  id: string;
  productType: string;
  title: string;
  imageUrl: string;
  href: string;
};

export default function FavoriteButton({ product }: { product: FavoriteProduct }) {
  const { account, setFavorite } = useAccount();
  const [busy, setBusy] = useState(false);
  const favorite = account.favorites.some((item) => item.id === product.id && item.productType === product.productType);
  const guestKey = `xmf-guest-favorite:${product.productType}:${product.id}`;
  const [guestFavorite, setGuestFavorite] = useState(false);
  useEffect(() => { if (!account.authenticated) setGuestFavorite(localStorage.getItem(guestKey) === "1"); }, [account.authenticated, guestKey]);

  async function toggle() {
    if (!account.authenticated) { const next = !guestFavorite; setGuestFavorite(next); localStorage.setItem(guestKey, next ? "1" : "0"); return; }
    if (busy) return;
    setBusy(true);
    await setFavorite(product, !favorite);
    setBusy(false);
  }

  return (
    <button
      className={`account-favorite-button ${(account.authenticated ? favorite : guestFavorite) ? "is-favorite" : ""}`}
      type="button"
      disabled={busy}
      aria-pressed={account.authenticated ? favorite : guestFavorite}
      aria-label={`${(account.authenticated ? favorite : guestFavorite) ? "Remove" : "Add"} ${product.title} ${(account.authenticated ? favorite : guestFavorite) ? "from" : "to"} favorites`}
      title={(account.authenticated ? favorite : guestFavorite) ? "Remove from favorites" : "Add to favorites"}
      onClick={() => void toggle()}
    >
      <span aria-hidden="true">{favorite ? "♥" : "♡"}</span>
    </button>
  );
}
