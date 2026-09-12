import { NextRequest, NextResponse } from "next/server";
import { adminSessionCookie, auditAdminEvent, getAdminBySession, hasAdminPermission, hasRecentAdminReauthentication, isSuperAdmin } from "@/lib/admin-auth";
import { serviceCredentials, serviceHeaders } from "@/lib/api-user";
import { extractClientIp } from "@/lib/security";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

async function authorized(request: NextRequest) {
  const admin = await getAdminBySession(request.cookies.get(adminSessionCookie)?.value);
  return admin && hasAdminPermission(admin, "admin.customers.manage") ? admin : null;
}

async function serviceRows(path: string) {
  const service = serviceCredentials();
  if (!service) return [];
  const response = await fetch(`${service.url}/rest/v1/${path}`, {
    cache: "no-store",
    headers: serviceHeaders(service)
  }).catch(() => null);
  return response?.ok ? await response.json() as Row[] : [];
}

export async function GET(request: NextRequest) {
  if (!await authorized(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!serviceCredentials()) return NextResponse.json({ configured: false, customers: [], releases: [] });

  const [profiles, wallets, transactions, actions, releases] = await Promise.all([
    serviceRows("profiles?select=id,email,display_name,avatar_url,created_at&order=created_at.desc&limit=200"),
    serviceRows("token_wallets?select=user_id,balance_tokens,updated_at&limit=200"),
    serviceRows("wallet_transactions?select=id,user_id,created_at,total_coins,note,balance_after,status,transaction_type&order=created_at.desc&limit=500"),
    serviceRows("customer_admin_actions?select=id,user_id,action_type,coin_amount,reason,created_at&order=created_at.desc&limit=200"),
    serviceRows("customer_whats_new?select=id,product_id,product_type,title,image_url,href,badge,published,pinned,display_order,published_at,expires_at,created_at&order=pinned.desc,published_at.desc&limit=100")
  ]);

  const customers = profiles.map((profile) => {
    const userId = String(profile.id);
    return {
      id: userId,
      email: String(profile.email || ""),
      nickname: String(profile.display_name || ""),
      avatarUrl: String(profile.avatar_url || ""),
      createdAt: String(profile.created_at || ""),
      balance: Number(wallets.find((wallet) => wallet.user_id === userId)?.balance_tokens || 0),
      walletHistory: transactions.filter((transaction) => transaction.user_id === userId).slice(0, 30),
      adminActions: actions.filter((action) => action.user_id === userId).slice(0, 20)
    };
  });

  return NextResponse.json({ configured: true, customers, releases });
}

export async function POST(request: NextRequest) {
  const admin = await authorized(request);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const service = serviceCredentials();
  if (!service) return NextResponse.json({ error: "Customer database unavailable." }, { status: 503 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = String(body.action || "");
  const headers = serviceHeaders(service);

  if (action === "adjust-wallet") {
    const token = request.cookies.get(adminSessionCookie)?.value;
    if (!isSuperAdmin(admin) || !await hasRecentAdminReauthentication(token)) return NextResponse.json({ error: "Super Admin and recent reauthentication are required for wallet adjustments." }, { status: 428 });
    const userId = String(body.userId || "");
    const coinAmount = Number(body.coinAmount);
    const adjustmentType = String(body.adjustmentType || "");
    const reason = String(body.reason || "").trim().slice(0, 500);
    if (!/^[0-9a-f-]{36}$/i.test(userId) || !Number.isSafeInteger(coinAmount) || coinAmount === 0 || Math.abs(coinAmount) > 1_000_000) {
      return NextResponse.json({ error: "Enter a valid customer and whole coin amount." }, { status: 400 });
    }
    if (!["balance_adjustment", "promotional_coins", "refund"].includes(adjustmentType) || reason.length < 4) {
      return NextResponse.json({ error: "Choose an adjustment type and enter a clear reason." }, { status: 400 });
    }
    const idempotencyKey = String(body.idempotencyKey || crypto.randomUUID()).slice(0, 160);
    const response = await fetch(`${service.url}/rest/v1/rpc/admin_adjust_customer_wallet`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        p_admin_id: admin.id,
        p_user_id: userId,
        p_coin_amount: coinAmount,
        p_action_type: adjustmentType,
        p_reason: reason,
        p_idempotency_key: idempotencyKey
      })
    }).catch(() => null);
    if (!response?.ok) {
      const detail = await response?.text().catch(() => "") || "";
      return NextResponse.json({ error: detail.includes("NEGATIVE_BALANCE") ? "The adjustment would create a negative balance." : "The wallet adjustment was rejected." }, { status: 422 });
    }
    await auditAdminEvent({
      adminUserId: admin.id,
      eventType: "admin_customer_wallet_adjustment",
      ipAddress: extractClientIp(request.headers),
      userAgent: request.headers.get("user-agent") || "unknown",
      metadata: { userId, coinAmount, adjustmentType, reason, idempotencyKey }
    });
    return NextResponse.json({ ok: true, result: await response.json() });
  }

  if (action === "publish-release") {
    const title = String(body.title || "").trim().slice(0, 180);
    const productType = String(body.productType || "");
    const href = String(body.href || "/").trim().slice(0, 500);
    if (title.length < 3 || !["merch", "audio", "painting", "upcoming", "announcement", "digital", "physical"].includes(productType) || !href.startsWith("/")) {
      return NextResponse.json({ error: "Enter a title, valid release type, and internal destination." }, { status: 400 });
    }
    const release = {
      product_id: String(body.productId || crypto.randomUUID()).slice(0, 160),
      product_type: productType,
      title,
      image_url: String(body.imageUrl || "").trim().slice(0, 1000),
      href,
      badge: String(body.badge || "NEW").trim().slice(0, 40),
      published: Boolean(body.published),
      pinned: Boolean(body.pinned),
      display_order: Math.max(0, Math.min(999, Number(body.displayOrder) || 100)),
      published_at: body.published ? new Date().toISOString() : null,
      updated_by: admin.id,
      updated_at: new Date().toISOString()
    };
    const response = await fetch(`${service.url}/rest/v1/customer_whats_new`, {
      method: "POST",
      headers: serviceHeaders(service, "return=representation"),
      body: JSON.stringify(release)
    }).catch(() => null);
    if (!response?.ok) return NextResponse.json({ error: "The release could not be published." }, { status: 422 });
    await auditAdminEvent({
      adminUserId: admin.id,
      eventType: "admin_customer_release_published",
      ipAddress: extractClientIp(request.headers),
      userAgent: request.headers.get("user-agent") || "unknown",
      metadata: { title, productType, published: release.published, pinned: release.pinned }
    });
    return NextResponse.json({ ok: true, release: (await response.json() as Row[])[0] });
  }

  return NextResponse.json({ error: "Unsupported customer action." }, { status: 400 });
}
