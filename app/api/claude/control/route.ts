import { NextRequest, NextResponse } from "next/server";
import { adminSessionCookie, getAdminBySession } from "@/lib/admin-auth";
import { agentProfiles } from "@/lib/ai/agent-registry";

type ClaudeCommand =
  | "Analyze"
  | "Explain"
  | "Diagnose"
  | "Fix Safely"
  | "Assign Agent"
  | "Compare Logs"
  | "Test Again"
  | "Create Report"
  | "Escalate to Admin";

type SystemPacket = {
  systemName: string;
  currentState: string;
  problem: string;
  severity: "low" | "medium" | "high" | "critical";
  affectedUsers: string;
  recentChanges: string[];
  assignedAgent: string;
  availableTools: string[];
  confidenceLevel: number;
  recommendedNextAction: string;
  apiConnections?: string[];
  collaboratingAgents?: string[];
};

const allowedCommands: ClaudeCommand[] = [
  "Analyze",
  "Explain",
  "Diagnose",
  "Fix Safely",
  "Assign Agent",
  "Compare Logs",
  "Test Again",
  "Create Report",
  "Escalate to Admin"
];

const highRiskPatterns = [
  /money|payment|wallet|refund|charge|payout/i,
  /security|2fa|admin|account ownership|ban|delete|lockdown/i,
  /deploy|production|database migration|permanent/i
];

const reasoningProtocol = [
  "Inspect the available evidence first.",
  "Identify the most likely cause without guessing.",
  "Test the safest explanation.",
  "Attempt only approved low-risk repairs.",
  "Verify the result.",
  "Document what changed and what risk remains."
];

function compactPacket(packet: SystemPacket) {
  const assignedAgent = String(packet.assignedAgent || "Maya").slice(0, 60);
  const profile = agentProfiles[assignedAgent] || agentProfiles.Maya;
  return {
    systemName: String(packet.systemName || "Unknown system").slice(0, 120),
    currentState: String(packet.currentState || "unknown").slice(0, 180),
    problem: String(packet.problem || "none provided").slice(0, 240),
    severity: packet.severity || "medium",
    affectedUsers: String(packet.affectedUsers || "unknown").slice(0, 120),
    recentChanges: Array.isArray(packet.recentChanges) ? packet.recentChanges.slice(0, 5).map((item) => String(item).slice(0, 180)) : [],
    assignedAgent,
    agentProfile: profile,
    collaboratingAgents: Array.isArray(packet.collaboratingAgents) ? packet.collaboratingAgents.slice(0, 8).map((item) => String(item).slice(0, 60)) : [],
    availableTools: [
      ...(Array.isArray(packet.availableTools) ? packet.availableTools.slice(0, 8).map((item) => String(item).slice(0, 120)) : []),
      ...profile.controlledTools
    ].slice(0, 12),
    apiConnections: Array.isArray(packet.apiConnections) ? packet.apiConnections.slice(0, 8).map((item) => String(item).slice(0, 120)) : [],
    confidenceLevel: Math.max(0, Math.min(1, Number(packet.confidenceLevel || 0.5))),
    recommendedNextAction: String(packet.recommendedNextAction || "Analyze and report.").slice(0, 240),
    reasoningProtocol,
    collaborationRules: [
      "Visitor-facing support is Layer 1 only: Maya, Riley, Nova, and Sage may communicate directly with visitors.",
      "Hidden specialists are Layer 2 only: Atlas, Pixel, Ledger, Echo, Route, and Todd stay inside ADMIN and Claude logs.",
      "Claude is Layer 3 and returns visitor-facing decisions through the same Layer 1 agent who began the conversation.",
      "Small issues may be resolved by the assigned specialist with low-risk actions only.",
      "Medium issues involve Claude and one supporting agent.",
      "Critical or cross-system issues trigger Claude-led collaboration with relevant agents, a recovery plan, verification tests, and an administrator summary.",
      "Agents should challenge one another respectfully when evidence conflicts; Claude selects the strongest explanation based on evidence."
    ],
    supportArchitecture: {
      layer1VisitorSupport: ["Maya", "Riley", "Nova", "Sage"],
      layer2HiddenSpecialists: ["Atlas", "Pixel", "Ledger", "Echo", "Route", "Todd"],
      layer3Coordinator: "Claude",
      workflows: {
        billing: ["Visitor", "Riley", "Claude", "Ledger", "Atlas if needed", "Claude", "Riley", "Visitor"],
        playback: ["Visitor", "Nova", "Claude", "Echo", "Pixel", "Atlas if server-related", "Claude", "Nova", "Visitor"],
        moderation: ["Visitor", "Sage", "Claude", "Atlas", "Route if traffic history is needed", "Claude", "Sage", "Visitor"],
        general: ["Visitor", "Maya", "Claude only when needed", "Hidden specialist if needed", "Claude", "Maya", "Visitor"]
      }
    },
    agentReportTemplate: {
      problemObserved: "",
      evidenceCollected: [],
      likelyRootCause: "",
      confidenceScore: 0,
      safeActionsAttempted: [],
      result: "",
      remainingRisk: "",
      adminApprovalRequired: false
    }
  };
}

function requiresApproval(command: ClaudeCommand, packet: ReturnType<typeof compactPacket>) {
  if (command === "Escalate to Admin" || command === "Fix Safely") return true;
  const combined = `${packet.systemName} ${packet.problem} ${packet.availableTools.join(" ")} ${packet.apiConnections.join(" ")}`;
  return highRiskPatterns.some((pattern) => pattern.test(combined));
}

function localClaudeFallback(command: ClaudeCommand, packet: ReturnType<typeof compactPacket>) {
  const collaborators = packet.collaboratingAgents.length ? packet.collaboratingAgents : [packet.assignedAgent];
  return {
    summary: `${command} prepared for ${packet.systemName}. Current state: ${packet.currentState}.`,
    diagnosis: packet.problem,
    assignedAgents: collaborators,
    plan: [
      `${packet.assignedAgent}: ${packet.agentProfile.saying}`,
      "Inspect evidence and classify the issue from the compact packet.",
      `Ask ${packet.assignedAgent} for the agent report template: problem, evidence, likely root cause, confidence, safe actions, result, remaining risk, and approval need.`,
      "Bring in one support agent for medium issues or all relevant agents for critical cross-system issues.",
      "Compare conflicting evidence and select the strongest explanation.",
      "Recommend the lowest-risk repair path, verify the result, and document unresolved risk."
    ],
    safeRepairs: command === "Fix Safely"
      ? ["Prepare config validation, retry safe background jobs, rerun diagnostics, and create a report. Do not perform high-risk actions without approval."]
      : [],
    nextAction: packet.recommendedNextAction,
    unresolvedRisks: packet.severity === "high" || packet.severity === "critical"
      ? ["Administrator approval required before money, security, deletion, deployment, or account-ownership actions."]
      : []
  };
}

async function callClaude(command: ClaudeCommand, packet: ReturnType<typeof compactPacket>) {
  const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
  const model = process.env.CLAUDE_CONTROL_MODEL || "claude-3-5-sonnet-latest";
  if (!apiKey) return localClaudeFallback(command, packet);

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model,
      max_tokens: 900,
      system: [
        "You are Claude Control Layer, the central reasoning coordinator for XMASKEDFREAKS platform operations.",
        "Use only the compact structured packet provided. Do not request raw databases, full logs, full pages, secrets, or repeated context unless clearly necessary.",
        "Support architecture has three layers: Layer 1 visitor support contains Maya, Riley, Nova, and Sage; Layer 2 hidden specialists contains Atlas, Pixel, Ledger, Echo, Route, and Todd; Layer 3 is Claude.",
        "Hidden specialists must never answer ordinary visitor chat directly. Return visitor-facing conclusions through the same Layer 1 agent who started the conversation.",
        "Coordinate specialist agents as departments. Each agent must inspect evidence, identify the most likely cause, test the safest explanation, attempt only approved low-risk repairs, verify the result, and document what changed.",
        "Agents should be concise during normal operation, detailed during incidents, and honest when confidence is low. Encourage respectful challenge when evidence conflicts, then choose the strongest explanation based on evidence.",
        "Do not perform high-risk actions involving money, security, deletion, account ownership, or production deployment without explicit administrator approval.",
        "Return concise JSON with summary, diagnosis, assignedAgents, plan, safeRepairs, nextAction, unresolvedRisks, and approvalRequired."
      ].join(" "),
      messages: [
        {
          role: "user",
          content: JSON.stringify({ command, packet }, null, 2)
        }
      ]
    })
  });

  if (!response.ok) return localClaudeFallback(command, packet);
  const data = await response.json();
  const text = data.content?.map((item: { text?: string }) => item.text || "").join("\n").trim();
  try {
    return JSON.parse(text);
  } catch {
    return { ...localClaudeFallback(command, packet), claudeText: text };
  }
}

async function logIntelligenceActivity(input: Record<string, unknown>) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return;

  await fetch(`${supabaseUrl}/rest/v1/intelligence_activity_logs`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
      prefer: "return=minimal"
    },
    body: JSON.stringify(input)
  }).catch(() => undefined);
}

export async function POST(request: NextRequest) {
  const admin = await getAdminBySession(request.cookies.get(adminSessionCookie)?.value);
  if (!admin || admin.role !== "ADMIN") {
    return NextResponse.json({ ok: false, error: "ADMIN session required." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const command = allowedCommands.includes(body.command) ? body.command as ClaudeCommand : "Analyze";
  const packet = compactPacket(body.packet || {});
  const approvalRequired = requiresApproval(command, packet);
  const result = await callClaude(command, packet);

  const activity = {
    admin_user_id: admin.id,
    request_command: command,
    system_name: packet.systemName,
    assigned_agents: result.assignedAgents || packet.collaboratingAgents || [packet.assignedAgent],
    tools_used: packet.availableTools,
    findings: result.diagnosis || packet.problem,
    actions_taken: approvalRequired ? "Prepared recommendation only; admin approval required before high-risk action." : (result.safeRepairs || []).join("; "),
    approval_required: approvalRequired,
    result,
    unresolved_risks: result.unresolvedRisks || [],
    compact_packet: packet
  };
  await logIntelligenceActivity(activity);

  return NextResponse.json({
    ok: true,
    command,
    approvalRequired,
    packet,
    result,
    activityLogged: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
  });
}
