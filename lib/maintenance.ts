import { serviceCredentials, serviceHeaders } from "@/lib/api-user";
export { isKillSwitchRouteAllowed, isKillSwitchRouteBlocked, isMaintenanceRouteAllowed, isMaintenanceRouteBlocked } from "@/lib/maintenance-policy";

export type MaintenanceSettings = {
  enabled: boolean;
  title: string;
  message: string;
  imageUrl: string;
  expectedReturnAt: string | null;
  supportUrl: string;
  allowedRoutes: string[];
  blockNewCheckouts: boolean;
  scope: MaintenanceScope;
  disabledSystems: MaintenanceSystem[];
  privateReason: string;
  activatedAt: string | null;
  activatedBy: string | null;
  stateVersion: number;
  updatedAt: string | null;
  automaticTriggersEnabled: boolean;
};

export type MaintenanceScope = "full" | "checkout" | "live" | "commerce" | "selected";
export type MaintenanceSystem = "live" | "maya" | "games" | "merchandise" | "audio" | "downloads" | "wallet" | "checkout" | "printify" | "email" | "notifications";

export const maintenanceScopes: MaintenanceScope[] = ["full", "checkout", "live", "commerce", "selected"];
export const maintenanceSystems: MaintenanceSystem[] = ["live", "maya", "games", "merchandise", "audio", "downloads", "wallet", "checkout", "printify", "email", "notifications"];

export const defaultMaintenanceSettings: MaintenanceSettings = {
  enabled: false,
  title: "XMASKEDFREAKS is temporarily unavailable",
  message: "XMASKEDFREAKS is receiving a scheduled update.",
  imageUrl: "",
  expectedReturnAt: null,
  supportUrl: "/policies",
  allowedRoutes: ["/kill-switch", "/maintenance", "/policies", "/api/health", "/api/kill-switch", "/api/maintenance"],
  blockNewCheckouts: true,
  scope: "full",
  disabledSystems: [],
  privateReason: "",
  activatedAt: null,
  activatedBy: null,
  stateVersion: 0,
  updatedAt: null,
  automaticTriggersEnabled: false
};

function maintenanceScope(value: unknown): MaintenanceScope {
  return maintenanceScopes.includes(value as MaintenanceScope) ? value as MaintenanceScope : "full";
}

function disabledSystems(value: unknown): MaintenanceSystem[] {
  if (!Array.isArray(value)) return [];
  return value.map(String).filter((item): item is MaintenanceSystem => maintenanceSystems.includes(item as MaintenanceSystem));
}

export async function getMaintenanceSettings(): Promise<MaintenanceSettings> {
  const service = serviceCredentials();
  if (!service) return defaultMaintenanceSettings;
  const response = await fetch(`${service.url}/rest/v1/maintenance_settings?id=eq.primary&select=*&limit=1`, { cache: "no-store", headers: serviceHeaders(service) }).catch(() => null);
  if (!response?.ok) return defaultMaintenanceSettings;
  const row = (await response.json() as Array<Record<string, unknown>>)[0];
  if (!row) return defaultMaintenanceSettings;
  return {
    enabled: row.enabled === true, title: String(row.title || defaultMaintenanceSettings.title), message: String(row.message || defaultMaintenanceSettings.message),
    imageUrl: String(row.image_url || ""), expectedReturnAt: row.expected_return_at ? String(row.expected_return_at) : null, supportUrl: String(row.support_url || "/policies"),
    allowedRoutes: Array.isArray(row.allowed_routes) ? row.allowed_routes.map(String) : defaultMaintenanceSettings.allowedRoutes,
    blockNewCheckouts: row.block_new_checkouts !== false,
    scope: maintenanceScope(row.scope),
    disabledSystems: disabledSystems(row.disabled_systems),
    privateReason: String(row.private_reason || ""),
    activatedAt: row.activated_at ? String(row.activated_at) : null,
    activatedBy: row.activated_by ? String(row.activated_by) : null,
    stateVersion: Math.max(0, Number(row.state_version || 0)),
    updatedAt: row.updated_at ? String(row.updated_at) : null,
    automaticTriggersEnabled: row.automatic_triggers_enabled === true
  };
}

export function publicMaintenanceSettings(settings: MaintenanceSettings) {
  return {
    enabled: settings.enabled,
    title: settings.title,
    message: settings.message,
    imageUrl: settings.imageUrl,
    expectedReturnAt: settings.expectedReturnAt,
    supportUrl: settings.supportUrl,
    scope: settings.scope,
    stateVersion: settings.stateVersion,
    updatedAt: settings.updatedAt
  };
}
