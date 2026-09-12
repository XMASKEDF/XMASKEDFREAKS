import "server-only";
import { randomUUID } from "crypto";
import { serviceCredentials, serviceHeaders } from "@/lib/api-user";
import { DEFAULT_CONTRIBUTION_SETTINGS, type ContributionCategory } from "@/lib/contribution-policy";
import { recordReliabilityIncident } from "@/lib/reliability/server";

type ContributionInput = {
  userId: string;
  category: ContributionCategory;
  coins: number;
  transactionReference: string;
  source?: string;
};

export async function recordVerifiedContribution(input: ContributionInput) {
  const service = serviceCredentials();
  if (!service || !input.userId || !input.transactionReference) return { stored: false, configured: false };
  const response = await fetch(`${service.url}/rest/v1/rpc/record_verified_contribution`, {
    method: "POST",
    cache: "no-store",
    headers: serviceHeaders(service),
    body: JSON.stringify({
      p_user_id: input.userId,
      p_category: input.category,
      p_coins: Math.max(0, Math.floor(input.coins)),
      p_transaction_reference: input.transactionReference.slice(0, 180),
      p_source: String(input.source || input.category).slice(0, 120)
    })
  }).catch(() => null);
  if (!response?.ok) {
    await recordReliabilityIncident({
      title: "Verified contribution was not applied to its watch period",
      plainExplanation: "A confirmed transaction could not be credited toward the visitor's current contribution period.",
      technicalExplanation: "record_verified_contribution rejected or did not return a successful response.",
      severity: 4,
      feature: "Live Entry and Refillable Viewing Credit",
      affectedRoute: "/live",
      affectedCustomerCount: 1,
      paymentId: input.transactionReference,
      automaticResponse: "The immutable wallet or order record remains unchanged; the failed period credit was recorded for reconciliation.",
      recommendedAdminAction: "Reconcile the confirmed transaction against contribution_transactions, then retry by its original idempotent reference."
    });
  }
  return { stored: Boolean(response?.ok), configured: true };
}

export async function startProtectedCheckout(userId: string, category: string, reference: string = randomUUID()) {
  const service = serviceCredentials();
  if (!service) return { stored: false, configured: false };
  const response = await fetch(`${service.url}/rest/v1/rpc/transition_contribution_period`, {
    method: "POST",
    cache: "no-store",
    headers: serviceHeaders(service),
    body: JSON.stringify({
      p_subject_ref: `user:${userId}`,
      p_user_id: userId,
      p_action: "checkout_started",
      p_route: category.slice(0, 200),
      p_event_key: reference.slice(0, 180),
      p_metadata: { protectionSeconds: DEFAULT_CONTRIBUTION_SETTINGS.checkoutProtectionSeconds }
    })
  }).catch(() => null);
  if (!response?.ok) {
    await recordReliabilityIncident({
      title: "Protected checkout state was not recorded",
      plainExplanation: "The contribution timer could not confirm that a legitimate checkout had started.",
      technicalExplanation: "The checkout_started contribution transition failed.",
      severity: 3,
      feature: "Live Entry and Refillable Viewing Credit",
      affectedRoute: category.slice(0, 200),
      affectedCustomerCount: 1,
      automaticResponse: "Checkout remains available, but no unverified browser state was trusted to extend access.",
      recommendedAdminAction: "Inspect the contribution RPC and checkout transaction logs."
    });
  }
  return { stored: Boolean(response?.ok), configured: true };
}
