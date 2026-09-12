"use client";

import { useEffect } from "react";

type ClientReport = {
  title: string;
  message: string;
  stack?: string;
  feature: string;
  eventType: string;
  severity?: number;
  automaticResponse?: string;
};

const reported = new Map<string, number>();

function environment() {
  const ua = navigator.userAgent;
  return {
    browser: /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Other",
    deviceType: /Mobile|Android|iPhone|iPad/i.test(ua) ? "mobile_or_tablet" : "desktop",
    operatingSystem: /Windows/i.test(ua) ? "Windows" : /Mac OS|Macintosh/i.test(ua) ? "macOS" : /Android/i.test(ua) ? "Android" : /iPhone|iPad/i.test(ua) ? "iOS" : /Linux/i.test(ua) ? "Linux" : "Other"
  };
}

export function reportClientReliability(input: ClientReport) {
  const key = `${input.feature}|${input.eventType}|${input.message}|${location.pathname}`.slice(0, 1000);
  const last = reported.get(key) || 0;
  if (Date.now() - last < 60_000) return;
  reported.set(key, Date.now());
  const env = environment();
  void fetch("/api/reliability/client", {
    method: "POST",
    keepalive: true,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...input,
      ...env,
      route: location.pathname,
      online: navigator.onLine,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      language: document.documentElement.lang || navigator.language,
      deploymentVersion: document.documentElement.dataset.deploymentVersion || "local"
    })
  }).catch(() => undefined);
}

export default function ReliabilityClientReporter() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => reportClientReliability({
      title: "Unhandled browser exception",
      message: event.message || "Unknown browser exception",
      stack: event.error instanceof Error ? event.error.stack : "",
      feature: "Browser",
      eventType: "javascript_exception",
      severity: 3,
      automaticResponse: "Global error capture grouped the occurrence."
    });
    const onRejection = (event: PromiseRejectionEvent) => {
      const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason || "Unhandled promise rejection"));
      reportClientReliability({ title: "Unhandled browser promise rejection", message: error.message, stack: error.stack, feature: "Browser", eventType: "unhandled_rejection", severity: 3 });
    };
    const onResourceError = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLImageElement || target instanceof HTMLScriptElement || target instanceof HTMLLinkElement || target instanceof HTMLMediaElement)) return;
      const source = target instanceof HTMLLinkElement ? target.href : target instanceof HTMLMediaElement ? target.currentSrc : target.src;
      reportClientReliability({ title: "Page asset failed to load", message: source ? new URL(source, location.href).pathname : "Unknown asset", feature: target instanceof HTMLMediaElement ? "Media" : "Frontend", eventType: "asset_failure", severity: 2, automaticResponse: "The failed asset remained isolated from the application shell." });
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onResourceError, true);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onResourceError, true);
    };
  }, []);
  return null;
}
