import type { JobRecord } from "./queue";
import type { EmailProvider } from "../email/provider";
import type { InfrastructureEnvironment, InfrastructureStatus, JobType, ProviderKind } from "./types";

export type ProviderHealth = { status: InfrastructureStatus; detail: string; latencyMs?: number; checkedAt: string };

export interface AlertProvider {
  readonly kind: "LOCAL" | "CUSTOM";
  send(alert: { key: string; severity: "INFO" | "WARNING" | "CRITICAL"; title: string; code: string; details?: Record<string, unknown>; recovery?: boolean }): Promise<{ accepted: boolean; reference: string; detail: string }>;
}

export interface AssetDeliveryProvider {
  readonly kind: ProviderKind;
  publicUrl(key: string, version?: string): string | null;
  privateUrl(key: string, expiresInSeconds?: number): Promise<string | null>;
  invalidate(keys: string[]): Promise<{ accepted: boolean; detail: string }>;
}

export interface MediaProcessingProvider {
  readonly kind: ProviderKind;
  submit(job: { type: "IMAGE_PROCESSING" | "AUDIO_PROCESSING" | "VIDEO_PROCESSING"; objectId: string; key: string }): Promise<JobRecord>;
  health(): Promise<ProviderHealth>;
}

// Compatibility alias: email delivery is owned by the central email provider.
export type EmailDeliveryProvider = EmailProvider;

export interface BackupProvider {
  readonly kind: ProviderKind;
  status(): Promise<{ database: ProviderHealth; media: ProviderHealth; pitr: InfrastructureStatus; lastRestoreTest: string | null }>;
  verifyRestore(environment: Exclude<InfrastructureEnvironment, "PRODUCTION">): Promise<{ accepted: boolean; reference: string; detail: string }>;
}

export interface ExternalHealthMonitorProvider {
  readonly kind: ProviderKind;
  register(endpoint: string): Promise<{ accepted: boolean; detail: string }>;
  health(): Promise<ProviderHealth>;
}

export interface DeploymentProvider {
  readonly kind: ProviderKind;
  releaseHealth(): Promise<{ currentRelease: string; previousRelease: string | null; deployedAt: string | null; health: InfrastructureStatus; rollbackReady: boolean }>;
  rollback(reference: string): Promise<{ accepted: boolean; detail: string }>;
}

export interface StreamingProvider {
  readonly kind: ProviderKind;
  health(): Promise<ProviderHealth & { state: "OFFLINE" | "CONNECTING" | "LIVE" | "DEGRADED" | "FAILED" }>;
  playbackUrl(quality: "AUTO" | "1080P" | "720P" | "LOW"): Promise<string | null>;
}

export class UnconfiguredProvider<T extends ProviderKind = "NONE"> {
  readonly kind: T;
  constructor(kind: T = "NONE" as T) { this.kind = kind; }
  async health(): Promise<ProviderHealth> { return { status: "NOT CONFIGURED", detail: "No approved provider is configured.", checkedAt: new Date().toISOString() }; }
}
