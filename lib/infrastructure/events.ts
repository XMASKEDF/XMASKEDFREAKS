import { randomUUID } from "node:crypto";
import { serviceCredentials, serviceHeaders } from "@/lib/api-user";
import type { InfrastructureEnvironment } from "./types";

export type PlatformEventName = "payment.confirmed" | "payment.failed" | "payment.refunded" | "payment.chargeback" | "order.created" | "order.paid" | "order.fulfillment_requested" | "order.fulfilled" | "tip.completed" | "coins.purchased" | "coins.credited" | "coins.spent" | "product.purchased" | "printify.submitted" | "printify.failed" | "painting.fulfillment_required" | "audio.purchased" | "user.registered" | "favorite.added" | "live.started" | "live.stopped" | "game.completed" | "game.score_accepted" | "payout.requested" | "payout.settled" | "payout.failed" | "entitlement.granted" | "entitlement.revoked" | "admin.bank_destination_changed" | "admin.setting_changed" | "account.blocked" | "account.unblocked";
export type PlatformEvent<T = unknown> = { eventId: string; name: PlatformEventName; environment: InfrastructureEnvironment; occurredAt: string; source: string; payload: T; relatedEntityIds: string[]; safeMetadata: Record<string, unknown>; correlationId?: string };
export type EventHandler<T = unknown> = (event: PlatformEvent<T>) => Promise<void> | void;
export type EventHandlerFailure = { eventId: string; eventName: PlatformEventName; handler: string; error: string; occurredAt: string };

async function persistHandlerFailure(failure: EventHandlerFailure, environment: InfrastructureEnvironment) {
  const service = serviceCredentials();
  if (!service) return;
  await fetch(`${service.url}/rest/v1/infrastructure_event_handler_failures`, {
    method: "POST",
    headers: serviceHeaders(service, "return=minimal"),
    body: JSON.stringify({ event_id: failure.eventId, event_name: failure.eventName, handler_name: failure.handler, environment, error: failure.error })
  }).catch(() => undefined);
}

export interface EventBus { publish<T>(name: PlatformEventName, payload: T, options?: { eventId?: string; correlationId?: string; source?: string; relatedEntityIds?: string[]; safeMetadata?: Record<string, unknown> }): Promise<PlatformEvent<T>>; subscribe<T>(name: PlatformEventName, handler: EventHandler<T>): () => void; isProcessed(eventId: string): boolean; failures(): EventHandlerFailure[]; }

export class LocalEventBus implements EventBus {
  private readonly handlers = new Map<PlatformEventName, Set<EventHandler>>();
  private readonly processed = new Set<string>();
  private readonly processing = new Set<string>();
  private readonly handlerFailures: EventHandlerFailure[] = [];
  private readonly environment: InfrastructureEnvironment;
  constructor(environment: InfrastructureEnvironment) { this.environment = environment; }
  async publish<T>(name: PlatformEventName, payload: T, options: { eventId?: string; correlationId?: string; source?: string; relatedEntityIds?: string[]; safeMetadata?: Record<string, unknown> } = {}) { const event: PlatformEvent<T> = { eventId: options.eventId || randomUUID(), name, environment: this.environment, occurredAt: new Date().toISOString(), source: options.source || "application", payload, relatedEntityIds: (options.relatedEntityIds || []).slice(0, 20), safeMetadata: Object.fromEntries(Object.entries(options.safeMetadata || {}).filter(([key]) => !/password|token|secret|card|cvv|bank|address/i.test(key)).slice(0, 30)), correlationId: options.correlationId }; if (this.processed.has(event.eventId) || this.processing.has(event.eventId)) return event; this.processing.add(event.eventId); let failed = false; for (const handler of this.handlers.get(name) || []) { try { await handler(event); } catch (error) { failed = true; const failure = { eventId: event.eventId, eventName: name, handler: handler.name || "anonymous", error: error instanceof Error ? error.message : "handler_failed", occurredAt: new Date().toISOString() }; this.handlerFailures.push(failure); await persistHandlerFailure(failure, this.environment); } } this.processing.delete(event.eventId); if (!failed) this.processed.add(event.eventId); return event; }
  subscribe<T>(name: PlatformEventName, handler: EventHandler<T>) { const set = this.handlers.get(name) || new Set(); set.add(handler as EventHandler); this.handlers.set(name, set); return () => set.delete(handler as EventHandler); }
  isProcessed(eventId: string) { return this.processed.has(eventId); }
  failures() { return this.handlerFailures.slice(-100); }
}

let bus: EventBus | null = null;
export function getEventBus() { return bus || (bus = new LocalEventBus(getEventEnvironment())); }
function getEventEnvironment(): InfrastructureEnvironment { const value = String(process.env.XMF_ENVIRONMENT || process.env.APP_ENV || "LOCAL").toUpperCase(); return ["LOCAL", "SANDBOX", "STAGING", "PRODUCTION"].includes(value) ? value as InfrastructureEnvironment : "LOCAL"; }
