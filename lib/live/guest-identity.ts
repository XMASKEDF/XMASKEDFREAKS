import { createHash, randomBytes } from "crypto";

export const LIVE_GUEST_COOKIE = "xmf_contribution_guest";

export function createLiveGuestCookie() {
  return randomBytes(24).toString("base64url");
}

export function guestSubjectReference(cookieValue: string) {
  const digest = createHash("sha256")
    .update(`${cookieValue}:${process.env.CONTRIBUTION_IDENTITY_SALT || "local-contribution"}`)
    .digest("hex");
  return `guest:${digest}`;
}

export function liveSubjectReference(userId: string | null, guestCookieValue: string | null) {
  if (userId) return `user:${userId}`;
  return guestCookieValue ? guestSubjectReference(guestCookieValue) : null;
}
