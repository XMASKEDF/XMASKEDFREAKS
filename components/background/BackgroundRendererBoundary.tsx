"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

export default class BackgroundRendererBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    if (process.env.NODE_ENV !== "production") console.error("[Background isolation] Renderer disabled", error, info.componentStack);
    if (location.pathname.startsWith("/games")) void fetch("/api/games/errors", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ timestamp: new Date().toISOString(), route: location.pathname, gameSelected: location.pathname.split("/")[2] || null, errorMessage: error.message, errorType: "background", componentStack: info.componentStack || "", retryCount: 0, componentName: "BackgroundRenderer", backgroundState: "disabled-after-error", matrixState: { present: false }, recoveryAction: "background-isolated" }), keepalive: true }).catch(() => undefined);
  }
  render() { return this.state.failed ? <div className="background-engine background-engine-failed" aria-hidden="true" /> : this.props.children; }
}
