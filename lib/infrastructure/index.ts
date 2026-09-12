export * from "./types";
export * from "./storage";
export * from "./cache";
export * from "./shared-state";
export * from "./queue";
export * from "./events";
export * from "./rate-limit";
export * from "./security-edge";
export * from "./media";
export * from "./health";
export * from "./provider-interfaces";
export * from "./delivery";
export * from "./flags";
export * from "./observability";
export * from "./provider-runtime";
export * from "./provider-configuration";
export * from "./alerts";
export * from "./error-reporting";

export function infrastructureEnvironment() { const value = String(process.env.XMF_ENVIRONMENT || process.env.APP_ENV || "LOCAL").toUpperCase(); return ["LOCAL", "SANDBOX", "STAGING", "PRODUCTION"].includes(value) ? value : "LOCAL"; }
