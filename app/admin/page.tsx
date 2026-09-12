import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import BrandLogo from "@/components/BrandLogo";
import BrandingPanel from "@/components/BrandingPanel";
import BackgroundMediaPanel from "@/components/admin/media/BackgroundMediaPanel";
import MotionPerformancePanel from "@/components/admin/MotionPerformancePanel";
import AdminCustomerPreview from "@/components/admin/AdminCustomerPreview";
import PrivacyConsentPanel from "@/components/admin/PrivacyConsentPanel";
import { adminSessionCookie, getAdminBySession } from "@/lib/admin-auth";
import { getSiteBackgroundSettings } from "@/lib/media/backgrounds";
import { adminGameErrorCopy } from "@/lib/games/admin-error-copy";
import storeMessages from "@/public/locales/store/en.json";

type AdminControl = {
  id: string;
  category: string;
  title: string;
  status: "green" | "yellow" | "red";
  enabled: boolean;
  switchable: boolean;
  important: boolean;
  owner: string;
  lastChanged: string;
  changedBy: string;
  description: string;
  effect: string;
  tools: string[];
};

type AdminWidget = {
  label: string;
  value: string;
  status: "green" | "yellow" | "red";
  detail: string;
};

const dashboardWidgets: AdminWidget[] = [
  { label: "Platform Status", value: "Online", status: "green", detail: "Frontend build passes" },
  { label: "Online Users", value: "240", status: "green", detail: "Inflated public count remains visitor-facing only" },
  { label: "Current Stream", value: "Provider ready", status: "yellow", detail: "OBS endpoint still needs production connection" },
  { label: "Current Revenue", value: "$0 live", status: "yellow", detail: "Processor SDK not connected" },
  { label: "Wallet Balance", value: "$0 demo", status: "yellow", detail: "Ledger scaffold only" },
  { label: "Pending Reports", value: "3", status: "yellow", detail: "Moderation and support queues" },
  { label: "Pending Deposits", value: "Next 8h capable", status: "green", detail: "Scheduler supports Every 8 Hours" },
  { label: "Recent Activity", value: "Ready", status: "green", detail: "Audit hooks present" },
  { label: "Recent Moderation", value: "Permanent bans ready", status: "green", detail: "Manual unban required" },
  { label: "Server Health", value: "Build OK", status: "green", detail: "Next.js production build verified" },
  { label: "Database Health", value: "Schema scaffold", status: "yellow", detail: "Supabase production unverified" },
  { label: "Storage Usage", value: "Low", status: "green", detail: "Local assets only" },
  { label: "Payment Processor", value: "Not connected", status: "red", detail: "Hosted checkout required" },
  { label: "Streaming Status", value: "Provider slots", status: "yellow", detail: "Mux/Bunny/Cloudflare fields ready" },
  { label: "Queue Status", value: "Scaffold", status: "yellow", detail: "No production worker attached" },
  { label: "Background Jobs", value: "Prepared", status: "yellow", detail: "Cron/queue provider required" }
];

const adminSections = [
  "Dashboard",
  "Moderation",
  "Users",
  "Content",
  "Media",
  "Broadcast",
  "Games",
  "Payments",
  "Wallet",
  "Tips",
  "Analytics",
  "Reports",
  "Notifications",
  "Support",
  "Localization",
  "Security",
  "Permissions",
  "Logs",
  "System",
  "API",
  "Developer",
  "Backups",
  "Storage",
  "Streaming",
  "Database",
  "Integrations",
  "Configuration"
  ,"Email List"
  ,"Feedback"
];

const adminControls: AdminControl[] = [
  { id: "media", category: "Experience", title: "Media Library", status: "green", enabled: true, switchable: true, important: false, owner: "Pixel", lastChanged: "System default", changedBy: "System", description: "Central picture uploads, folders, categories, metadata, variants, image usage, previews, and reusable website assignment.", effect: "Disabling hides media management while preserving stored originals, variants, metadata, usage references, and audit history.", tools: ["Upload Pictures", "Image Library", "Categories", "Folders", "Image Usage", "Image Picker"] },
  { id: "rights-media", category: "Content", title: "Media Rights", status: "yellow", enabled: true, switchable: true, important: true, owner: "Pixel", lastChanged: "System default", changedBy: "System", description: "Ownership and license records, commercial-use checks, attribution requirements, expirations, restrictions, and publish-review evidence.", effect: "Disabling optional rights management preserves uploaded files, rights records, and publishing history.", tools: ["Rights records", "Expiration review", "Publish checks", "Documentation references"] },
  { id: "merch", category: "Experience", title: "Merch Management", status: "green", enabled: true, switchable: true, important: false, owner: "Pixel", lastChanged: "System default", changedBy: "System", description: "Private merchandise categories, products, visibility, images, coin pricing, inventory, favorites reporting, and links into the existing Printify management system.", effect: "Disabling the optional admin workspace preserves products, orders, favorites, inventory history, and Printify mappings.", tools: ["Add category", "Add product", "Duplicate", "Archive", "Inventory", "Printify mappings" ] },
  { id: "privacy", category: "Safety", title: "Privacy & Cookies", status: "yellow", enabled: true, switchable: true, important: true, owner: "Atlas", lastChanged: "System default", changedBy: "System", description: "First-party consent choices, 46-second prompt timing, granular optional categories, GPC handling, privacy links, and aggregate consent statistics.", effect: "Turning off the visible prompt keeps optional trackers blocked and preserves necessary security/session technologies.", tools: ["Consent settings", "GPC", "Policy links", "Sandbox tests", "Aggregate stats"] },
  { id: "branding", category: "Experience", title: "Branding", status: "green", enabled: true, switchable: true, important: false, owner: "Pixel", lastChanged: "System default", changedBy: "System", description: "Official logo, header spacing, hover glow, responsive scaling, favicon settings, original asset preservation, and optimized logo variants.", effect: "Disabling optional branding controls hides the management panel but never removes the public text-only fallback or saved logo files.", tools: ["Logo upload preview", "Size controls", "Glow controls", "Favicon settings", "Optimized assets"] },
  { id: "streaming", category: "Streaming", title: "Live Stream & OBS", status: "yellow", enabled: true, switchable: true, important: true, owner: "Echo", lastChanged: "System default", changedBy: "System", description: "OBS status, stream provider settings, source-to-viewer signal checks, and live loop controls.", effect: "Disabling pauses optional OBS automation only. It does not delete provider settings or stream logs.", tools: ["OBS status", "Provider settings", "Stream health", "Lag alerts"] },
  { id: "theater-audio", category: "Streaming", title: "Theater Mode & Audio Priority", status: "green", enabled: true, switchable: true, important: false, owner: "Echo", lastChanged: "System default", changedBy: "System", description: "Theater layout, audio enhancement, visible chat/tips, and immersive playback behavior.", effect: "Disabling removes optional theater enhancements while normal playback remains available.", tools: ["Theater Mode", "Audio compression", "Volume priority"] },
  { id: "background-music", category: "Streaming", title: "Background Music & Live Lobby", status: "green", enabled: true, switchable: true, important: false, owner: "Echo", lastChanged: "System default", changedBy: "System", description: "Offline lobby playlists, pre-show audio, track ordering, one-hour local playback cache metadata, Now Playing notices, and live ducking controls.", effect: "Disabling stops optional lobby music while preserving playlists, uploaded references, cache metadata, and playback logs.", tools: ["Playlist manager", "Live ducking", "Now Playing", "Cache status"] },
  { id: "redirects", category: "Traffic", title: "Redirect Manager", status: "yellow", enabled: true, switchable: true, important: true, owner: "Route", lastChanged: "System default", changedBy: "System", description: "Deterministic /go routing, OBS-live priority, offline split, manual overrides, and destination logs.", effect: "Disabling pauses offline routing controls. OBS-live priority and historical redirect records remain protected.", tools: ["/go rules", "60/40 split", "Offline blocks", "Redirect logs"] },
  { id: "campaigns", category: "Traffic", title: "Campaign Tracking", status: "green", enabled: true, switchable: true, important: false, owner: "Route", lastChanged: "System default", changedBy: "System", description: "Campaign parameters, referrer capture, conversion paths, and traffic source mapping.", effect: "Disabling hides optional campaign views while preserving captured attribution logs.", tools: ["UTM capture", "Referral source", "Conversion paths"] },
  { id: "referrals", category: "Analytics", title: "Referral Analytics", status: "green", enabled: true, switchable: true, important: false, owner: "Route", lastChanged: "System default", changedBy: "System", description: "Referring websites, source totals, bounce, session duration, and conversion actions.", effect: "Disabling hides optional referral dashboards without deleting historical analytics.", tools: ["Source table", "Trend charts", "Conversion drill-down"] },
  { id: "geo", category: "Analytics", title: "Geo-Targeting & World Clocks", status: "green", enabled: true, switchable: true, important: false, owner: "Route", lastChanged: "System default", changedBy: "System", description: "Country rollups, active visitor clocks, approximate locations, and geographic reports.", effect: "Disabling pauses optional geo displays. Security signals and existing analytics remain stored.", tools: ["World clocks", "Geo map", "Visitor table"] },
  { id: "notifications", category: "Messaging", title: "Live Notifications & Email", status: "green", enabled: true, switchable: true, important: false, owner: "Maya", lastChanged: "System default", changedBy: "System", description: "Live announcements, email campaigns, templates, cooldowns, opt-ins, previews, and delivery logs.", effect: "Disabling stops optional outbound campaigns but preserves templates, opt-ins, and history.", tools: ["Email campaigns", "Cooldown", "Preview", "Delivery logs"] },
  { id: "support", category: "Support", title: "Customer Support & FAQ", status: "green", enabled: true, switchable: true, important: false, owner: "Maya", lastChanged: "System default", changedBy: "System", description: "FAQ, support submissions, Layer 1 visitor agents, hidden specialist escalation packets, and same-agent visitor continuity.", effect: "Disabling pauses optional AI responses. Support history and admin escalation logs remain available.", tools: ["FAQ", "Support messages", "Layered agents"] },
  { id: "support-cases", category: "Support", title: "Support Cases", status: "yellow", enabled: true, switchable: true, important: false, owner: "Maya", lastChanged: "System default", changedBy: "System", description: "Structured customer cases, priorities, status changes, internal notes, related order references, and escalation continuity.", effect: "Disabling the optional case workspace preserves submitted cases and support history.", tools: ["Case queue", "Priority review", "Status changes", "Escalation history"] },
  { id: "agents", category: "Intelligence", title: "AI Agents & Claude Control", status: "green", enabled: true, switchable: true, important: false, owner: "Claude", lastChanged: "System default", changedBy: "System", description: "Claude coordination across Maya/Riley/Nova/Sage and hidden Atlas/Pixel/Ledger/Echo/Route/Todd specialist reports.", effect: "Disabling pauses optional AI coordination. Audit logs and manual admin controls remain available.", tools: ["Claude packets", "Agent reports", "Activity log"] },
  { id: "payments", category: "Money", title: "Payments", status: "red", enabled: true, switchable: false, important: true, owner: "Ledger", lastChanged: "Always active", changedBy: "System", description: "Hosted checkout, processor tokens, webhook idempotency, risk rules, payment status, and masked references.", effect: "Core payment integrity cannot be disabled. Money actions require explicit admin approval.", tools: ["Hosted checkout", "Webhook dedupe", "Risk thresholds"] },
  { id: "accounting", category: "Finance", title: "Accounting", status: "yellow", enabled: true, switchable: true, important: true, owner: "Ledger", lastChanged: "System default", changedBy: "System", description: "Server-sourced revenue, recorded costs, tax-data readiness, cash-versus-profit reporting, and export preparation.", effect: "Disabling the optional accounting view preserves ledger records, tax records, and audit history.", tools: ["Revenue categories", "Tax readiness", "P&L estimate", "Cash flow", "Exports"] },
  { id: "risk-center", category: "Safety", title: "Risk Center", status: "yellow", enabled: true, switchable: false, important: true, owner: "Ledger", lastChanged: "Always active", changedBy: "System", description: "Normalized fraud signals, review queues, account and payment risk decisions, and administrator review evidence.", effect: "Risk recording remains protected. Individual review decisions require authenticated administrator actions and audit logging.", tools: ["Risk queue", "Review history", "Payment signals", "Account signals"] },
  { id: "entitlements", category: "Money", title: "Entitlements", status: "yellow", enabled: true, switchable: false, important: true, owner: "Ledger", lastChanged: "Always active", changedBy: "System", description: "Central paid-access authority for digital purchases, downloads, subscriptions, promotions, and refund or chargeback holds.", effect: "Entitlement checks remain active for protected media. Admin holds preserve history and do not delete customer records.", tools: ["Access records", "Refund holds", "Chargeback holds", "Download protection"] },
  { id: "payment-readiness", category: "Money", title: "Payment Processor Readiness", status: "yellow", enabled: true, switchable: true, important: true, owner: "Ledger", lastChanged: "System default", changedBy: "System", description: "Canonical USD pricing, integer minor-unit validation, hosted checkout readiness, processor amount verification, and international processor fallback notes.", effect: "Disabling optional readiness views preserves payment integrity. Processor restrictions and final amount validation stay server-side.", tools: ["Canonical pricing", "Processor health", "Idempotency", "Payment limits"] },
  { id: "coin-policy", category: "Money", title: "Coin Usage Policy", status: "green", enabled: true, switchable: true, important: true, owner: "Ledger", lastChanged: "System default", changedBy: "System", description: "Coin usage disclosure, acknowledgement rules, receipt language, wallet/FAQ placement, future merchandise eligibility, and policy audit logs.", effect: "Disabling optional display placements never changes the legal policy or stored acknowledgements. Coin purchases should still require the configured acknowledgement server-side.", tools: ["Disclosure editor", "Acknowledgement logs", "Receipt language", "Merch eligibility"] },
  { id: "wallet", category: "Money", title: "Wallet & Coin Packages", status: "yellow", enabled: true, switchable: true, important: true, owner: "Ledger", lastChanged: "System default", changedBy: "System", description: "Wallet limits, deposits, tip spending, package tiers, bonus caps, and transaction history.", effect: "Disabling optional package sales keeps balances, ledgers, and historical transactions intact.", tools: ["Coin packages", "Wallet ledger", "Bonus cap", "Testing mode"] },
  { id: "bank-payouts", category: "Money", title: "Bank Payouts", status: "yellow", enabled: true, switchable: true, important: true, owner: "Ledger", lastChanged: "System default", changedBy: "System", description: "Protected manual payout requests, provider settlement states, masked destination details, bounded internal sweeps, reconciliation, and payout audit history.", effect: "Disabling optional payout requests preserves earnings, settings, and payout history. No provider-confirmed payout is implied.", tools: ["Payout controls", "Masked destination", "Provider status", "Payout log"] },
  { id: "deposit-schedule", category: "Money", title: "Creator Deposit Schedule", status: "yellow", enabled: true, switchable: true, important: true, owner: "Ledger", lastChanged: "System default", changedBy: "System", description: "Manual, hourly, every 4 hours, every 8 hours, every 12 hours, daily, weekly, and monthly payout cadence controls.", effect: "Disabling optional scheduling pauses automated payout jobs without changing wallet ledgers or payout history.", tools: ["Every 8 Hours", "Next payout", "Countdown", "Payout worker"] },
  { id: "access", category: "Access", title: "Live Entry & Viewing Credit", status: "yellow", enabled: true, switchable: false, important: true, owner: "Sage", lastChanged: "System default", changedBy: "System", description: "Server-owned Live entry, 10-coin/$5 requirement, 5-minute post-entry grace, refillable viewing credit, reminders, exemptions, restrictions, and verified return attempts.", effect: "Core contribution integrity cannot be disabled from a client-side switch. Protected settings remain in Bad Accounts.", tools: ["Watch periods", "Activity tracker", "Reminder history", "Bad Accounts", "A() / V()"] },
  { id: "moderation", category: "Safety", title: "Moderation & Kick Rules", status: "red", enabled: true, switchable: false, important: true, owner: "Sage", lastChanged: "Always active", changedBy: "System", description: "Prohibited language, bans, appeals, account risk, abuse history, and removal rules.", effect: "Core abuse protection cannot be disabled from ADMIN.", tools: ["Prohibited phrases", "Ban logs", "Appeals"] },
  { id: "security", category: "Safety", title: "DDoS & Lockdown Protection", status: "red", enabled: true, switchable: false, important: true, owner: "Sage", lastChanged: "Always active", changedBy: "System", description: "Rate limits, abuse scoring, bot detection, request validation, temporary blocks, and CDN handoff.", effect: "Core security middleware cannot be disabled.", tools: ["Rate limits", "Security rules", "Attack logs"] },
  { id: "auth", category: "Safety", title: "Authentication & Admin Security", status: "red", enabled: true, switchable: false, important: true, owner: "Atlas", lastChanged: "Always active", changedBy: "System", description: "Admin setup, admin login, ADMIN role checks, 2FA policy, sessions, lockout, password reset, and audit logs.", effect: "Authentication and ADMIN protection cannot be disabled.", tools: ["Admin setup", "2FA", "Sessions", "Audit logs"] },
  { id: "games", category: "Engagement", title: "Games & Leaderboards", status: "green", enabled: true, switchable: true, important: false, owner: "Todd", lastChanged: "System default", changedBy: "System", description: "Embedded arcade games, controls, difficulty, high scores, leaderboards, and Todd QA.", effect: "Disabling hides optional games while preserving scores and session analytics.", tools: ["Game catalog", "Leaderboard", "Todd QA"] },
  { id: "localization", category: "Global", title: "Localization & Time Zones", status: "green", enabled: true, switchable: true, important: false, owner: "Maya", lastChanged: "System default", changedBy: "System", description: "Language preferences, missing translations, local time display, formatting, and account/footer selectors.", effect: "Disabling optional localization falls back to English/default display while preserving preferences.", tools: ["i18n files", "Time zones", "Missing translations"] },
  { id: "video-health", category: "Reliability", title: "HD Video Health", status: "yellow", enabled: true, switchable: true, important: false, owner: "Nova", lastChanged: "System default", changedBy: "System", description: "Playback diagnostics, buffering checks, resolution behavior, browser compatibility, and recovery paths.", effect: "Disabling pauses optional health alerts without blocking normal video playback.", tools: ["Playback diagnostics", "Provider fallback", "Browser checks"] },
  { id: "performance-power", category: "Reliability", title: "Performance & Power Optimization", status: "green", enabled: true, switchable: true, important: false, owner: "Katy", lastChanged: "System default", changedBy: "System", description: "Adaptive engine for device responsiveness, memory, battery, network, dropped frames, hidden tabs, multi-tab coordination, nonessential workload throttling, and long-session stability.", effect: "Disabling pauses optional adaptive throttling only. Video, payments, security, authentication, chat, tipping, and critical alerts keep full priority.", tools: ["Automatic mode", "Maximum Quality", "Balanced", "Low Power", "Streaming Priority", "Tab coordination", "Dropped-frame checks", "Background task throttling"] },
  { id: "frontend", category: "Reliability", title: "Frontend Reliability", status: "green", enabled: true, switchable: true, important: false, owner: "Pixel", lastChanged: "System default", changedBy: "System", description: "Layout, mobile responsiveness, accessibility, browser errors, and visual interaction checks.", effect: "Disabling optional UI monitoring leaves the public site running.", tools: ["Responsive QA", "Console checks", "Accessibility"] },
  { id: "backend", category: "Reliability", title: "Backend Reliability", status: "yellow", enabled: true, switchable: true, important: true, owner: "Atlas", lastChanged: "System default", changedBy: "System", description: "APIs, scheduled jobs, queues, database connections, service failures, and backend logs.", effect: "Disabling optional monitoring never disables core API/database operation.", tools: ["API logs", "Queues", "Database checks"] },
  { id: "reliability-center", category: "Reliability", title: "Reliability Center", status: "yellow", enabled: true, switchable: false, important: true, owner: "Atlas", lastChanged: "System default", changedBy: "System", description: "Unified incidents, health checks, wallet integrity, jobs, browser errors, backups, deployments, maintenance, recovery actions, and audit history.", effect: "Core reliability evidence and financial integrity holds cannot be disabled.", tools: ["Incident feed", "Health checks", "Wallet scan", "Safe recovery", "Daily summary"] },
  { id: "costs", category: "Finance", title: "Cost Dashboard", status: "green", enabled: true, switchable: true, important: false, owner: "Katy", lastChanged: "System default", changedBy: "System", description: "Hosting, streaming, database, storage, AI, email, analytics, security, and processor expenses.", effect: "Disabling hides optional finance views while preserving budgets and cost history.", tools: ["Budget", "Cost trends", "Provider usage"] },
  { id: "deployment", category: "Operations", title: "Deployment & Next.js Health", status: "yellow", enabled: true, switchable: true, important: true, owner: "Atlas", lastChanged: "System default", changedBy: "System", description: "Deployment readiness, Next.js health, environment variables, provider credentials, and release notes.", effect: "Disabling pauses optional deployment alerts, not production safety checks.", tools: ["Env checks", "Build health", "Release notes"] },
  { id: "infrastructure", category: "Operations", title: "Infrastructure", status: "yellow", enabled: true, switchable: true, important: true, owner: "Atlas", lastChanged: "System default", changedBy: "System", description: "Provider-neutral storage, CDN, cache, queues, workers, health checks, security edge, media processing, streaming, email, backups, events, and release readiness.", effect: "Disabling this optional dashboard does not disable core security, database integrity, payment audit trails, or the application itself.", tools: ["Provider health", "Storage", "Background jobs", "Event bus", "Cache", "Health endpoint", "Release readiness"] },
  { id: "sandbox", category: "Operations", title: "Sandbox Mode", status: "green", enabled: false, switchable: true, important: true, owner: "Atlas", lastChanged: "Off by default", changedBy: "System", description: "Isolated simulation foundation for accounts, wallets, purchases, orders, notifications, games, email previews, paintings, and merchandise.", effect: "Sandbox records must be tagged sandbox and excluded from production financial totals and outbound side effects.", tools: ["Simulation boundary", "Environment tag", "Safe previews"] },
  { id: "logs", category: "Operations", title: "System Logs", status: "red", enabled: true, switchable: false, important: true, owner: "Atlas", lastChanged: "Always active", changedBy: "System", description: "Admin audits, security events, support logs, payment references, redirect logs, and intelligence activity.", effect: "Protected logs cannot be disabled.", tools: ["Audit log", "Security log", "Payment log"] },
  { id: "emergency", category: "Operations", title: "Emergency Controls", status: "red", enabled: true, switchable: false, important: true, owner: "Sage", lastChanged: "Always active", changedBy: "System", description: "Lockdown, kick controls, manual safety actions, sensitive confirmations, and recovery summaries.", effect: "Emergency protections cannot be disabled.", tools: ["Lockdown", "Manual kick", "Recovery report"] }
];

const categories = ["All", ...Array.from(new Set(adminControls.map((control) => control.category)))];
const attention = adminControls.filter((control) => control.status !== "green");
const disabled = adminControls.filter((control) => !control.enabled);
const adminPacks = [
  { name: "Customer", categories: ["Support", "Messaging", "Safety"] },
  { name: "Commerce", categories: ["Money", "Experience", "Finance"] },
  { name: "Content", categories: ["Content", "Streaming", "Global"] },
  { name: "Games", categories: ["Engagement"] },
  { name: "Analytics", categories: ["Analytics", "Traffic"] },
  { name: "System", categories: ["Access", "Intelligence", "Operations", "Reliability"] }
];
const packControls = adminPacks.map((pack) => ({ ...pack, controls: adminControls.filter((control) => pack.categories.includes(control.category)).sort((a, b) => a.title.localeCompare(b.title)) }));

export default async function AdminDashboardPage() {
  const token = cookies().get(adminSessionCookie)?.value;
  const admin = await getAdminBySession(token);

  if (!admin || admin.role !== "ADMIN") {
    redirect("/admin/login");
  }
  if (!admin.first_setup_completed) redirect("/admin/welcome");
  const backgroundSettings = await getSiteBackgroundSettings();

  return (
    <main className="admin-auth-page admin-command-page">
      <section className="admin-auth-panel admin-command-hero">
        <BrandLogo className="admin-brand-link" priority />
        <p className="kicker">ADMIN</p>
        <h1>Unified Control Center</h1>
        <p>
          Every administrator-only setting, log, tool, schedule, switch, and configuration area belongs here.
          Standard users should never see, load, or call these controls.
        </p>
        <div className="admin-auth-grid">
          <span>Signed in<strong>{admin.username}</strong></span>
          <span>Role<strong>{admin.role}</strong></span>
          <span>2FA required<strong>{admin.two_factor_required ? "Yes" : "No"}</strong></span>
          <span>Session scope<strong>ADMIN routes only</strong></span>
          <span>Protected APIs<strong>/api/admin/* + role checks</strong></span>
          <span>Audit logging<strong>Required for all actions</strong></span>
          <span>Last login<strong>{admin.last_login_at ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Chicago" }).format(new Date(admin.last_login_at)) : "First secured session"}</strong></span>
        </div>
        <div className="admin-quick-actions">
          <a className="primary admin-link-button" href="#admin-workspace">VIEW FROM ADMIN SIDE</a>
          <a className="primary admin-link-button" href="/admin/intelligence">Open Intelligence</a>
          <a className="primary admin-link-button" href="/admin/ai-agents">AI AGENTS</a>
          <a className="secondary admin-link-button" href="/admin/games">Manage Games</a>
          <a className="secondary admin-link-button" href="/admin/error-logs">{adminGameErrorCopy.title}</a>
          <a className="secondary admin-link-button" href="/admin/chat">Chat Management</a>
          <a className="secondary admin-link-button" href="/admin/tips">Payments · Tip Menu</a>
          <a className="primary admin-link-button" href="/admin/payments">Hosted Payments</a>
          <a className="secondary admin-link-button" href="/admin/audio-clips">{storeMessages["audioAdmin.title"]}</a>
          <a className="secondary admin-link-button" href="/admin/merch">MERCH</a>
          <a className="primary admin-link-button" href="/admin/printify">Printify Management</a>
          <a className="secondary admin-link-button" href="/admin/orders">ORDERS</a>
          <a className="secondary admin-link-button" href="/admin/customers">CUSTOMERS</a>
          <a className="primary admin-link-button" href="/admin/bad-accounts">BAD ACCOUNTS</a>
          <a className="primary admin-link-button" href="/admin/prelaunch">Pre-Launch Operations</a>
          <a className="primary admin-link-button" href="/admin/live">Live Control Room</a>
          <a className="secondary admin-link-button" href="/admin/catalog">Upcoming Reel</a>
          <a className="secondary admin-link-button" href="/admin/paintings">Painting Auctions</a>
          <a className="primary admin-link-button" href="/admin/feet">Feet Requests</a>
          <a className="primary admin-link-button" href="/admin/privacy">Privacy &amp; Cookies</a>
          <a className="secondary admin-link-button" href="/admin/external-platforms">External Platforms</a>
          <a className="secondary admin-link-button" href="/admin/media">MEDIA</a>
          <a className="secondary admin-link-button" href="/admin/translations">Translations</a>
          <a className="primary admin-link-button" href="/admin/security">Security</a>
          <a className="primary admin-link-button" href="/admin/reliability">Reliability Center</a>
          <a className="primary admin-link-button" href="/admin/system/infrastructure">Infrastructure</a>
          <a className="primary admin-link-button" href="/admin/system/backbone">Production Backbone</a>
          <a className="primary admin-link-button" href="/admin/update-control">UPDATE CONTROL</a>
          <a className="primary admin-link-button" href="/admin/operationalization">Operationalization Center</a>
          <a className="primary admin-link-button" href="/admin/analytics/earnings">Earnings Analytics</a>
          <a className="primary admin-link-button" href="/admin/analytics/traffic">Traffic Sources</a>
          <a className="secondary admin-link-button" href="/admin/email-list">Email List</a>
          <a className="secondary admin-link-button" href="/admin/feedback">Feedback</a>
          <a className="secondary admin-link-button" href="/sandbox">Open Sandbox</a>
          <form action="/api/admin/logout" method="post">
            <button className="secondary" type="submit">Logout</button>
          </form>
        </div>
      </section>

      <BrandingPanel />
      <BackgroundMediaPanel initialSettings={backgroundSettings} />

      <AdminCustomerPreview />

      <section className="admin-dashboard-widgets" aria-label="ADMIN dashboard widgets">
        {dashboardWidgets.map((widget) => (
          <article className="admin-dashboard-widget" data-state={widget.status} key={widget.label}>
            <span>{widget.label}</span>
            <strong>{widget.value}</strong>
            <small>{widget.detail}</small>
          </article>
        ))}
      </section>

      <section className="admin-section-strip" aria-label="ADMIN sections">
        {[...adminSections].sort((a, b) => a.localeCompare(b)).map((section) => (
          <a href={`#${section.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`} key={section}>{section}</a>
        ))}
      </section>

      <section className="admin-command-toolbar" aria-label="ADMIN quick views">
        <label>
          Global admin search
          <input type="search" placeholder="Search users, games, reports, settings, logs, creators, payments, moderation cases..." />
        </label>
        <label>
          View
          <select defaultValue="all">
            <option value="all">All controls</option>
            <option value="attention">Needs Attention</option>
            <option value="disabled">Currently Disabled</option>
            <option value="favorites">Favorites</option>
            <option value="recent">Recent settings</option>
          </select>
        </label>
        <div className="admin-filter-pills">
          {categories.map((category) => <span key={category}>{category}</span>)}
        </div>
      </section>

      <section className="admin-status-strip" aria-label="ADMIN status summary">
        <span>Total controls<strong>{adminControls.length}</strong></span>
        <span>Needs attention<strong>{attention.length}</strong></span>
        <span>Currently disabled<strong>{disabled.length}</strong></span>
        <span>Core locked<strong>{adminControls.filter((control) => !control.switchable).length}</strong></span>
      </section>

      <section className="admin-attention-panel" aria-label="Needs Attention">
        <div>
          <p className="kicker">Needs Attention</p>
          <h2>Review before launch</h2>
        </div>
        <div className="admin-attention-list">
          {attention.slice(0, 8).map((control) => (
            <span key={control.id}>{control.title}<strong>{control.owner} · {control.status}</strong></span>
          ))}
        </div>
      </section>

      <section className="admin-command-workspace" id="admin-workspace" aria-label="ADMIN workspace">
        <aside className="admin-pack-nav">
          <p className="kicker">ADMIN PACKS</p>
          {packControls.map((pack) => <details open key={pack.name}><summary>{pack.name}<span>{pack.controls.length}</span></summary><nav aria-label={`${pack.name} controls`}>{pack.controls.map((control) => <a href={`#${control.id}`} key={control.id}>{control.title}</a>)}</nav></details>)}
        </aside>
        <div className="admin-pack-content">
          {packControls.map((pack) => <section className="admin-pack-section" id={`pack-${pack.name.toLowerCase()}`} key={pack.name}><header><div><p className="kicker">{pack.name.toUpperCase()} PACK</p><h2>{pack.name} controls</h2><p>Alphabetized controls for {pack.name.toLowerCase()} operations.</p></div></header><div className="admin-control-grid">{pack.controls.map((control) => (
          <article className="admin-control-card" data-state={control.enabled ? control.status : "disabled"} id={control.id} key={control.id}>
            <div className="admin-control-top">
              <div>
                <p className="kicker">{control.category} · {control.owner}</p>
                <h2>{control.title}</h2>
              </div>
              <span className={`admin-health ${control.enabled ? control.status : "disabled"}`}>{control.enabled ? control.status : "disabled"}</span>
            </div>
            <p>{control.description}</p>
            <div className="admin-switch-line">
              <span>
                Current state
                <strong>{control.switchable ? (control.enabled ? "On" : "Off") : "Core locked on"}</strong>
              </span>
              <form action="/api/admin/feature-switches" method="post">
                <input type="hidden" name="featureId" value={control.id} />
                <input type="hidden" name="nextState" value={control.enabled ? "off" : "on"} />
                {control.switchable && control.enabled && control.important ? (
                  <label className="admin-confirm-check">
                    <input type="checkbox" name="confirmed" value="yes" required />
                    Confirm impact
                  </label>
                ) : null}
                <button className="secondary" type="submit" disabled={!control.switchable}>
                  {control.switchable ? (control.enabled ? "Turn Off" : "Turn On") : "Protected"}
                </button>
              </form>
            </div>
            <div className="admin-switch-meta">
              <span>Last changed<strong>{control.lastChanged}</strong></span>
              <span>Changed by<strong>{control.changedBy}</strong></span>
              <span>Important<strong>{control.important ? "Confirm before disabling" : "Low-risk optional"}</strong></span>
            </div>
            <details>
              <summary>Open panel</summary>
              <p>{control.effect}</p>
              <ul>
                {control.tools.map((tool) => <li key={tool}>{tool}</li>)}
              </ul>
            </details>
          </article>))}</div></section>)}
        </div>
      </section>

      <MotionPerformancePanel />

      <section className="admin-auth-panel admin-command-policy">
        <h2>Protection Rules</h2>
        <ul>
          <li>All ADMIN pages must verify a secure session and the ADMIN role on the server.</li>
          <li>All ADMIN API actions must rate-limit, audit-log, and reject standard users even if they guess the route.</li>
          <li>Do not add switches to core security, authentication, payment integrity, data protection, logging, or basic site operation.</li>
          <li>Turning an optional feature off must preserve configuration and historical logs.</li>
          <li>Important systems require confirmation before disabling because they can affect visitors, payments, streaming, notifications, analytics, security, or saved data.</li>
        </ul>
      </section>
    </main>
  );
}
