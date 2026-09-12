import { NextRequest, NextResponse } from "next/server";
import { adminSessionCookie, getAdminBySession } from "@/lib/admin-auth";
import { serviceCredentials, serviceHeaders } from "@/lib/api-user";
import { agentProfiles } from "@/lib/ai/agent-registry";
import { getStoredBotDetectionConfig, type BotDetectionConfig } from "@/lib/infrastructure/bot-policy";

type Row = Record<string, unknown>;
type Period = "hour" | "today" | "7d" | "30d" | "custom";

const agentNames = Object.keys(agentProfiles);
const aiEventTypes = new Set(["ai.interaction_started", "ai.interaction_completed", "ai.interaction_failed", "ai.handoff", "ai.escalated", "ai.feedback_received", "ai.tool_failure"]);

function periodStart(period: Period, startParam: string | null) {
  if (period === "custom" && startParam) {
    const custom = new Date(startParam);
    if (!Number.isNaN(custom.getTime())) return custom;
  }
  const now = Date.now();
  return new Date(now - (period === "hour" ? 3_600_000 : period === "today" ? 86_400_000 : period === "7d" ? 7 * 86_400_000 : 30 * 86_400_000));
}

function periodEnd(endParam: string | null) {
  if (!endParam) return null;
  const end = new Date(endParam);
  return Number.isNaN(end.getTime()) ? null : end;
}

function strings(value: unknown) { return Array.isArray(value) ? value.map(String) : []; }
function metadata(row: Row) { return row.metadata && typeof row.metadata === "object" ? row.metadata as Row : {}; }
function eventAgent(row: Row) {
  const meta = metadata(row);
  const candidates = [row.agent, row.assigned_agent, meta.agent, meta.agentName, meta.sourceAgent, meta.destinationAgent];
  return candidates.map((value) => String(value || "")).find((value) => agentNames.includes(value)) || null;
}
function eventCategory(row: Row) {
  const meta = metadata(row);
  return String(row.category || row.request_category || meta.category || meta.requestCategory || "").trim().slice(0, 80) || null;
}
function eventOutcome(row: Row) {
  const meta = metadata(row);
  return String(row.outcome || meta.outcome || row.event_type || "").trim().slice(0, 80);
}
function safeOperationalSummary(value: unknown) {
  return String(value || "Operational activity")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/\b(?:sk|pk)_[A-Za-z0-9_-]+\b/g, "[redacted-token]")
    .replace(/\b(?:\d[ -]?){12,19}\b/g, "[redacted-number]")
    .slice(0, 120);
}
function safeTime(value: unknown) { const date = new Date(String(value || "")); return Number.isNaN(date.getTime()) ? null : date.toISOString(); }

async function readRows(service: NonNullable<ReturnType<typeof serviceCredentials>>, table: string, timestampColumn: string, start: Date, end: Date | null) {
  const query = new URLSearchParams({ select: "*", limit: "2000", order: `${timestampColumn}.desc` });
  query.set(timestampColumn, `gte.${start.toISOString()}`);
  if (end) query.append(timestampColumn, `lte.${end.toISOString()}`);
  if (table === "analytics_events") query.set("event_type", "like.ai.*");
  const response = await fetch(`${service.url}/rest/v1/${table}?${query.toString()}`, { headers: serviceHeaders(service), cache: "no-store" }).catch(() => null);
  return response?.ok ? await response.json().catch(() => []) as Row[] : [];
}

function buildBotReport(rows: Row[], config: BotDetectionConfig, configured: boolean) {
  const observed = rows.filter((row) => row.action === "bot_observed");
  const challenges = rows.filter((row) => row.action === "bot_challenge_required");
  const passed = rows.filter((row) => row.action === "bot_challenge_passed");
  const failed = rows.filter((row) => row.action === "bot_challenge_failed");
  const rateLimited = rows.filter((row) => row.action === "rate_limited");
  const blocked = rows.filter((row) => row.action === "blocked");
  const patternCounts = new Map<string, number>();
  for (const row of [...observed, ...challenges, ...failed]) { const pattern = safeOperationalSummary(row.reason || "bot signal"); patternCounts.set(pattern, (patternCounts.get(pattern) || 0) + 1); }
  return {
    supervisorAgentId: config.supervisorAgentId,
    status: config.enabled ? "ON" : "OFF",
    level: config.level.toUpperCase(),
    suspectedBots: configured ? observed.length : null,
    challenges: configured ? challenges.length : null,
    blocked: configured ? blocked.length : null,
    rateLimited: configured ? rateLimited.length : null,
    passedVerification: configured ? passed.length : null,
    failedVerification: configured ? failed.length : null,
    customerInterruptions: configured ? challenges.length + rateLimited.length : null,
    falsePositiveRateEstimated: configured ? (challenges.length ? Math.round(passed.length / challenges.length * 100) : 0) : null,
    topPatterns: [...patternCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([pattern, count]) => ({ pattern, count })),
    recommendation: configured && (challenges.length && passed.length / challenges.length >= 0.5 || rateLimited.length >= 20) ? "BOT DETECTION MAY BE TOO AGGRESSIVE · Review the rule and active level; Sage recommends Admin review." : "Customer-first posture is active. Sage observes and recommends; Admin decides policy changes."
  };
}

function buildReport(activityRows: Row[], eventRows: Row[], securityRows: Row[], period: Period, configured: boolean, botConfig: BotDetectionConfig) {
  const events = eventRows.filter((row) => aiEventTypes.has(String(row.event_type)));
  const all = agentNames.map((name) => {
    const profile = agentProfiles[name];
    const agentEvents = events.filter((row) => eventAgent(row) === name);
    const agentActivity = activityRows.filter((row) => {
      const assigned = [...strings(row.assigned_agents), String((row.compact_packet as Row | undefined)?.assignedAgent || "")];
      return assigned.includes(name);
    });
    const failed = agentEvents.filter((row) => ["ai.interaction_failed", "ai.tool_failure"].includes(String(row.event_type))).length;
    const completed = agentEvents.filter((row) => String(row.event_type) === "ai.interaction_completed").length;
    const interactions = agentEvents.filter((row) => String(row.event_type).startsWith("ai.interaction_")).length;
    const handoffs = agentEvents.filter((row) => String(row.event_type) === "ai.handoff").length;
    const escalations = agentEvents.filter((row) => String(row.event_type) === "ai.escalated").length + agentActivity.filter((row) => String(row.request_command) === "Escalate to Admin").length;
    const categories = new Map<string, number>();
    for (const row of agentEvents) { const category = eventCategory(row); if (category) categories.set(category, (categories.get(category) || 0) + 1); }
    const times = [...agentEvents.map((row) => safeTime(row.occurred_at)), ...agentActivity.map((row) => safeTime(row.created_at))].filter(Boolean) as string[];
    const latestError = agentEvents.find((row) => ["ai.interaction_failed", "ai.tool_failure"].includes(String(row.event_type)));
    const status = latestError ? "DEGRADED" : interactions || agentActivity.length ? "ACTIVE" : "IDLE";
    return {
      name,
      role: profile.role,
      responsibility: profile.focus,
      visibility: ["Maya", "Riley", "Nova", "Sage"].includes(name) ? "Layer 1 · Visitor Support" : "Layer 2 · Hidden Specialist",
      enabled: "UNVERIFIED · registry has no explicit enabled flag",
      status,
      metrics: { interactions, completed, handoffs, escalations, failures: failed, toolFailures: agentEvents.filter((row) => String(row.event_type) === "ai.tool_failure").length, feedback: agentEvents.filter((row) => String(row.event_type) === "ai.feedback_received").length, averageResponseMs: null },
      topRequests: [...categories.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([category, count]) => ({ category, count })),
      lastActivity: times.sort().at(-1) || null,
      issues: failed + escalations,
      activityTimeline: [...agentActivity.slice(0, 8).map((row) => ({ time: safeTime(row.created_at), type: "Claude operational action", reference: String(row.id || "").slice(0, 12), outcome: String(row.request_command || "Operational event").slice(0, 80) })), ...agentEvents.slice(0, 8).map((row) => ({ time: safeTime(row.occurred_at), type: String(row.event_type), reference: String(row.event_key || row.id || "").slice(0, 12), outcome: eventOutcome(row) }))].sort((a, b) => String(b.time).localeCompare(String(a.time))).slice(0, 12)
    };
  });
  const total = (key: keyof typeof all[number]["metrics"]) => all.reduce((sum, agent) => sum + Number(agent.metrics[key] || 0), 0);
  const recentActivity = activityRows.slice(0, 20).map((row) => ({ time: safeTime(row.created_at), type: `Claude · ${safeOperationalSummary(row.request_command || "activity")}`, agent: strings(row.assigned_agents).filter((name) => agentNames.includes(name)).join(", ") || "Claude", reference: String(row.id || "").slice(0, 12), outcome: safeOperationalSummary(row.result || row.actions_taken || "Operational action recorded") }));
  return {
    configured,
    period,
    redacted: true,
    source: "analytics_events + intelligence_activity_logs",
    message: configured && !events.length && !activityRows.length ? "No AI telemetry has been recorded for this period." : null,
    overview: { activeAgents: configured ? all.filter((agent) => agent.status === "ACTIVE").length : null, interactions: configured ? total("interactions") : null, completed: configured ? total("completed") : null, escalations: configured ? total("escalations") : null, failures: configured ? total("failures") : null, feedback: configured ? total("feedback") : null, handoffs: configured ? total("handoffs") : null },
    agents: all,
    recentActivity,
    botDetection: buildBotReport(securityRows, botConfig, configured),
    privacy: "Aggregate telemetry by default. Interaction references are truncated; raw conversation text, credentials, payment data, and secrets are excluded.",
    reliability: { repeatedToolFailures: configured ? total("toolFailures") : null, handoffFailures: null, incidentLink: "/admin/reliability", note: "Repeated dependency failures should be reviewed in Reliability Center; this dashboard does not create duplicate incidents." }
  };
}

export async function GET(request: NextRequest) {
  const admin = await getAdminBySession(request.cookies.get(adminSessionCookie)?.value);
  if (!admin || admin.role !== "ADMIN") return NextResponse.json({ ok: false, error: "ADMIN session required." }, { status: 403 });
  const params = request.nextUrl.searchParams;
  const period = (["hour", "today", "7d", "30d", "custom"] as Period[]).includes(params.get("period") as Period) ? params.get("period") as Period : "hour";
  const service = serviceCredentials();
  const botConfig = await getStoredBotDetectionConfig();
  if (!service) return NextResponse.json({ ok: true, data: buildReport([], [], [], period, false, botConfig) });
  const start = periodStart(period, params.get("start"));
  const end = periodEnd(params.get("end"));
  const [activityRows, eventRows, securityRows] = await Promise.all([readRows(service, "intelligence_activity_logs", "created_at", start, end), readRows(service, "analytics_events", "occurred_at", start, end), readRows(service, "security_events", "created_at", start, end)]);
  return NextResponse.json({ ok: true, data: buildReport(activityRows, eventRows, securityRows, period, true, botConfig) });
}
