import { randomUUID } from "node:crypto";
import type { InfrastructureEnvironment, JobStatus, JobType } from "./types";

export type JobRecord<T = unknown> = {
  id: string;
  type: JobType;
  environment: InfrastructureEnvironment;
  payload: T;
  idempotencyKey: string;
  relatedOrderId?: string | null;
  relatedUserId?: string | null;
  status: JobStatus;
  createdAt: string;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  retryCount: number;
  error: string | null;
};

export interface JobQueueProvider {
  enqueue<T>(type: JobType, payload: T, options?: { idempotencyKey?: string; scheduledAt?: string; relatedOrderId?: string; relatedUserId?: string }): Promise<JobRecord<T>>;
  schedule<T>(type: JobType, payload: T, scheduledAt: string, options?: { idempotencyKey?: string }): Promise<JobRecord<T>>;
  retry(id: string): Promise<JobRecord | null>;
  cancel(id: string): Promise<JobRecord | null>;
  getStatus(id: string): Promise<JobRecord | null>;
  list(): Promise<JobRecord[]>;
  stats(): { depth: number; running: number; failed: number; oldestQueuedAt: string | null; lastSuccessAt: string | null };
}

const retryable = new Set<JobType>(["PRINTIFY_ORDER_SUBMISSION", "PRINTIFY_RECONCILIATION", "NEWSLETTER_SEND", "UPCOMING_EMAIL", "MEDIA_PROCESSING", "AUDIO_PROCESSING", "IMAGE_PROCESSING", "VIDEO_PROCESSING", "PROCESS_IMAGE", "PROCESS_AUDIO", "PROCESS_VIDEO", "GENERATE_THUMBNAIL", "GENERATE_PREVIEW", "EXTRACT_METADATA", "NOTIFICATION_SEND", "HEALTH_CHECK", "FAILED_JOB_RETRY"]);

export class LocalJobQueueProvider implements JobQueueProvider {
  readonly jobs = new Map<string, JobRecord>();
  private readonly idempotency = new Map<string, string>();
  private readonly environment: InfrastructureEnvironment;
  constructor(environment: InfrastructureEnvironment) { this.environment = environment; }
  async enqueue<T>(type: JobType, payload: T, options: { idempotencyKey?: string; scheduledAt?: string; relatedOrderId?: string; relatedUserId?: string } = {}) {
    const key = options.idempotencyKey || `${type}:${JSON.stringify(payload)}`;
    const existingId = this.idempotency.get(key);
    if (existingId) return this.jobs.get(existingId) as JobRecord<T>;
    const now = new Date().toISOString();
    const job: JobRecord<T> = { id: randomUUID(), type, payload, environment: this.environment, idempotencyKey: key, relatedOrderId: options.relatedOrderId || null, relatedUserId: options.relatedUserId || null, status: "QUEUED", createdAt: now, scheduledAt: options.scheduledAt || null, startedAt: null, completedAt: null, retryCount: 0, error: null };
    this.jobs.set(job.id, job);
    this.idempotency.set(key, job.id);
    return job;
  }
  async schedule<T>(type: JobType, payload: T, scheduledAt: string, options: { idempotencyKey?: string } = {}) { return this.enqueue(type, payload, { ...options, scheduledAt }); }
  async retry(id: string) { const job = this.jobs.get(id); if (!job || !retryable.has(job.type) || job.status === "RUNNING") return null; job.status = "RETRYING"; job.retryCount += 1; job.error = null; job.scheduledAt = new Date(Date.now() + Math.min(3_600_000, 2 ** job.retryCount * 1000)).toISOString(); return job; }
  async cancel(id: string) { const job = this.jobs.get(id); if (!job || !["QUEUED", "RETRYING"].includes(job.status)) return null; job.status = "CANCELED"; job.completedAt = new Date().toISOString(); return job; }
  async getStatus(id: string) { return this.jobs.get(id) || null; }
  async list() { return [...this.jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
  stats() { const jobs = [...this.jobs.values()]; const queued = jobs.filter((job) => ["QUEUED", "RETRYING"].includes(job.status)); const success = jobs.filter((job) => job.status === "SUCCEEDED").sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt))); return { depth: queued.length, running: jobs.filter((job) => job.status === "RUNNING").length, failed: jobs.filter((job) => job.status === "FAILED" || job.status === "ACTION REQUIRED").length, oldestQueuedAt: queued.sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]?.createdAt || null, lastSuccessAt: success[0]?.completedAt || null }; }
}

let queue: JobQueueProvider | null = null;
export function getJobQueueProvider() { return queue || (queue = new LocalJobQueueProvider(getInfrastructureEnvironment())); }
function getInfrastructureEnvironment(): InfrastructureEnvironment { const value = String(process.env.XMF_ENVIRONMENT || process.env.APP_ENV || "LOCAL").toUpperCase(); return ["LOCAL", "SANDBOX", "STAGING", "PRODUCTION"].includes(value) ? value as InfrastructureEnvironment : "LOCAL"; }
