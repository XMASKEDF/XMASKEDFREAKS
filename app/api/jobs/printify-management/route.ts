import { NextRequest, NextResponse } from "next/server";
import { serviceCredentials, serviceHeaders } from "@/lib/api-user";
import {
  runPrintifyHealthProbe,
  syncPrintifyOrdersAndReconcile,
  syncPrintifyProducts,
  syncPrintifyProviders,
  syncPrintifyShipping
} from "@/lib/commerce/pod/management";

export const dynamic = "force-dynamic";

function authorized(request: NextRequest) {
  const expected = process.env.CRON_SECRET?.trim();
  return Boolean(expected && request.headers.get("authorization") === `Bearer ${expected}`);
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const service = serviceCredentials();
  if (!service) return NextResponse.json({ error: "Storage unavailable." }, { status: 503 });
  const response = await fetch(`${service.url}/rest/v1/pod_provider_settings?provider=eq.printify&select=*&limit=1`, { cache: "no-store", headers: serviceHeaders(service) });
  const [settings] = response.ok ? await response.json() as Array<Record<string, unknown>> : [];
  if (!settings?.enabled) return NextResponse.json({ ok: true, skipped: "Printify management jobs are disabled." });
  const historyResponse = await fetch(`${service.url}/rest/v1/pod_sync_runs?provider=eq.printify&status=eq.completed&select=sync_type,completed_at&order=completed_at.desc&limit=100`, { cache: "no-store", headers: serviceHeaders(service) });
  const history = historyResponse.ok ? await historyResponse.json() as Array<{ sync_type: string; completed_at: string }> : [];
  const due = (types: string[], minutes: number) => {
    const latest = history.find((row) => types.includes(row.sync_type));
    return !latest || Date.now() - new Date(latest.completed_at).getTime() >= minutes * 60_000;
  };
  const results: Record<string, unknown> = { health: await runPrintifyHealthProbe("schedule") };
  const productMinutes = Math.max(15, Number(settings.product_sync_minutes || 60));
  const reconciliationMinutes = Math.max(15, Number(settings.reconciliation_minutes || 30));
  const shippingMinutes = Math.max(15, Number(settings.shipping_cache_minutes || 360));
  if ((settings.product_sync_enabled || settings.inventory_sync_enabled) && due(["products", "inventory"], productMinutes)) results.products = await syncPrintifyProducts("schedule");
  if (settings.provider_sync_enabled && due(["providers"], productMinutes)) results.providers = await syncPrintifyProviders("schedule");
  if (settings.shipping_sync_enabled && due(["shipping"], shippingMinutes)) results.shipping = await syncPrintifyShipping("schedule");
  if (settings.reconciliation_enabled && due(["reconciliation"], reconciliationMinutes)) results.reconciliation = await syncPrintifyOrdersAndReconcile("schedule");
  return NextResponse.json({ ok: true, results });
}
