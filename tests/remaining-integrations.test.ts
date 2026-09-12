import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getEmailProvider } from "../lib/email/provider.ts";
import { getPaymentProviderReadiness, paymentProviderCapabilities } from "../lib/payments/provider.ts";

const root = new URL("../", import.meta.url);
const source = (path: string) => readFileSync(new URL(path, root), "utf8");

test("unapproved payment providers remain capability-empty and fail closed", async () => {
  assert.deepEqual(paymentProviderCapabilities("ccbill"), []);
  assert.deepEqual(paymentProviderCapabilities("segpay"), []);
  const ccbill = await getPaymentProviderReadiness("ccbill");
  const segpay = await getPaymentProviderReadiness("segpay");
  assert.equal(ccbill.status, "NOT CONFIGURED");
  assert.equal(segpay.status, "NOT CONFIGURED");
  assert.match(ccbill.detail, /No payment request or callback is accepted/);
  assert.match(segpay.detail, /No payment request or callback is accepted/);
});

test("disabled email cannot claim delivery", async () => {
  const result = await getEmailProvider().send({ to: "owner@example.com", subject: "test", text: "test", idempotencyKey: "test-disabled-email" });
  assert.equal(result.accepted, false);
  assert.equal(result.delivered, false);
  assert.equal(result.state, "FAILED");
});

test("remaining integration boundaries preserve one authoritative path", () => {
  const webhook = source("lib/payments/webhook-handler.ts");
  const worker = source("lib/deposit-worker.ts");
  const publication = source("lib/media/publication.ts");
  const operationalRoute = source("app/api/admin/operationalization/route.ts");
  const migration = source("supabase/migrations/20260911130000_remaining_integrations.sql");
  assert.match(webhook, /reconciliation_required/);
  assert.match(webhook, /processing_result/);
  assert.match(webhook, /duplicate/);
  assert.match(worker, /BLOCKED_PROVIDER/);
  assert.doesNotMatch(worker, /submitPayout/);
  assert.match(publication, /mediaClass !== "IMAGE"/);
  assert.match(publication, /PRIVATE_MEDIA/);
  assert.match(publication, /processing_status/);
  assert.match(publication, /PUBLICATION_REQUESTED/);
  assert.match(publication, /publicUrl/);
  assert.match(operationalRoute, /action === "test-email"/);
  assert.match(operationalRoute, /confirm !== true/);
  assert.match(operationalRoute, /action === "run-deposit-worker"/);
  assert.match(migration, /claim_admin_deposit_worker_run/);
  assert.match(migration, /PROVIDER_ACCEPTED/);
  assert.match(migration, /PUBLICATION_COMPLETED/);
});

test("Admin operationalization exposes independent provider and worker readiness", () => {
  const core = source("lib/admin-operationalization.ts");
  const center = source("components/admin/AdminOperationalizationCenter.tsx");
  assert.match(core, /storageCdn/);
  assert.match(core, /payoutWorker/);
  assert.match(core, /depositRuns/);
  assert.match(center, /Software:/);
  assert.match(center, /Configuration:/);
  assert.match(center, /Send one-recipient test/);
  assert.match(center, /Run internal worker/);
});

test("browser payment return remains server-status driven", () => {
  const returnPage = source("components/payments/HostedPaymentReturn.tsx");
  assert.match(returnPage, /api\/payments\/hosted/);
  assert.match(returnPage, /verified server callback/);
  assert.doesNotMatch(returnPage, /searchParams.*confirmed|query.*confirmed/i);
});
