import "server-only";

import { serviceCredentials, serviceHeaders } from "@/lib/api-user";
import { readOperationalState, writeOperationalState } from "@/lib/admin-operationalization";

export type DepositWorkerRunStatus = "SCHEDULED" | "RUNNING" | "COMPLETED" | "PARTIAL" | "FAILED" | "BLOCKED_PROVIDER" | "RETRYING";
export type DepositWorkerResult = {
  ok: boolean;
  status: DepositWorkerRunStatus;
  runKey?: string;
  duplicate?: boolean;
  recordsProcessed?: number;
  eligibleAmountMinor?: number;
  payoutRequestId?: string | null;
  nextRunAt?: string | null;
  reason?: string;
};

function environment() {
  return String(process.env.XMF_ENVIRONMENT || process.env.APP_ENV || "LOCAL").toUpperCase();
}

export function nextDepositRunAt(now: Date, intervalHours: 1 | 2 | 4 | 8) {
  return new Date(now.getTime() + intervalHours * 60 * 60 * 1000).toISOString();
}

export function depositRunKey(nextRunAt: string | null, now: Date) {
  const source = nextRunAt && !Number.isNaN(Date.parse(nextRunAt)) ? nextRunAt : now.toISOString().slice(0, 13);
  return `deposit-worker:${source}`;
}

export function scheduleIsDue(enabled: boolean, nextRunAt: string | null, now = new Date()) {
  return enabled && (!nextRunAt || Number.isNaN(Date.parse(nextRunAt)) || Date.parse(nextRunAt) <= now.getTime());
}

async function rows<T>(service: NonNullable<ReturnType<typeof serviceCredentials>>, path: string) {
  const response = await fetch(`${service.url}/rest/v1/${path}`, { cache: "no-store", headers: serviceHeaders(service) }).catch(() => null);
  return response?.ok ? await response.json().catch(() => [] as T) as T : [] as T;
}

async function updateRun(service: NonNullable<ReturnType<typeof serviceCredentials>>, runKey: string, patch: Record<string, unknown>) {
  await fetch(`${service.url}/rest/v1/admin_deposit_worker_runs?run_key=eq.${encodeURIComponent(runKey)}`, {
    method: "PATCH",
    headers: serviceHeaders(service, "return=minimal"),
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() })
  }).catch(() => undefined);
}

async function updateSchedule(state: Awaited<ReturnType<typeof readOperationalState>>["state"], now: Date, result: "prepared" | "provider_pending") {
  const nextRunAt = state.depositSchedule.enabled ? nextDepositRunAt(now, state.depositSchedule.intervalHours) : null;
  const next = { ...state, depositSchedule: { ...state.depositSchedule, lastRunAt: now.toISOString(), nextRunAt, lastResult: result } };
  await writeOperationalState(next, null, "deposit_worker_run_recorded", { result, nextRunAt });
  return nextRunAt;
}

export async function readDepositWorkerRuns(limit = 20) {
  const service = serviceCredentials();
  if (!service) return [] as Array<Record<string, unknown>>;
  return rows<Array<Record<string, unknown>>>(service, `admin_deposit_worker_runs?select=run_key,status,scheduled_at,started_at,completed_at,duration_ms,attempt_count,records_processed,eligible_amount_minor,payout_request_id,result,failure_reason,provider_action_required&order=scheduled_at.desc&limit=${Math.max(1, Math.min(100, Math.floor(limit)))}`);
}

export async function runDepositWorker(input: { force?: boolean; retryRunKey?: string } = {}): Promise<DepositWorkerResult> {
  const service = serviceCredentials();
  if (!service) return { ok: false, status: "FAILED", reason: "DATABASE_NOT_CONFIGURED" };
  const { state } = await readOperationalState();
  const now = new Date();
  if (!input.force && !scheduleIsDue(state.depositSchedule.enabled, state.depositSchedule.nextRunAt, now)) {
    return { ok: true, status: "SCHEDULED", nextRunAt: state.depositSchedule.nextRunAt, reason: "NOT_DUE" };
  }

  const runKey = input.retryRunKey || depositRunKey(state.depositSchedule.nextRunAt, now);
  const claim = await fetch(`${service.url}/rest/v1/rpc/claim_admin_deposit_worker_run`, {
    method: "POST",
    headers: serviceHeaders(service),
    body: JSON.stringify({ p_run_key: runKey, p_scheduled_at: state.depositSchedule.nextRunAt || now.toISOString(), p_allow_retry: Boolean(input.retryRunKey) })
  }).catch(() => null);
  if (!claim?.ok) return { ok: false, status: "FAILED", runKey, reason: "WORKER_SCHEMA_OR_CLAIM_UNAVAILABLE" };
  const claimed = await claim.json().catch(() => []) as Array<Record<string, unknown>>;
  if (!claimed.length) return { ok: true, status: "RUNNING", runKey, duplicate: true, reason: "ALREADY_CLAIMED" };

  const startedAt = Date.now();
  const ledger = await rows<Array<Record<string, unknown>>>(service, "admin_earnings_ledger?status=eq.verified&settled_at=is.null&select=id,gross_amount_minor,category,source_type,source_id&order=verified_at.asc&limit=10000");
  const recordsProcessed = ledger.length;
  const eligibleAmountMinor = ledger.reduce((sum, item) => sum + Math.max(0, Number(item.gross_amount_minor || 0)), 0);
  if (!ledger.length) {
    await updateRun(service, runKey, { status: "COMPLETED", completed_at: now.toISOString(), duration_ms: Date.now() - startedAt, records_processed: 0, eligible_amount_minor: 0, result: "NO_ELIGIBLE_EARNINGS", failure_reason: null, provider_action_required: null });
    const nextRunAt = await updateSchedule(state, now, "prepared");
    return { ok: true, status: "COMPLETED", runKey, recordsProcessed: 0, eligibleAmountMinor: 0, nextRunAt, reason: "NO_ELIGIBLE_EARNINGS" };
  }

  const idempotencyKey = `deposit-payout:${runKey}`;
  const payoutResponse = await fetch(`${service.url}/rest/v1/admin_payout_requests`, {
    method: "POST",
    headers: serviceHeaders(service, "resolution=ignore-duplicates,return=representation"),
    body: JSON.stringify({
      idempotency_key: idempotencyKey,
      provider: "provider_controlled",
      mode: environment() === "PRODUCTION" ? "production" : "sandbox",
      amount_minor: eligibleAmountMinor,
      fee_minor: 0,
      net_amount_minor: eligibleAmountMinor,
      currency: "USD",
      status: "action_required",
      failure_reason: "SETTLEMENT_PROVIDER_REQUIRED",
      requested_at: now.toISOString()
    })
  }).catch(() => null);
  const payoutRows = payoutResponse?.ok ? await payoutResponse.json().catch(() => []) as Array<Record<string, unknown>> : [];
  let payoutRequest = payoutRows[0] || null;
  if (!payoutRequest && payoutResponse?.status === 409) payoutRequest = (await rows<Array<Record<string, unknown>>>(service, `admin_payout_requests?idempotency_key=eq.${encodeURIComponent(idempotencyKey)}&select=id&limit=1`))[0] || null;
  if (!payoutRequest) {
    await updateRun(service, runKey, { status: "FAILED", completed_at: now.toISOString(), duration_ms: Date.now() - startedAt, records_processed: recordsProcessed, eligible_amount_minor: eligibleAmountMinor, result: "PAYOUT_PREPARATION_FAILED", failure_reason: "PAYOUT_REQUEST_NOT_RECORDED", provider_action_required: "MANUAL_RECONCILIATION_REQUIRED" });
    return { ok: false, status: "FAILED", runKey, recordsProcessed, eligibleAmountMinor, reason: "PAYOUT_REQUEST_NOT_RECORDED" };
  }

  await updateRun(service, runKey, { status: "BLOCKED_PROVIDER", completed_at: now.toISOString(), duration_ms: Date.now() - startedAt, records_processed: recordsProcessed, eligible_amount_minor: eligibleAmountMinor, payout_request_id: payoutRequest.id, result: "PAYOUT_PREPARED", failure_reason: "SETTLEMENT_PROVIDER_NOT_CONFIGURED", provider_action_required: "APPROVED_SETTLEMENT_PROVIDER_REQUIRED" });
  const nextRunAt = await updateSchedule(state, now, "provider_pending");
  return { ok: true, status: "BLOCKED_PROVIDER", runKey, recordsProcessed, eligibleAmountMinor, payoutRequestId: String(payoutRequest.id), nextRunAt, reason: "APPROVED_SETTLEMENT_PROVIDER_REQUIRED" };
}
