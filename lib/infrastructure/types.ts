export const infrastructureEnvironments = ["LOCAL", "SANDBOX", "STAGING", "PRODUCTION"] as const;
export type InfrastructureEnvironment = typeof infrastructureEnvironments[number];

export const providerKinds = ["NONE", "LOCAL", "CLOUDFLARE", "SUPABASE", "UPSTASH", "S3_COMPATIBLE", "REDIS_COMPATIBLE", "CUSTOM"] as const;
export type ProviderKind = typeof providerKinds[number];

export const infrastructureStatuses = ["NOT CONFIGURED", "HEALTHY", "DEGRADED", "OFFLINE", "ACTION REQUIRED", "SANDBOX"] as const;
export type InfrastructureStatus = typeof infrastructureStatuses[number];

export type JobType =
  | "PRINTIFY_ORDER_SUBMISSION" | "PRINTIFY_RECONCILIATION" | "PAYMENT_RECONCILIATION"
  | "PAYOUT_RECONCILIATION" | "NEWSLETTER_SEND" | "UPCOMING_EMAIL" | "MEDIA_PROCESSING"
  | "AUDIO_PROCESSING" | "IMAGE_PROCESSING" | "VIDEO_PROCESSING" | "NOTIFICATION_SEND"
  | "ANALYTICS_ROLLUP" | "BACKUP_VERIFICATION" | "HEALTH_CHECK" | "FAILED_JOB_RETRY"
  | "PROCESS_IMAGE" | "PROCESS_AUDIO" | "PROCESS_VIDEO" | "GENERATE_THUMBNAIL"
  | "GENERATE_PREVIEW" | "EXTRACT_METADATA";

export type JobStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "RETRYING" | "CANCELED" | "ACTION REQUIRED";

export type InfrastructureServiceId =
  | "application" | "storage" | "cdn" | "cache" | "queue" | "workers" | "database"
  | "backups" | "rate-limiting" | "security-edge" | "streaming" | "media-processing"
  | "email" | "external-monitoring" | "deployment" | "event-bus" | "audit-ledger" | "staging" | "upload-scanning"
  | "risk-engine" | "entitlements" | "cost-control";

export type InfrastructureServiceStatus = {
  id: InfrastructureServiceId;
  label: string;
  status: InfrastructureStatus;
  provider: ProviderKind;
  lastCheck: string;
  health: string;
  errorState: string | null;
  enabled: boolean;
  switchable: boolean;
};

export type InfrastructureSnapshot = {
  environment: InfrastructureEnvironment;
  release: { version: string; deployedAt: string | null; previousRelease: string | null; rollbackReady: boolean };
  services: InfrastructureServiceStatus[];
  metrics: Array<{ name: string; count: number; totalMs: number; errors: number; lastAt: string; averageMs: number }>;
  providerConfiguration: import("./provider-configuration").Batch1ProviderStatus[];
  queue: { depth: number; running: number; failed: number; oldestQueuedAt: string | null; lastSuccessAt: string | null };
  cache: { provider: ProviderKind; shared: boolean; configured: boolean; reachable: boolean | null; status: InfrastructureStatus; detail: string; latencyMs: number | null; errors: number; hitCount: number; missCount: number; keys: number };
  storage: { provider: ProviderKind; publicRoot: string | null; privateSigning: boolean; status: InfrastructureStatus; detail: string; checkedAt: string; latencyMs?: number; buckets: { publicMedia: string; privateMedia: string; privateDigital: string; processing: string } };
  security: { waf: InfrastructureStatus; ddos: InfrastructureStatus; botProtection: InfrastructureStatus; managedRateLimit: InfrastructureStatus };
  backup: { provider: ProviderKind; database: InfrastructureStatus; media: InfrastructureStatus; pitr: InfrastructureStatus; lastBackup: string | null; lastRestoreTest: string | null };
  featureFlags: import("./flags").FeatureFlagRecord[];
  generatedAt: string;
};

export type ObjectMetadata = {
  objectId: string;
  provider: ProviderKind;
  bucket: string;
  key: string;
  originalFilename: string;
  mimeType: string;
  size: number;
  checksum: string;
  createdAt: string;
  visibility: "PUBLIC" | "PRIVATE";
  ownerId?: string | null;
  reference?: string | null;
  processingStatus: "UPLOADING" | "QUARANTINED" | "SCANNING" | "PROCESSING" | "SAFE" | "REJECTED";
};
