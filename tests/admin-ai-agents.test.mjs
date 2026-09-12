import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("AI Agents admin reporting uses the shared agent registry and remains admin-only", () => {
  const registry = source("lib/ai/agent-registry.ts");
  const route = source("app/api/admin/ai-agents/route.ts");
  const page = source("app/admin/ai-agents/page.tsx");
  const dashboard = source("components/admin/AdminAIAgentsDashboard.tsx");
  assert.match(route, /getAdminBySession/);
  assert.match(route, /admin\.role !== "ADMIN"/);
  assert.match(route, /@\/lib\/ai\/agent-registry/);
  assert.match(page, /redirect\("\/admin\/login"\)/);
  assert.match(dashboard, /RESPONSIBILITIES/);
  assert.match(dashboard, /AGENT EXPERIENCE LOG/);
  assert.match(dashboard, /custom/);
  for (const name of ["Atlas", "Pixel", "Ledger", "Echo", "Nova", "Route", "Todd", "Riley", "Sage", "Maya", "Katy"]) {
    assert.match(registry, new RegExp(`\\b${name}:`));
  }
});

test("AI Agents reporting reads existing telemetry and redacts operational references", () => {
  const route = source("app/api/admin/ai-agents/route.ts");
  const dashboard = source("components/admin/AdminAIAgentsDashboard.tsx");
  for (const eventType of ["ai.interaction_completed", "ai.interaction_failed", "ai.handoff", "ai.escalated", "ai.feedback_received", "ai.tool_failure"]) {
    assert.match(route, new RegExp(eventType.replaceAll(".", "\\.")));
  }
  assert.match(route, /intelligence_activity_logs/);
  assert.match(route, /analytics_events/);
  assert.match(route, /slice\(0, 12\)/);
  assert.match(route, /raw conversation text/);
  assert.match(dashboard, /Redacted aggregate view/);
});

test("AI Agents dashboard styling and custom date filters are present", () => {
  const css = source("app/globals.css");
  const dashboard = source("components/admin/AdminAIAgentsDashboard.tsx");
  assert.match(css, /\.admin-ai-agents-page/);
  assert.match(css, /\.admin-ai-agent-list/);
  assert.match(css, /@media \(max-width: 720px\)/);
  assert.match(dashboard, /type="date"/);
  assert.match(dashboard, /new Date\(`\$\{customStart\}/);
  assert.match(dashboard, /new Date\(`\$\{customEnd\}/);
});
