export type MaintenancePolicySettings = {
  enabled: boolean;
  scope: "full" | "checkout" | "live" | "commerce" | "selected";
  disabledSystems: string[];
};

const alwaysAvailableRoutes = [
  "/maintenance", "/policies", "/api/health", "/api/maintenance",
  "/admin", "/api/admin", "/api/webhooks/payments", "/api/webhooks/printify",
  "/api/jobs/payment-reconciliation"
];

// The legacy maintenance policy still supports scoped operational shutdowns.
// The Kill Switch is deliberately stricter: once active, only recovery and
// verified provider/health paths remain reachable.
const killSwitchAlwaysAvailableRoutes = [
  "/kill-switch", "/maintenance", "/policies", "/api/health", "/api/kill-switch", "/api/maintenance",
  "/admin", "/api/admin", "/api/webhooks/payments", "/api/webhooks/printify",
  "/api/jobs/payment-reconciliation", "/api/jobs/printify", "/api/jobs/reliability"
];

function routeMatches(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(`${route}/`);
}

export function isMaintenanceRouteAllowed(pathname: string) {
  return alwaysAvailableRoutes.some((route) => routeMatches(pathname, route));
}

export function isMaintenanceRouteBlocked(settings: MaintenancePolicySettings, pathname: string, method = "GET") {
  if (!settings.enabled || isMaintenanceRouteAllowed(pathname)) return false;
  const stateChanging = !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
  if (settings.scope === "full") return true;
  if (settings.scope === "checkout") {
    return stateChanging && (pathname.startsWith("/api/payments") || pathname.startsWith("/api/purchase") || pathname.startsWith("/api/checkout") || pathname.startsWith("/api/merch") || pathname.startsWith("/api/audio-clips") || pathname.startsWith("/api/paintings"));
  }
  if (settings.scope === "live") return pathname === "/live" || pathname.startsWith("/live/") || pathname.startsWith("/api/live") || pathname.startsWith("/api/stream");
  if (settings.scope === "commerce") {
    return pathname.startsWith("/merch") || pathname.startsWith("/audio-clips") || pathname.startsWith("/api/merch") || pathname.startsWith("/api/audio-clips") || pathname.startsWith("/api/payments") || pathname.startsWith("/api/purchase") || pathname.startsWith("/api/checkout") || pathname.startsWith("/api/paintings");
  }
  const disabled = new Set(settings.disabledSystems);
  return (
    (disabled.has("live") && (pathname.startsWith("/live") || pathname.startsWith("/api/live") || pathname.startsWith("/api/stream"))) ||
    (disabled.has("maya") && pathname.startsWith("/api/support")) ||
    (disabled.has("games") && (pathname.startsWith("/games") || pathname.startsWith("/api/games"))) ||
    (disabled.has("merchandise") && (pathname.startsWith("/merch") || pathname.startsWith("/api/merch"))) ||
    (disabled.has("audio") && (pathname.startsWith("/audio-clips") || pathname.startsWith("/api/audio-clips"))) ||
    (disabled.has("downloads") && pathname.includes("/download")) ||
    (disabled.has("wallet") && stateChanging && (pathname.startsWith("/api/wallet") || pathname.startsWith("/api/tips") || pathname.startsWith("/api/access-control"))) ||
    (disabled.has("checkout") && stateChanging && (pathname.startsWith("/api/payments") || pathname.startsWith("/api/purchase") || pathname.startsWith("/api/checkout"))) ||
    (disabled.has("printify") && pathname.startsWith("/api/jobs/printify")) ||
    (disabled.has("email") && (pathname.startsWith("/api/jobs/email") || pathname.startsWith("/api/live-notifications"))) ||
    (disabled.has("notifications") && pathname.startsWith("/api/notifications"))
  );
}

export function isKillSwitchRouteAllowed(pathname: string) {
  return killSwitchAlwaysAvailableRoutes.some((route) => routeMatches(pathname, route));
}

export function isKillSwitchRouteBlocked(settings: Pick<MaintenancePolicySettings, "enabled">, pathname: string) {
  return settings.enabled && !isKillSwitchRouteAllowed(pathname);
}
