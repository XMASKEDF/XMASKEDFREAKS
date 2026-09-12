export type ReliabilitySeverity = 1 | 2 | 3 | 4 | 5;
export type ReliabilityStatus =
  | "Detected"
  | "Investigating"
  | "Contained"
  | "Monitoring"
  | "Resolved"
  | "False Positive"
  | "Requires Vendor"
  | "Requires Admin Action";
export type PlatformStatus = "Operational" | "Degraded" | "Partial Outage" | "Major Outage" | "Kill Switch" | "Recovering";
export type HealthState = "operational" | "degraded" | "outage" | "unverified";

export type IncidentInput = {
  title: string;
  plainExplanation: string;
  technicalExplanation?: string;
  severity: ReliabilitySeverity;
  feature: string;
  affectedRoute?: string;
  affectedCustomerCount?: number;
  affectedOrderCount?: number;
  affectedWalletTransactionCount?: number;
  affectedRegion?: string;
  browser?: string;
  deviceType?: string;
  operatingSystem?: string;
  requestId?: string;
  correlationId?: string;
  userId?: string;
  orderId?: string;
  paymentId?: string;
  walletLedgerId?: string;
  errorMessage?: string;
  sanitizedStack?: string;
  suspectedCause?: string;
  automaticResponse?: string;
  recoveryResult?: string;
  recommendedAdminAction?: string;
  deploymentVersion?: string;
  financialImpact?: boolean;
  securityImpact?: boolean;
  customerDataRisk?: boolean;
  moneyAtRisk?: boolean;
  metadata?: Record<string, unknown>;
};

export type ReliabilityIncident = {
  id: string;
  incident_key: string;
  correlation_id: string;
  title: string;
  plain_explanation: string;
  technical_explanation: string | null;
  severity: ReliabilitySeverity;
  status: ReliabilityStatus;
  feature: string;
  affected_route: string | null;
  first_detected_at: string;
  last_occurred_at: string;
  occurrence_count: number;
  affected_customer_count: number;
  affected_order_count: number;
  affected_wallet_transaction_count: number;
  automatic_response: string | null;
  recovery_result: string | null;
  recommended_admin_action: string | null;
  assigned_admin_id: string | null;
  resolution_notes: string | null;
  resolved_at: string | null;
  deployment_version: string | null;
  financial_impact: boolean;
  security_impact: boolean;
  customer_data_risk: boolean;
  money_at_risk: boolean;
};

export type HealthCheck = {
  id: string;
  label: string;
  category: string;
  state: HealthState;
  reachable: boolean | null;
  functional: boolean | null;
  latencyMs: number | null;
  thresholdMs: number;
  detail: string;
  checkedAt: string;
  safeAction?: string;
};

export type ReliabilityCenterData = {
  configured: boolean;
  overallStatus: PlatformStatus;
  incidents: ReliabilityIncident[];
  checks: HealthCheck[];
  walletMismatches: Array<{ user_id: string; actual_balance: number; expected_balance: number; is_consistent: boolean }>;
  paymentFindings: Array<Record<string, unknown>>;
  printifyFindings: Array<Record<string, unknown>>;
  jobs: Array<Record<string, unknown>>;
  backups: Array<Record<string, unknown>>;
  deployments: Array<Record<string, unknown>>;
  securityEvents: Array<Record<string, unknown>>;
  alerts: Array<Record<string, unknown>>;
  circuitStates: Array<{ provider: string; state: "closed" | "open" | "half_open"; failures: number; openedAt: number; nextProbeAt: number }>;
  maintenance: Record<string, unknown> | null;
  daily: {
    total: number;
    newIncidents: number;
    resolved: number;
    active: number;
    critical: number;
    affectedCustomers: number;
    financial: number;
    browser: number;
  };
};
