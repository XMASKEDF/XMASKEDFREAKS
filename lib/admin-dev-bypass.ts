export function isAdminDevAuthEnabled() {
  return process.env.NODE_ENV !== "production" && process.env.ADMIN_DEV_AUTH_ENABLED === "true";
}

export function assertNoLegacyAdminBypass() {
  if (process.env.ADMIN_DEV_BYPASS === "true") {
    throw new Error("ADMIN_DEV_BYPASS is no longer supported. Use the authenticated development admin account.");
  }
}
