import "server-only";

import { createHash } from "crypto";
import { NextRequest } from "next/server";
import { getApiUser, serviceCredentials, serviceHeaders, type ApiUser } from "@/lib/api-user";

const GUEST_COOKIE = "xmf_contribution_guest";

type CreditRpcResponse = {
  entryRequirementSatisfied?: boolean;
  graceExpiresAt?: string | null;
  creditHalfSeconds?: number;
  consumedHalfSeconds?: number;
  consumedNowHalfSeconds?: number;
  lastConsumedAt?: string | null;
  duplicate?: boolean;
  addedHalfSeconds?: number;
  entryCoins?: number;
  hourlyCoins?: number;
  zero?: boolean;
};

function guestSubject(request: NextRequest) {
  const guest = request.cookies.get(GUEST_COOKIE)?.value;
  if (!guest) return null;
  const digest = createHash("sha256")
    .update(`${guest}:${process.env.CONTRIBUTION_IDENTITY_SALT || "local-contribution"}`)
    .digest("hex");
  return `guest:${digest}`;
}

export async function resolveViewingCreditIdentity(request: NextRequest, user?: ApiUser | null) {
  const resolvedUser = user === undefined ? await getApiUser(request) : user;
  if (resolvedUser) return { subjectRef: `user:${resolvedUser.id}`, userId: resolvedUser.id };
  const subjectRef = guestSubject(request);
  return subjectRef ? { subjectRef, userId: null } : null;
}

async function callCreditRpc<T extends CreditRpcResponse>(name: string, body: Record<string, unknown>) {
  const service = serviceCredentials();
  if (!service) return { configured: false, response: null as T | null };
  const response = await fetch(`${service.url}/rest/v1/rpc/${name}`, {
    method: "POST",
    cache: "no-store",
    headers: serviceHeaders(service),
    body: JSON.stringify(body)
  }).catch(() => null);
  if (!response?.ok) return { configured: true, response: null as T | null };
  return { configured: true, response: await response.json().catch(() => null) as T | null };
}

export async function readViewingCredit(request: NextRequest, sandbox = false) {
  const identity = await resolveViewingCreditIdentity(request);
  if (!identity) return { configured: Boolean(serviceCredentials()), identity: null, snapshot: null };
  const result = await callCreditRpc("get_live_viewing_credit", {
    p_subject_ref: identity.subjectRef,
    p_user_id: identity.userId,
    p_environment: sandbox ? "sandbox" : "production"
  });
  return { configured: result.configured, identity, snapshot: result.response };
}

export async function consumeViewingCredit(request: NextRequest, playbackSessionId: string, active: boolean, sandbox = false) {
  const identity = await resolveViewingCreditIdentity(request);
  if (!identity) return { configured: Boolean(serviceCredentials()), snapshot: null };
  const result = await callCreditRpc("consume_live_viewing_credit", {
    p_subject_ref: identity.subjectRef,
    p_user_id: identity.userId,
    p_playback_session_id: playbackSessionId,
    p_active: active,
    p_environment: sandbox ? "sandbox" : "production"
  });
  return { configured: result.configured, snapshot: result.response };
}

export async function applyTipViewingCredit(input: {
  userId: string;
  transactionReference: string;
  coins: number;
  playbackSessionId?: string | null;
  sandbox?: boolean;
}) {
  const result = await callCreditRpc("apply_live_viewing_credit", {
    p_subject_ref: `user:${input.userId}`,
    p_user_id: input.userId,
    p_transaction_reference: input.transactionReference.slice(0, 180),
    p_coins: Math.max(0, Math.floor(input.coins)),
    p_playback_session_id: input.playbackSessionId || null,
    p_environment: input.sandbox ? "sandbox" : "production"
  });
  return { configured: result.configured, snapshot: result.response };
}
