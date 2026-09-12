import { createHash } from "node:crypto";
import type { InfrastructureEnvironment } from "./types";

export const featureFlagNames = ["NEW_CHECKOUT", "NEW_STREAM_PLAYER", "NEW_GAME_ENGINE", "NEW_STORAGE", "NEW_PAYMENT_PROVIDER"] as const;
export type FeatureFlagName = typeof featureFlagNames[number];
export const featureFlagStates = ["OFF", "SANDBOX", "CONTROLLED", "ON"] as const;
export type FeatureFlagState = typeof featureFlagStates[number];

export type FeatureFlagRecord = {
  name: FeatureFlagName;
  state: FeatureFlagState;
  percentage: number;
  environment: InfrastructureEnvironment;
  updatedAt: string;
  updatedBy: string;
  persistence: "PROCESS_LOCAL" | "ENVIRONMENT";
};

export interface FeatureFlagProvider {
  get(name: FeatureFlagName): FeatureFlagRecord;
  list(): FeatureFlagRecord[];
  set(name: FeatureFlagName, state: FeatureFlagState, options?: { percentage?: number; changedBy?: string }): FeatureFlagRecord;
  enabled(name: FeatureFlagName, subjectId?: string | null): boolean;
}

function environment(): InfrastructureEnvironment {
  const value = String(process.env.XMF_ENVIRONMENT || process.env.APP_ENV || "LOCAL").toUpperCase();
  return ["LOCAL", "SANDBOX", "STAGING", "PRODUCTION"].includes(value) ? value as InfrastructureEnvironment : "LOCAL";
}

function initialState(name: FeatureFlagName): FeatureFlagState {
  const value = String(process.env[`XMF_FLAG_${name}`] || "OFF").toUpperCase();
  if (environment() === "PRODUCTION" && value === "ON") return "OFF";
  return featureFlagStates.includes(value as FeatureFlagState) ? value as FeatureFlagState : "OFF";
}

function clampPercentage(value: number | undefined) {
  return Math.max(0, Math.min(100, Math.floor(Number.isFinite(value) ? value as number : 0)));
}

function stableBucket(subjectId: string) {
  return Number.parseInt(createHash("sha256").update(subjectId).digest("hex").slice(0, 8), 16) % 100;
}

class LocalFeatureFlagProvider implements FeatureFlagProvider {
  private readonly records = new Map<FeatureFlagName, FeatureFlagRecord>();
  private readonly currentEnvironment = environment();

  constructor() {
    const now = new Date().toISOString();
    for (const name of featureFlagNames) {
      this.records.set(name, { name, state: initialState(name), percentage: 0, environment: this.currentEnvironment, updatedAt: now, updatedBy: "environment", persistence: "PROCESS_LOCAL" });
    }
  }

  get(name: FeatureFlagName) { return { ...this.records.get(name)! }; }
  list() { return featureFlagNames.map((name) => this.get(name)); }

  set(name: FeatureFlagName, state: FeatureFlagState, options: { percentage?: number; changedBy?: string } = {}) {
    if (this.currentEnvironment === "PRODUCTION" && state === "ON") throw new Error("A durable production feature-flag provider is required before enabling this flag.");
    const next = { ...this.get(name), state, percentage: state === "CONTROLLED" ? clampPercentage(options.percentage) : 0, updatedAt: new Date().toISOString(), updatedBy: options.changedBy || "admin" };
    this.records.set(name, next);
    return { ...next };
  }

  enabled(name: FeatureFlagName, subjectId?: string | null) {
    const record = this.get(name);
    if (record.state === "OFF") return false;
    if (record.state === "SANDBOX") return this.currentEnvironment === "SANDBOX";
    if (record.state === "ON") return this.currentEnvironment !== "PRODUCTION";
    return Boolean(subjectId && stableBucket(`${name}:${subjectId}`) < record.percentage);
  }
}

let provider: FeatureFlagProvider | null = null;
export function getFeatureFlagProvider() { provider ||= new LocalFeatureFlagProvider(); return provider; }
