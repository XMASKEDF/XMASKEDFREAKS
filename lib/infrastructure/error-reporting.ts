import { structuredLog } from "./observability";

export type OperationalError = {
  code: string;
  message: string;
  service: string;
  route?: string;
  provider?: string;
  durationMs?: number;
  release?: string;
};

export interface ErrorReportingProvider {
  readonly kind: "LOCAL" | "CUSTOM";
  report(error: OperationalError): Promise<{ accepted: boolean; reference: string; detail: string }>;
}

export class LocalErrorReportingProvider implements ErrorReportingProvider {
  readonly kind = "LOCAL" as const;
  async report(error: OperationalError) {
    const entry = structuredLog("ERROR", error.service, "operational_error", {
      errorCode: error.code,
      message: error.message,
      route: error.route,
      provider: error.provider,
      durationMs: error.durationMs,
      release: error.release
    });
    return { accepted: true, reference: `local-error:${entry.requestId}`, detail: "Error retained by the local structured-log adapter." };
  }
}

export function getErrorReportingProvider(): ErrorReportingProvider | null {
  return String(process.env.ERROR_REPORTING_PROVIDER || "NONE").toUpperCase() === "LOCAL" ? new LocalErrorReportingProvider() : null;
}

export async function reportOperationalError(error: OperationalError) {
  const provider = getErrorReportingProvider();
  if (!provider) return { accepted: false, status: "NOT CONFIGURED" as const, detail: "No approved error-reporting provider is configured." };
  const result = await provider.report({ ...error, message: error.message.slice(0, 500), code: error.code.slice(0, 100) });
  return { ...result, status: result.accepted ? "SENT" as const : "NOT CONFIGURED" as const };
}
