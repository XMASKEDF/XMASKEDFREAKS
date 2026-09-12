export type UpdateStatus =
  | "PLANNED"
  | "IN PROGRESS"
  | "TESTING"
  | "COMPLETE"
  | "NEEDS INFRASTRUCTURE"
  | "BLOCKED";

export type UpdateItemStatus = "pending" | "complete" | "tested" | "needs follow-up";
export type UpdateClassification = "frontend" | "backend" | "database" | "infrastructure";
export type UpdateEnvironment = "SANDBOX" | "PRODUCTION";

export type UpdateRegistryItem = {
  id: string;
  title: string;
  status: UpdateItemStatus;
  description: string;
  files: string[];
  knownIssue?: string | null;
};

export type UpdateRegistryPackage = {
  id: string;
  title: string;
  recordedAt: string;
  area: string;
  classifications: UpdateClassification[];
  environment: UpdateEnvironment;
  status: UpdateStatus;
  description: string;
  testingStatus: string;
  knownIssue: string | null;
  rollbackNote: string;
  files: string[];
  items: UpdateRegistryItem[];
};

export const updateRegistry: UpdateRegistryPackage[] = [
  {
    id: "sandbox-intervention-1",
    title: "XMASKEDFREAKS UPDATE — SANDBOX INTERVENTION #1",
    recordedAt: "2026-09-06T00:00:00.000Z",
    area: "Admin workflow and owner development operations",
    classifications: ["frontend", "backend"],
    environment: "SANDBOX",
    status: "COMPLETE",
    description: "Established a persistent Admin-side change-management view and completed the approved storefront integration closeout without exposing Admin controls or credentials to visitors.",
    testingStatus: "Admin authorization, preview isolation, typecheck, and lint verified.",
    knownIssue: "Registry status changes are intentionally source-controlled during this development phase; no public change-approval workflow is enabled.",
    rollbackNote: "Remove the Update Control page link and registry entry together; existing Admin authorization and customer preview remain unchanged.",
    files: ["app/admin/update-control/page.tsx", "components/admin/UpdateControl.tsx", "lib/admin-update-registry.ts"],
    items: [
      {
        id: "registry",
        title: "Persistent Update Control registry",
        status: "tested",
        description: "Added a typed registry for update packages, classifications, environments, statuses, affected files, testing notes, known issues, rollback notes, and child change items.",
        files: ["lib/admin-update-registry.ts"]
      },
      {
        id: "admin-entry",
        title: "Owner development access map",
        status: "tested",
        description: "Added the Admin-only view of the existing development entry point and links to products, Live, media, analytics, inventory, commerce, content, and infrastructure tools.",
        files: ["app/admin/update-control/page.tsx", "components/admin/UpdateControl.tsx"]
      },
      {
        id: "separation",
        title: "Visitor and Admin separation preserved",
        status: "tested",
        description: "Preserved the existing public navigation renderer, routes, and isolated customer-preview iframe while applying the approved global tab order. Admin credentials and session state remain separate.",
        files: ["app/admin/update-control/page.tsx", "components/admin/UpdateControl.tsx", "lib/public-navigation.ts", "components/PublicNavigation.tsx"]
      },
      {
        id: "navigation-reorder",
        title: "Global navigation reorder",
        status: "tested",
        description: "Reordered the shared visitor tabs to Live, Subscribe, Upcoming, MERCH, Audio Clips, Games, Feet, Paintings, Feedback, and Search while keeping existing routes and the Fansly destination intact.",
        files: ["lib/public-navigation.ts", "components/PublicNavigation.tsx", "tests/storefront-navigation.test.ts"]
      },
      {
        id: "audit-boundary",
        title: "Audit and change-management boundary",
        status: "complete",
        description: "Kept Update Control as a review registry while existing configuration mutations continue using the established Admin audit system.",
        files: ["lib/admin-auth.ts", "lib/infrastructure/audit-ledger.ts"]
      }
    ]
  },
  {
    id: "release-candidate-integration-closeout",
    title: "XMASKEDFREAKS RELEASE CANDIDATE - CUSTOMER EXPERIENCE CLOSEOUT",
    recordedAt: "2026-09-11T00:00:00.000Z",
    area: "Customer account, discovery, storefront, and Live operations",
    classifications: ["frontend", "backend"],
    environment: "SANDBOX",
    status: "NEEDS INFRASTRUCTURE",
    description: "Consolidated the remaining customer-facing integration surfaces over the existing account, catalog, notification, cart, Live, and provider-neutral infrastructure boundaries.",
    testingStatus: "Source-level integration checks are ready; runtime provider, storage, media, email, and database migration checks remain environment-dependent.",
    knownIssue: "External payment, media, email, storage, streaming, and production database providers are not activated in this workspace.",
    rollbackNote: "Revert the account/search/audio/live-control changes as one package; no historical customer, wallet, order, or audit data is deleted by these UI/API changes.",
    files: ["lib/account/types.ts", "app/api/account/route.ts", "components/account/CustomerDashboard.tsx", "lib/site-search.ts", "components/search/SearchExperience.tsx", "components/audio-store/AudioStorefront.tsx", "components/GlobalRewardNotifications.tsx", "app/admin/live/page.tsx", "components/admin/LiveControlRoom.tsx"],
    items: [
      {
        id: "account-library",
        title: "Customer library and notifications",
        status: "tested",
        description: "The authenticated account state now includes owned notifications, digital library entries, and physical-order visibility using existing ownership-scoped APIs.",
        files: ["lib/account/types.ts", "app/api/account/route.ts", "components/account/CustomerDashboard.tsx"]
      },
      {
        id: "storefront-discovery",
        title: "Storefront discovery coverage",
        status: "tested",
        description: "Feet presets are indexed by the existing public search service, and audio pagination now exposes the full catalog instead of truncating before paging.",
        files: ["lib/site-search.ts", "app/api/search/route.ts", "components/search/SearchExperience.tsx", "components/audio-store/AudioStorefront.tsx"]
      },
      {
        id: "live-operations",
        title: "Protected Live operations hub",
        status: "tested",
        description: "Added an Admin-only navigation hub over existing playback diagnostics, chat, tips, earnings, reliability, notification, and infrastructure surfaces.",
        files: ["app/admin/live/page.tsx", "components/admin/LiveControlRoom.tsx", "app/globals.css"]
      },
      {
        id: "provider-gates",
        title: "Provider readiness remains explicit",
        status: "needs follow-up",
        description: "Payment, storage, email, streaming, fulfillment, and database activation remain fail-closed and are not simulated by this closeout.",
        files: ["lib/infrastructure/health.ts", "lib/infrastructure/provider-configuration.ts"]
      }
    ]
  },
  {
    id: "admin-operationalization-intervention-1",
    title: "XMASKEDFREAKS UPDATE — SANDBOX INTERVENTION #1 / ADMIN OPERATIONALIZATION",
    recordedAt: "2026-09-11T00:00:00.000Z",
    area: "Admin operational controls and development readiness",
    classifications: ["frontend", "backend", "database", "infrastructure"],
    environment: "SANDBOX",
    status: "NEEDS INFRASTRUCTURE",
    description: "Operationalized the remaining Admin control surfaces over the existing protected Admin shell, audit boundary, provider gates, and sandbox-safe service abstractions.",
    testingStatus: "Focused operationalization tests, typecheck, lint, and protected-route checks verified.",
    knownIssue: "Provider credentials, external callbacks, deployed workers, and production infrastructure remain intentionally inactive.",
    rollbackNote: "Disable the operationalization route and remove this additive registry entry/migration together; existing customer, wallet, order, and audit records are unaffected.",
    files: ["app/admin/operationalization/page.tsx", "components/admin/AdminOperationalizationCenter.tsx", "app/api/admin/operationalization/route.ts", "lib/admin-operationalization.ts", "supabase/migrations/20260911120000_admin_operationalization.sql"],
    items: [
      { id: "live-obs", title: "Live Stream & OBS", status: "needs follow-up", description: "Added readiness visibility and retained provider-safe diagnostics; live provider activation remains external.", files: ["components/admin/AdminOperationalizationCenter.tsx"] },
      { id: "theater-audio", title: "Theater Mode & Audio Priority", status: "tested", description: "Persisted theater/audio policy controls through the Admin operational state.", files: ["lib/admin-operationalization.ts", "app/api/admin/operationalization/route.ts"] },
      { id: "background-lobby", title: "Background Music & Live Lobby", status: "tested", description: "Added Shared Media Library playlist selection and lobby policy controls.", files: ["components/admin/AdminOperationalizationCenter.tsx"] },
      { id: "redirects", title: "Redirect Manager", status: "tested", description: "Added validated internal and approved external redirect rules with priority and enablement.", files: ["lib/admin-operationalization.ts", "app/api/admin/operationalization/route.ts"] },
      { id: "campaigns", title: "Campaign Tracking", status: "tested", description: "Added persistent campaign definitions with validated destinations.", files: ["components/admin/AdminOperationalizationCenter.tsx"] },
      { id: "geo-clocks", title: "Geo-Targeting & World Clocks", status: "tested", description: "Added aggregate, privacy-safe operational visibility without visitor-level location storage.", files: ["components/admin/AdminOperationalizationCenter.tsx"] },
      { id: "notifications", title: "Live Notifications & Email", status: "needs follow-up", description: "Added cooldown and queue controls with Resend fail-closed gating; delivery still needs provider configuration.", files: ["app/api/admin/operationalization/route.ts", "components/admin/AdminOperationalizationCenter.tsx"] },
      { id: "support-faq", title: "Customer Support & FAQ", status: "tested", description: "Added FAQ management and links to the existing support case/chat workstations.", files: ["components/admin/AdminOperationalizationCenter.tsx"] },
      { id: "payment-readiness", title: "Payment Processor Readiness", status: "needs follow-up", description: "Added readiness display and preserved provider-neutral fail-closed checkout; processor approval/configuration is external.", files: ["components/admin/AdminOperationalizationCenter.tsx", "app/api/payments/hosted/route.ts"] },
      { id: "coin-policy", title: "Coin Usage Policy", status: "tested", description: "Persisted immutable 1 coin = $0.50 policy and visitor-facing disclosure settings.", files: ["lib/admin-operationalization.ts"] },
      { id: "coin-packages", title: "Wallet & Coin Packages", status: "tested", description: "Added six editable package slots with server-derived base coins and bounded bonus presentation.", files: ["lib/admin-operationalization.ts", "app/api/live-config/route.ts", "app/api/payments/hosted/route.ts"] },
      { id: "bank-payouts", title: "Bank Payouts", status: "tested", description: "Added internal payout/deposit scheduling state without simulating settlement.", files: ["components/admin/AdminOperationalizationCenter.tsx"] },
      { id: "deposit-schedule", title: "Creator Deposit Schedule", status: "tested", description: "Added Admin-managed internal schedule controls separate from external payout settlement.", files: ["lib/admin-operationalization.ts"] },
      { id: "retired-25-minute-rule", title: "25-Minute Contribution Rule", status: "complete", description: "Retired stale current-policy wording and retained the approved current Live entry/hourly-credit architecture.", files: ["README.md", "XMASKEDFREAKS_FINAL_SETUP/12_ADMIN_OPERATIONALIZATION/ADMIN_TOOL_STATUS.md"] },
      { id: "moderation", title: "Moderation & Kick Rules", status: "tested", description: "Added links and operational visibility over existing moderation/restriction controls without changing enforcement.", files: ["components/admin/AdminOperationalizationCenter.tsx"] },
      { id: "performance", title: "Performance & Power Optimization", status: "tested", description: "Added aggregate retention controls and operational diagnostics without collecting visitor-level performance data.", files: ["lib/admin-operationalization.ts", "components/admin/AdminOperationalizationCenter.tsx"] },
      { id: "sandbox", title: "Sandbox Mode", status: "tested", description: "Added isolated scenario controls that cannot charge, credit, fulfill, send, or alter the public feed.", files: ["app/api/admin/operationalization/route.ts", "components/admin/AdminOperationalizationCenter.tsx"] }
    ]
  }
];

export function getUpdateRegistry() {
  return updateRegistry;
}
