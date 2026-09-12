"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { EMPTY_CUSTOMER_ACCOUNT, type CustomerAccountState } from "@/lib/account/types";

type AccountContextValue = {
  account: CustomerAccountState;
  loading: boolean;
  authBusy: boolean;
  message: string;
  refresh: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<boolean>;
  signUp: (email: string, password: string, nickname: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  updateNickname: (nickname: string) => Promise<boolean>;
  updateEmail: (email: string) => Promise<boolean>;
  updatePassword: (password: string) => Promise<boolean>;
  updateProfileSettings: (settings: { preferredLanguage: string; avatarUrl: string; liveAlertsEnabled: boolean; productUpdatesEnabled: boolean }) => Promise<boolean>;
  setFavorite: (product: { id: string; productType: string; title: string; imageUrl: string; href: string }, favorite: boolean) => Promise<boolean>;
  recordRecentView: (product: { id: string; productType: string; title: string; imageUrl: string; href: string }) => Promise<void>;
};

const AccountContext = createContext<AccountContextValue | null>(null);

export default function AccountProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<CustomerAccountState>(EMPTY_CUSTOMER_ACCOUNT);
  const [loading, setLoading] = useState(true);
  const [authBusy, setAuthBusy] = useState(false);
  const [message, setMessage] = useState("");
  const clientRef = useRef<SupabaseClient | null>(null);
  const refreshPromiseRef = useRef<Promise<void> | null>(null);
  const authRequestRef = useRef(false);

  const client = useCallback(() => {
    if (clientRef.current) return clientRef.current;
    try {
      clientRef.current = createSupabaseBrowserClient();
      return clientRef.current;
    } catch {
      return null;
    }
  }, []);

  const token = useCallback(async () => {
    const supabase = client();
    if (!supabase) return null;
    return (await supabase.auth.getSession()).data.session?.access_token || null;
  }, [client]);

  const publishWallet = useCallback((next: CustomerAccountState) => {
    if (typeof window === "undefined" || next.balance === null) return;
    window.dispatchEvent(new CustomEvent("xmf:wallet-updated", { detail: { balance: next.balance, source: "account" } }));
    try {
      const channel = new BroadcastChannel("xmf-account-sync");
      channel.postMessage({ type: "wallet", balance: next.balance, at: Date.now() });
      channel.close();
    } catch {
      localStorage.setItem("xmf-wallet-sync", JSON.stringify({ balance: next.balance, at: Date.now() }));
    }
  }, []);

  const refresh = useCallback(async () => {
    if (refreshPromiseRef.current) return refreshPromiseRef.current;
    refreshPromiseRef.current = (async () => {
      const accessToken = await token();
      if (!accessToken) {
        setAccount(EMPTY_CUSTOMER_ACCOUNT);
        setLoading(false);
        return;
      }
      const response = await fetch("/api/account", { cache: "no-store", headers: { authorization: `Bearer ${accessToken}` } }).catch(() => null);
      if (response?.ok) {
        const next = await response.json() as CustomerAccountState;
        setAccount(next);
        publishWallet(next);
      }
      setLoading(false);
    })().finally(() => { refreshPromiseRef.current = null; });
    return refreshPromiseRef.current;
  }, [publishWallet, token]);

  useEffect(() => {
    const supabase = client();
    if (!supabase) {
      setLoading(false);
      return;
    }
    void refresh();
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setAccount(EMPTY_CUSTOMER_ACCOUNT);
        setLoading(false);
      } else void refresh();
    });
    return () => data.subscription.unsubscribe();
  }, [client, refresh]);

  useEffect(() => {
    const onWallet = (event: Event) => {
      const detail = (event as CustomEvent<{ balance?: number; source?: string }>).detail;
      const balance = Number(detail?.balance);
      if (Number.isFinite(balance)) setAccount((current) => ({ ...current, balance: Math.max(0, Math.floor(balance)) }));
      if (detail?.source !== "account") void refresh();
    };
    const applySyncedBalance = (value: unknown) => {
      const balance = Number((value as { balance?: number } | null)?.balance);
      if (Number.isFinite(balance)) setAccount((current) => ({ ...current, balance: Math.max(0, Math.floor(balance)) }));
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== "xmf-wallet-sync" || !event.newValue) return;
      try { applySyncedBalance(JSON.parse(event.newValue)); } catch { /* Ignore malformed cross-tab state. */ }
    };
    let broadcast: BroadcastChannel | null = null;
    try {
      broadcast = new BroadcastChannel("xmf-account-sync");
      broadcast.onmessage = (event) => applySyncedBalance(event.data);
    } catch {
      broadcast = null;
    }
    window.addEventListener("xmf:wallet-updated", onWallet);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("xmf:wallet-updated", onWallet);
      window.removeEventListener("storage", onStorage);
      broadcast?.close();
    };
  }, [refresh]);

  useEffect(() => {
    const supabase = client();
    if (!supabase || !account.userId) return;
    const channel = supabase
      .channel(`wallet:${account.userId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "token_wallets", filter: `user_id=eq.${account.userId}` }, () => { void refresh(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [account.userId, client, refresh]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (authRequestRef.current) return false;
    const supabase = client();
    if (!supabase) { setMessage("Account services are not connected."); return false; }
    authRequestRef.current = true;
    setAuthBusy(true);
    setMessage("Signing in…");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    authRequestRef.current = false;
    setAuthBusy(false);
    if (error) { setMessage(error.message === "Invalid login credentials" ? "The email or password is incorrect." : error.message); return false; }
    setMessage("Welcome back.");
    await refresh();
    return true;
  }, [client, refresh]);

  const signUp = useCallback(async (email: string, password: string, nickname: string) => {
    if (authRequestRef.current) return false;
    const supabase = client();
    if (!supabase) { setMessage("Account services are not connected."); return false; }
    authRequestRef.current = true;
    setAuthBusy(true);
    setMessage("Creating your account…");
    const availability = await fetch(`/api/account/nickname?value=${encodeURIComponent(nickname)}`, { cache: "no-store" }).then((response) => response.json()).catch(() => ({ available: false, message: "Nickname could not be verified." })) as { available?: boolean; normalized?: string; message?: string };
    if (!availability.available) {
      authRequestRef.current = false;
      setAuthBusy(false);
      setMessage(availability.message || "Choose another nickname.");
      return false;
    }
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { display_name: availability.normalized || nickname.trim() } }
    });
    authRequestRef.current = false;
    setAuthBusy(false);
    if (error) { setMessage(error.message); return false; }
    setMessage(data.session ? "Account created. Welcome." : "Account created. Check your email to confirm it.");
    if (data.session) {
      await fetch("/api/policies/acceptance", { method: "POST", headers: { authorization: `Bearer ${data.session.access_token}`, "content-type": "application/json" }, body: JSON.stringify({ method: "account_creation" }) }).catch(() => null);
      await refresh();
    }
    return true;
  }, [client, refresh]);

  const signOut = useCallback(async () => {
    await client()?.auth.signOut();
    setAccount(EMPTY_CUSTOMER_ACCOUNT);
    setMessage("Signed out.");
  }, [client]);

  const accountAction = useCallback(async (body: Record<string, unknown>) => {
    const accessToken = await token();
    if (!accessToken) { setMessage("Sign in to continue."); return false; }
    const response = await fetch("/api/account", {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: JSON.stringify(body)
    }).catch(() => null);
    const result = await response?.json().catch(() => ({})) as { message?: string; state?: CustomerAccountState };
    if (!response?.ok) { setMessage(result.message || "The account update did not complete."); return false; }
    if (result.state) {
      setAccount(result.state);
      publishWallet(result.state);
    }
    return true;
  }, [publishWallet, token]);

  const updateNickname = useCallback(async (nickname: string) => {
    const updated = await accountAction({ action: "nickname", nickname });
    setMessage(updated ? "Nickname updated." : "Nickname was not changed.");
    return updated;
  }, [accountAction]);

  const updateEmail = useCallback(async (email: string) => {
    const supabase = client();
    if (!supabase) { setMessage("Account services are not connected."); return false; }
    const normalized = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) { setMessage("Enter a valid email address."); return false; }
    const { error } = await supabase.auth.updateUser({ email: normalized });
    if (error) { setMessage(error.message); return false; }
    setMessage("Check your new email address to confirm the change.");
    return true;
  }, [client]);

  const updatePassword = useCallback(async (password: string) => {
    const supabase = client();
    if (!supabase) { setMessage("Account services are not connected."); return false; }
    if (password.length < 8) { setMessage("Password must contain at least 8 characters."); return false; }
    const { error } = await supabase.auth.updateUser({ password });
    if (error) { setMessage(error.message); return false; }
    setMessage("Password updated.");
    return true;
  }, [client]);

  const updateProfileSettings = useCallback(async (settings: { preferredLanguage: string; avatarUrl: string; liveAlertsEnabled: boolean; productUpdatesEnabled: boolean }) => {
    const updated = await accountAction({ action: "profile-settings", ...settings });
    setMessage(updated ? "Account preferences saved." : "Account preferences were not changed.");
    return updated;
  }, [accountAction]);

  const setFavorite = useCallback(async (product: { id: string; productType: string; title: string; imageUrl: string; href: string }, favorite: boolean) => {
    const updated = await accountAction({ action: "favorite", productId: product.id, productType: product.productType, title: product.title, imageUrl: product.imageUrl, href: product.href, favorite });
    if (updated) setMessage(favorite ? "Added to Favorites." : "Removed from Favorites.");
    return updated;
  }, [accountAction]);

  const recordRecentView = useCallback(async (product: { id: string; productType: string; title: string; imageUrl: string; href: string }) => {
    await accountAction({ action: "recent", productId: product.id, productType: product.productType, title: product.title, imageUrl: product.imageUrl, href: product.href });
  }, [accountAction]);

  const value = useMemo<AccountContextValue>(() => ({
    account,
    loading,
    authBusy,
    message,
    refresh,
    signIn,
    signUp,
    signOut,
    updateNickname,
    updateEmail,
    updatePassword,
    updateProfileSettings,
    setFavorite,
    recordRecentView
  }), [account, authBusy, loading, message, recordRecentView, refresh, setFavorite, signIn, signOut, signUp, updateEmail, updateNickname, updatePassword, updateProfileSettings]);

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount() {
  const value = useContext(AccountContext);
  if (!value) throw new Error("useAccount must be used inside AccountProvider");
  return value;
}
