import { createHash, randomUUID } from "node:crypto";
import { serviceCredentials, serviceHeaders } from "@/lib/api-user";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type RiskAction = "ALLOW" | "ALLOW_WITH_MONITORING" | "RATE_LIMIT" | "REQUIRE_REAUTHENTICATION" | "REQUIRE_CHALLENGE" | "HOLD" | "MANUAL_REVIEW" | "BLOCK";
export type RiskContext = {
  action: string;
  environment?: "LOCAL" | "SANDBOX" | "STAGING" | "PRODUCTION";
  accountAgeDays?: number;
  failedAttempts?: number;
  requestVelocity?: number;
  authenticated?: boolean;
  sessionAgeMinutes?: number;
  amountMinor?: number;
  purchaseCount?: number;
  chargebackCount?: number;
  refundCount?: number;
  paymentFailures?: number;
  duplicateEvent?: boolean;
  providerRiskScore?: number | null;
  score?: number;
  durationSeconds?: number;
  expectedMinimumSeconds?: number;
  repeatedAccessViolations?: number;
  suspiciousAutomation?: boolean;
};
export type RiskDecision = { eventId: string; riskScore: number; riskLevel: RiskLevel; reasons: string[]; recommendedAction: RiskAction; requiresReview: boolean };

const levelFor = (score: number): RiskLevel => score >= 85 ? "CRITICAL" : score >= 60 ? "HIGH" : score >= 30 ? "MEDIUM" : "LOW";
const actionFor = (level: RiskLevel, action: string): RiskAction => level === "CRITICAL" ? "BLOCK" : level === "HIGH" ? (action.includes("payout") ? "HOLD" : "MANUAL_REVIEW") : level === "MEDIUM" ? "ALLOW_WITH_MONITORING" : "ALLOW";

export function evaluateRisk(context: RiskContext): RiskDecision {
  let score = 0;
  const reasons: string[] = [];
  const add = (points: number, reason: string) => { score += points; reasons.push(reason); };
  if ((context.failedAttempts || 0) >= 5) add(18, "Repeated failed attempts");
  if ((context.requestVelocity || 0) >= 30) add(18, "Unusual request velocity");
  if ((context.paymentFailures || 0) >= 3) add(20, "Repeated payment failures");
  if ((context.chargebackCount || 0) > 0) add(24, "Prior chargeback activity");
  if ((context.refundCount || 0) >= 3) add(10, "Repeated refund activity");
  if ((context.purchaseCount || 0) >= 10 && (context.accountAgeDays || 999) < 1) add(18, "Rapid new-account purchasing");
  if ((context.amountMinor || 0) >= 100_000) add(12, "High-value transaction requires review");
  if (context.duplicateEvent) add(30, "Duplicate or replayed event");
  if (context.suspiciousAutomation) add(20, "Suspicious automated request pattern");
  if ((context.repeatedAccessViolations || 0) >= 3) add(15, "Repeated protected-access violations");
  if (context.providerRiskScore !== null && context.providerRiskScore !== undefined) add(Math.max(0, Math.min(35, Math.round(context.providerRiskScore))), "Provider risk signal");
  if (context.action.includes("score") && (context.score || 0) > 0 && (context.durationSeconds || 0) < (context.expectedMinimumSeconds || 0)) add(55, "Score timing is inconsistent with the game session");
  const riskScore = Math.min(100, score);
  const riskLevel = levelFor(riskScore);
  return { eventId: randomUUID(), riskScore, riskLevel, reasons: reasons.length ? reasons : ["No elevated risk signals detected"], recommendedAction: actionFor(riskLevel, context.action), requiresReview: riskLevel === "HIGH" || riskLevel === "CRITICAL" };
}

export async function recordRiskEvent(input: { decision: RiskDecision; action: string; environment?: string; userId?: string | null; orderId?: string | null; transactionId?: string | null; metadata?: Record<string, unknown> }) {
  const service = serviceCredentials();
  if (!service) return { persisted: false, eventId: input.decision.eventId };
  const safeMetadata = Object.fromEntries(Object.entries(input.metadata || {}).filter(([key]) => !/password|card|cvv|token|secret|address/i.test(key)).slice(0, 20));
  const response = await fetch(`${service.url}/rest/v1/risk_events`, { method: "POST", headers: serviceHeaders(service, "return=minimal"), body: JSON.stringify({ id: input.decision.eventId, action_type: input.action, environment: input.environment || process.env.XMF_ENVIRONMENT || "LOCAL", user_id: input.userId || null, order_id: input.orderId || null, transaction_id: input.transactionId || null, risk_score: input.decision.riskScore, risk_level: input.decision.riskLevel, reasons: input.decision.reasons, decision: input.decision.recommendedAction, requires_review: input.decision.requiresReview, metadata: safeMetadata }) }).catch(() => null);
  return { persisted: Boolean(response?.ok), eventId: input.decision.eventId };
}

export function riskFingerprint(value: string) { return createHash("sha256").update(value).digest("hex").slice(0, 32); }
