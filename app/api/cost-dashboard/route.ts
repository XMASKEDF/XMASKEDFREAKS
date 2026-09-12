import { NextResponse } from "next/server";
import { appConfig, defaultCostProviders } from "@/lib/config";

export async function GET() {
  const monthlyTotal = defaultCostProviders.reduce((sum, item) => sum + item.fixedMonthly + item.usageMonthly, 0);
  const projectedMonthEnd = monthlyTotal + monthlyTotal * 0.08;

  return NextResponse.json({
    ok: true,
    budget: appConfig.costMonthlyBudget,
    warningThreshold: appConfig.costWarningThreshold,
    dailyEstimate: monthlyTotal / 30,
    weeklyEstimate: (monthlyTotal / 30) * 7,
    monthlyEstimate: monthlyTotal,
    projectedMonthEnd,
    providers: defaultCostProviders,
    alerts: defaultCostProviders
      .filter((item) => item.usagePercent >= appConfig.costWarningThreshold)
      .map((item) => `${item.provider} is at ${item.usagePercent}% of its allowance.`),
    security: {
      apiKeysExposed: false,
      bankingDetailsExposed: false,
      fullPaymentCredentialsExposed: false,
      note: "Connect server-side billing APIs with encrypted secrets and finance-only RBAC."
    }
  });
}
