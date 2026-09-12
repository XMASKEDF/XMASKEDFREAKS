import { NextRequest, NextResponse } from "next/server";
import { getApiUser, serviceCredentials, serviceHeaders } from "@/lib/api-user";
import { validateNickname } from "@/lib/account/nickname";
import type { CustomerAccountState, CustomerActivity, CustomerHighScore, CustomerNotification, CustomerOrder, CustomerProductReference, CustomerWalletEntry } from "@/lib/account/types";
import { EMPTY_CUSTOMER_ACCOUNT } from "@/lib/account/types";
import { extractClientIp } from "@/lib/security";

export const dynamic = "force-dynamic";

type JsonRow = Record<string, unknown>;
const limits = new Map<string, { count: number; resetAt: number }>();

function limited(key: string) {
  const now = Date.now();
  const current = limits.get(key);
  if (!current || current.resetAt < now) {
    limits.set(key, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  current.count += 1;
  return current.count > 60;
}

async function rows(responsePromise: Promise<Response>) {
  const response = await responsePromise.catch(() => null);
  return response?.ok ? await response.json() as JsonRow[] : [];
}

function productReference(row: JsonRow, dateKey: "created_at" | "viewed_at" | "published_at" = "created_at"): CustomerProductReference {
  return {
    id: String(row.product_id || row.id || ""),
    productType: String(row.product_type || "future"),
    title: String(row.title_snapshot || row.title || "Untitled"),
    imageUrl: String(row.image_url_snapshot || row.image_url || ""),
    href: String(row.href_snapshot || row.href || "/"),
    createdAt: String(row[dateKey] || row.created_at || new Date(0).toISOString()),
    badge: row.badge ? String(row.badge) : undefined
  };
}

async function customerState(userId: string, email = ""): Promise<CustomerAccountState> {
  const service = serviceCredentials();
  if (!service) return { ...EMPTY_CUSTOMER_ACCOUNT, authenticated: true, userId };
  const headers = serviceHeaders(service);
  const query = (table: string, params: string) => fetch(`${service.url}/rest/v1/${table}?${params}`, { cache: "no-store", headers });
  const now = new Date().toISOString();
  const [profiles, wallets, transactions, digitalOrders, commerceOrders, favorites, recent, whatsNew, activity, scores, notifications] = await Promise.all([
    rows(query("profiles", `id=eq.${userId}&select=display_name,avatar_url,preferred_language,email_live_alerts_enabled,product_updates_enabled&limit=1`)),
    rows(query("token_wallets", `user_id=eq.${userId}&select=balance_tokens,updated_at&limit=1`)),
    rows(query("wallet_transactions", `user_id=eq.${userId}&select=id,created_at,total_coins,note,balance_after,status,transaction_type&order=created_at.desc&limit=50`)),
    rows(query("digital_orders", `user_id=eq.${userId}&select=id,total_coins,status,created_at&order=created_at.desc&limit=25`)),
    rows(query("commerce_orders", `user_id=eq.${userId}&select=id,order_number,total_coins,merchandise_coins,shipping_coins,tax_coins,fulfillment_status,created_at&order=created_at.desc&limit=25`)),
    rows(query("customer_favorites", `user_id=eq.${userId}&select=product_id,product_type,title_snapshot,image_url_snapshot,href_snapshot,created_at&order=created_at.desc&limit=24`)),
    rows(query("customer_recent_views", `user_id=eq.${userId}&select=product_id,product_type,title_snapshot,image_url_snapshot,href_snapshot,viewed_at&order=viewed_at.desc&limit=12`)),
    rows(query("customer_whats_new", "published=eq.true&select=id,product_id,product_type,title,image_url,href,badge,published_at,created_at&order=pinned.desc,published_at.desc&limit=8")),
    rows(query("customer_activity", `user_id=eq.${userId}&select=id,activity_type,title,detail,created_at&order=created_at.desc&limit=20`)),
    rows(query("game_scores", `user_id=eq.${userId}&select=game_id,game_title,score,difficulty,round_level,created_at&order=score.desc,created_at.asc&limit=50`)),
    rows(query("customer_notifications", `user_id=eq.${userId}&dismissed_at=is.null&or=(expires_at.is.null,expires_at.gt.${now})&select=id,notification_type,title,message,destination_url,priority,read_at,created_at&order=read_at.asc.nullsfirst,created_at.desc&limit=8`))
  ]);
  const digitalOrderIds = digitalOrders.map((order) => String(order.id)).filter(Boolean);
  const commerceOrderIds = commerceOrders.map((order) => String(order.id)).filter(Boolean);
  const [digitalItems, commerceItems, fulfillments] = await Promise.all([
    digitalOrderIds.length
      ? rows(query("digital_order_items", `order_id=in.(${digitalOrderIds.join(",")})&select=id,order_id,product_id,product_name_snapshot,coin_price_snapshot,file_extension_snapshot&limit=100`))
      : Promise.resolve([]),
    commerceOrderIds.length
      ? rows(query("commerce_order_items", `order_id=in.(${commerceOrderIds.join(",")})&select=id,order_id,product_id,product_name_snapshot,product_type,image_url_snapshot,line_total_coins,entitlement_status&limit=100`))
      : Promise.resolve([]),
    commerceOrderIds.length
      ? rows(query("commerce_fulfillments", `order_id=in.(${commerceOrderIds.join(",")})&select=order_id,tracking_number,tracking_url&limit=100`))
      : Promise.resolve([])
  ]);

  const walletHistory: CustomerWalletEntry[] = transactions.map((row) => ({
    id: String(row.id),
    createdAt: String(row.created_at),
    amount: Number(row.total_coins || 0),
    reason: String(row.note || row.transaction_type || "Wallet update"),
    runningBalance: Number(row.balance_after || 0),
    status: String(row.status || "confirmed")
  }));
  const orders: CustomerOrder[] = [];
  for (const order of digitalOrders) {
    const item = digitalItems.find((candidate) => candidate.order_id === order.id);
    orders.push({
      id: String(order.id),
      orderNumber: `DIG-${String(order.id).slice(0, 8).toUpperCase()}`,
      productName: String(item?.product_name_snapshot || "Digital purchase"),
      productType: "audio",
      imageUrl: "",
      createdAt: String(order.created_at),
      coinsPaid: Number(order.total_coins || item?.coin_price_snapshot || 0),
      status: String(order.status || "completed"),
      digital: true,
      downloadUrl: item?.product_id ? `/api/audio-clips/${item.product_id}/download` : null,
      trackingNumber: null,
      trackingUrl: null,
      merchandiseCoins: null,
      shippingCoins: null,
      taxCoins: null
    });
  }
  for (const order of commerceOrders) {
    const item = commerceItems.find((candidate) => candidate.order_id === order.id);
    const fulfillment = fulfillments.find((candidate) => candidate.order_id === order.id);
    orders.push({
      id: String(order.id),
      orderNumber: String(order.order_number || `XMF-${String(order.id).slice(0, 8)}`),
      productName: String(item?.product_name_snapshot || "Store purchase"),
      productType: String(item?.product_type || "physical"),
      imageUrl: String(item?.image_url_snapshot || ""),
      createdAt: String(order.created_at),
      coinsPaid: Number(order.total_coins || item?.line_total_coins || 0),
      status: String(order.fulfillment_status || "new"),
      digital: item?.product_type === "digital",
      downloadUrl: null,
      trackingNumber: fulfillment?.tracking_number ? String(fulfillment.tracking_number) : null,
      trackingUrl: fulfillment?.tracking_url ? String(fulfillment.tracking_url) : null,
      merchandiseCoins: order.merchandise_coins === null ? null : Number(order.merchandise_coins),
      shippingCoins: order.shipping_coins === null ? null : Number(order.shipping_coins),
      taxCoins: order.tax_coins === null ? null : Number(order.tax_coins)
    });
  }
  orders.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const accountActivity: CustomerActivity[] = activity.map((row) => ({
    id: String(row.id),
    activityType: String(row.activity_type),
    title: String(row.title),
    detail: String(row.detail || ""),
    createdAt: String(row.created_at)
  }));
  const highScores: CustomerHighScore[] = [];
  for (const row of scores) {
    const gameId = String(row.game_id || "");
    if (highScores.some((score) => score.gameId === gameId)) continue;
    highScores.push({ gameId, gameTitle: String(row.game_title || gameId), score: Number(row.score || 0), difficulty: String(row.difficulty || "—"), roundLevel: row.round_level === null ? null : Number(row.round_level), achievedAt: String(row.created_at || new Date(0).toISOString()), globalRank: null });
  }
  const accountNotifications: CustomerNotification[] = notifications.map((row) => ({
    id: String(row.id),
    type: String(row.notification_type || "update"),
    title: String(row.title || "Update"),
    message: String(row.message || ""),
    destinationUrl: row.destination_url ? String(row.destination_url) : null,
    priority: String(row.priority || "normal"),
    readAt: row.read_at ? String(row.read_at) : null,
    createdAt: String(row.created_at || new Date(0).toISOString())
  }));
  const lastDeposit = walletHistory.find((entry) => entry.amount > 0) || null;
  const lastPurchase = walletHistory.find((entry) => entry.amount < 0) || null;
  return {
    authenticated: true,
    userId,
    email,
    nickname: String(profiles[0]?.display_name || ""),
    avatarUrl: profiles[0]?.avatar_url ? String(profiles[0].avatar_url) : null,
    preferredLanguage: String(profiles[0]?.preferred_language || "en"),
    liveAlertsEnabled: profiles[0]?.email_live_alerts_enabled !== false,
    productUpdatesEnabled: profiles[0]?.product_updates_enabled !== false,
    balance: Number(wallets[0]?.balance_tokens || 0),
    lastDeposit,
    lastPurchase,
    walletHistory,
    orders,
    favorites: favorites.map((row) => productReference(row)),
    recentlyViewed: recent.map((row) => productReference(row, "viewed_at")),
    whatsNew: whatsNew.map((row) => productReference(row, "published_at")),
    activity: accountActivity,
    highScores,
    notifications: accountNotifications
  };
}

export async function GET(request: NextRequest) {
  const user = await getApiUser(request);
  if (!user) return NextResponse.json(EMPTY_CUSTOMER_ACCOUNT);
  return NextResponse.json(await customerState(user.id, user.email || ""));
}

export async function POST(request: NextRequest) {
  const user = await getApiUser(request);
  if (!user) return NextResponse.json({ code: "AUTH_REQUIRED", message: "Sign in to update your account." }, { status: 401 });
  if (limited(`${user.id}:${extractClientIp(request.headers)}`)) return NextResponse.json({ code: "RATE_LIMITED", message: "Too many account updates. Wait one minute." }, { status: 429 });
  const service = serviceCredentials();
  if (!service) return NextResponse.json({ code: "ACCOUNT_UNAVAILABLE", message: "Account services are not connected." }, { status: 503 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = String(body.action || "");
  const headers = serviceHeaders(service);

  if (action === "nickname") {
    const validation = validateNickname(String(body.nickname || ""));
    if (!validation.valid) return NextResponse.json({ code: validation.code, message: validation.message }, { status: 400 });
    const response = await fetch(`${service.url}/rest/v1/profiles?id=eq.${user.id}`, {
      method: "PATCH",
      headers: serviceHeaders(service, "return=minimal"),
      body: JSON.stringify({ display_name: validation.normalized, updated_at: new Date().toISOString() })
    }).catch(() => null);
    if (!response?.ok) {
      const detail = await response?.text().catch(() => "") || "";
      return NextResponse.json({ code: detail.includes("unique") ? "TAKEN" : "UPDATE_FAILED", message: detail.includes("unique") ? "Already taken" : "Nickname could not be updated." }, { status: 409 });
    }
  } else if (action === "favorite") {
    const productId = String(body.productId || "").slice(0, 160);
    const productType = String(body.productType || "");
    if (!productId || !["merch", "audio", "painting", "digital", "physical", "future"].includes(productType)) return NextResponse.json({ code: "INVALID_PRODUCT" }, { status: 400 });
    const base = `${service.url}/rest/v1/customer_favorites?user_id=eq.${user.id}&product_type=eq.${encodeURIComponent(productType)}&product_id=eq.${encodeURIComponent(productId)}`;
    const method = body.favorite === false ? "DELETE" : "POST";
    const response = await fetch(method === "DELETE" ? base : `${service.url}/rest/v1/customer_favorites?on_conflict=user_id,product_type,product_id`, {
      method,
      headers: method === "POST" ? serviceHeaders(service, "resolution=merge-duplicates,return=minimal") : headers,
      body: method === "POST" ? JSON.stringify({
        user_id: user.id,
        product_id: productId,
        product_type: productType,
        title_snapshot: String(body.title || "Saved item").slice(0, 200),
        image_url_snapshot: String(body.imageUrl || "").slice(0, 1000),
        href_snapshot: String(body.href || "/").slice(0, 500)
      }) : undefined
    }).catch(() => null);
    if (!response?.ok) return NextResponse.json({ code: "FAVORITE_FAILED", message: "Favorite could not be saved." }, { status: 422 });
  } else if (action === "recent") {
    const productId = String(body.productId || "").slice(0, 160);
    if (!productId) return NextResponse.json({ code: "INVALID_PRODUCT" }, { status: 400 });
    const response = await fetch(`${service.url}/rest/v1/customer_recent_views?on_conflict=user_id,product_type,product_id`, {
      method: "POST",
      headers: serviceHeaders(service, "resolution=merge-duplicates,return=minimal"),
      body: JSON.stringify({
        user_id: user.id,
        product_id: productId,
        product_type: String(body.productType || "future").slice(0, 40),
        title_snapshot: String(body.title || "Recently viewed").slice(0, 200),
        image_url_snapshot: String(body.imageUrl || "").slice(0, 1000),
        href_snapshot: String(body.href || "/").slice(0, 500),
        viewed_at: new Date().toISOString()
      })
    }).catch(() => null);
    if (!response?.ok) return NextResponse.json({ code: "RECENT_FAILED", message: "Recent activity could not be saved." }, { status: 422 });
  } else if (action === "profile-settings") {
    const preferredLanguage = String(body.preferredLanguage || "en").slice(0, 12);
    const avatarUrl = String(body.avatarUrl || "").trim().slice(0, 1000);
    if (!/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/.test(preferredLanguage)) {
      return NextResponse.json({ code: "INVALID_LANGUAGE", message: "Choose a supported language." }, { status: 400 });
    }
    if (avatarUrl && !avatarUrl.startsWith("/") && !/^https:\/\//i.test(avatarUrl)) {
      return NextResponse.json({ code: "INVALID_AVATAR", message: "Profile images must use an internal or secure HTTPS address." }, { status: 400 });
    }
    const response = await fetch(`${service.url}/rest/v1/profiles?id=eq.${user.id}`, {
      method: "PATCH",
      headers: serviceHeaders(service, "return=minimal"),
      body: JSON.stringify({
        preferred_language: preferredLanguage,
        avatar_url: avatarUrl || null,
        email_live_alerts_enabled: body.liveAlertsEnabled !== false,
        product_updates_enabled: body.productUpdatesEnabled !== false,
        updated_at: new Date().toISOString()
      })
    }).catch(() => null);
    if (!response?.ok) return NextResponse.json({ code: "SETTINGS_FAILED", message: "Account settings could not be saved." }, { status: 422 });
  } else {
    return NextResponse.json({ code: "UNSUPPORTED_ACTION", message: "Unsupported account action." }, { status: 400 });
  }

  return NextResponse.json({ ok: true, state: await customerState(user.id, user.email || "") });
}
