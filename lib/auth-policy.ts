export type AccountRole = "user" | "admin";

export type AuthPolicyInput = {
  role: AccountRole;
  userTwoFactorEnabled: boolean;
  trustedDevice: boolean;
  lastVerifiedAt?: string | null;
  inactivityDays?: number;
};

export type AuthPolicyDecision = {
  requireTwoFactor: boolean;
  reason: string;
};

export function shouldRequireTwoFactor(input: AuthPolicyInput): AuthPolicyDecision {
  if (input.role === "admin") {
    return { requireTwoFactor: true, reason: "Administrator accounts require 2FA." };
  }

  if (!input.userTwoFactorEnabled) {
    return { requireTwoFactor: false, reason: "Standard user 2FA is optional and disabled." };
  }

  if (!input.trustedDevice) {
    return { requireTwoFactor: true, reason: "New or untrusted device." };
  }

  if (!input.lastVerifiedAt) {
    return { requireTwoFactor: true, reason: "No previous 2FA verification for this device." };
  }

  const inactivityDays = Math.max(1, input.inactivityDays || 30);
  const lastVerified = new Date(input.lastVerifiedAt).getTime();
  const cutoff = Date.now() - inactivityDays * 24 * 60 * 60 * 1000;
  if (!Number.isFinite(lastVerified) || lastVerified < cutoff) {
    return { requireTwoFactor: true, reason: `Trusted-device verification expired after ${inactivityDays} days.` };
  }

  return { requireTwoFactor: false, reason: "Trusted device is still valid." };
}

export function maskRecoveryCode(code: string) {
  return `${code.slice(0, 4)}-${"•".repeat(6)}-${code.slice(-2)}`;
}
