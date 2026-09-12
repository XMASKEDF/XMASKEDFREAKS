import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import BrandLogo from "@/components/BrandLogo";
import { adminSessionCookie, getAdminBySession } from "@/lib/admin-auth";
import { agentProfiles } from "@/lib/ai/agent-registry";

const systems = [
  { name: "Payments", state: "Scaffold only", problem: "Processor not connected", severity: "high", agent: "Ledger", tools: ["Hosted checkout", "Webhook dedupe", "Payment health"], action: "Connect processor and validate webhook signing." },
  { name: "Live Stream & OBS", state: "Provider-ready", problem: "OBS endpoint missing", severity: "medium", agent: "Echo", tools: ["OBS status", "Provider switch", "Stream settings"], action: "Validate OBS endpoint and provider fallback." },
  { name: "Customer Support & FAQ", state: "Built", problem: "Email endpoint optional", severity: "low", agent: "Maya", tools: ["Support routing", "Agent stations", "Escalation payloads"], action: "Connect email provider when ready." },
  { name: "Backend Reliability", state: "Schema/API scaffolded", problem: "Supabase env required", severity: "medium", agent: "Atlas", tools: ["Schema", "API routes", "RLS review"], action: "Run migration and tighten admin policies." },
  { name: "Frontend Reliability", state: "Responsive prototype built", problem: "Production browser QA pending", severity: "medium", agent: "Pixel", tools: ["Responsive checks", "Console review", "Interaction tests"], action: "Run mobile and desktop visual QA." },
  { name: "Redirect Manager", state: "Rules scaffolded", problem: "Live-state endpoint required", severity: "medium", agent: "Route", tools: ["Redirect logs", "Referral data", "Destination rules"], action: "Connect server-verified OBS status before launch." },
  { name: "Games & Leaderboards", state: "Embedded games built", problem: "Production leaderboard persistence pending", severity: "low", agent: "Todd", tools: ["Game loop checks", "Input tests", "Leaderboard logs"], action: "Connect persistent leaderboard tables." },
  { name: "Moderation & Kick Rules", state: "Policy panel scaffolded", problem: "Production enforcement review pending", severity: "medium", agent: "Sage", tools: ["Moderation logs", "Prohibited phrases", "Ban controls"], action: "Review enforcement levels before launch." },
  { name: "HD Video Health", state: "Provider-ready", problem: "Bandwidth provider not connected", severity: "medium", agent: "Nova", tools: ["Playback diagnostics", "Browser checks", "Provider fallback"], action: "Validate real streams on mobile and desktop." },
  { name: "Performance & Fast Processing", state: "Cost-aware policy added", problem: "Provider limits pending", severity: "medium", agent: "Katy", tools: ["CDN status", "Server health", "Traffic spike alerts"], action: "Configure provider budgets and health checks." }
];

const reasoningProtocol = [
  "Inspect evidence first",
  "Identify the most likely cause",
  "Test the safest explanation",
  "Attempt approved low-risk repairs only",
  "Verify the result",
  "Document remaining risk"
];

export default async function IntelligencePage() {
  const token = cookies().get(adminSessionCookie)?.value;
  const admin = await getAdminBySession(token);

  if (!admin || admin.role !== "ADMIN") {
    redirect("/admin/login");
  }

  return (
    <main className="admin-auth-page intelligence-page">
      <section className="admin-auth-panel intelligence-shell">
        <BrandLogo className="admin-brand-link" priority />
        <p className="kicker">Claude Control Layer</p>
        <h1>Intelligence Operations</h1>
        <p>
          Claude is the central reasoning layer. Subagents remain specialist departments. Packets are compact by default:
          system state, problem, severity, affected users, recent changes, assigned agent, tools, confidence, and next action.
        </p>
        <div className="admin-auth-grid">
          <span>Admin<strong>{admin.username}</strong></span>
          <span>API route<strong>/api/claude/control</strong></span>
          <span>Approval gates<strong>Money · security · deletion · deployment</strong></span>
        </div>
      </section>

      <section className="intelligence-grid" aria-label="Claude system packets">
        {systems.map((system) => (
          <article className="intelligence-card" key={system.name}>
            <div>
              <p className="kicker">{system.severity}</p>
              <h2>{system.name}</h2>
            </div>
            <span>State<strong>{system.state}</strong></span>
            <span>Problem<strong>{system.problem}</strong></span>
            <span>Agent<strong>{system.agent}</strong></span>
            <span>Say<strong>{agentProfiles[system.agent]?.saying}</strong></span>
            <details>
              <summary>Compact packet</summary>
              <pre>{JSON.stringify({
                systemName: system.name,
                currentState: system.state,
                problem: system.problem,
                severity: system.severity,
                affectedUsers: system.severity === "high" ? "potential paying visitors" : "admin operators",
                recentChanges: ["Latest command center sync", "Support and moderation scaffolds active"],
                assignedAgent: system.agent,
                agentProfile: agentProfiles[system.agent],
                availableTools: [...system.tools, ...(agentProfiles[system.agent]?.controlledTools || [])],
                confidenceLevel: system.severity === "high" ? 0.52 : 0.72,
                recommendedNextAction: system.action,
                reasoningProtocol,
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
              }, null, 2)}</pre>
            </details>
          </article>
        ))}
      </section>

      <section className="admin-auth-panel intelligence-shell">
        <h2>Action Rules</h2>
        <ul>
          <li>Claude receives compact packets first, not whole databases or raw logs.</li>
          <li>Agents inspect evidence, test the safest explanation, attempt low-risk repairs only, verify, and document.</li>
          <li>Medium issues involve Claude and one supporting agent; critical cross-system issues trigger a coordinated Claude-led response.</li>
          <li>Agents can challenge one another respectfully when evidence conflicts, and Claude chooses the strongest explanation.</li>
          <li>Agents collaborate through Claude before a final repair plan is accepted.</li>
          <li>Safe actions include diagnostics, config validation, reports, retries, and test reruns.</li>
          <li>High-risk actions require explicit administrator approval.</li>
          <li>Every request should be logged to the Intelligence Activity Log when Supabase credentials are configured.</li>
        </ul>
      </section>
    </main>
  );
}
