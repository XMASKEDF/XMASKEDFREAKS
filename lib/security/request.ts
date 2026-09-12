const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isStateChangingMethod(method: string) {
  return !SAFE_METHODS.has(method.toUpperCase());
}

export function isVerifiedExternalCallback(pathname: string) {
  return pathname.startsWith("/api/webhooks/") || pathname.startsWith("/api/jobs/");
}

export function isSameOriginRequest(input: {
  method: string;
  pathname: string;
  origin: string;
  originHeader: string | null;
  refererHeader: string | null;
  fetchSite: string | null;
}) {
  if (!isStateChangingMethod(input.method) || isVerifiedExternalCallback(input.pathname)) return true;
  if (input.originHeader) return input.originHeader === input.origin;
  if (input.refererHeader) {
    try {
      return new URL(input.refererHeader).origin === input.origin;
    } catch {
      return false;
    }
  }
  return input.fetchSite === "same-origin" || input.fetchSite === "none";
}

export function requestBodyLimit(pathname: string) {
  if (pathname.startsWith("/api/admin/media")) return 16 * 1024 * 1024;
  if (pathname.startsWith("/api/webhooks/")) return 64 * 1024;
  return 1024 * 1024;
}
