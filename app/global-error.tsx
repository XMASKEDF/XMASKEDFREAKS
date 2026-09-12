"use client";

import { useEffect, useState } from "react";
import { getGlobalErrorCopy } from "@/lib/global-error-copy";
import { reportClientReliability } from "@/components/reliability/ReliabilityClientReporter";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [copy, setCopy] = useState(() => getGlobalErrorCopy("en"));
  const [reference] = useState(() => `XMF-${Date.now().toString(36).toUpperCase()}`);

  useEffect(() => {
    setCopy(getGlobalErrorCopy(document.documentElement.lang || navigator.language));
    reportClientReliability({ title: "Application error boundary activated", message: error.message, stack: error.stack, feature: "Frontend", eventType: "global_error_boundary", severity: 4, automaticResponse: "The visitor received a controlled recovery page." });
  }, [error]);

  async function clearLocalCache() {
    if ("caches" in window) {
      const keys = await window.caches.keys();
      await Promise.all(keys.map((key) => window.caches.delete(key)));
    }
    window.sessionStorage.clear();
    window.location.reload();
  }

  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", padding: "24px", color: "#fff", background: "#000", fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Arial, sans-serif" }}>
        <main style={{ width: "min(100%, 560px)", border: "1px solid rgba(125,255,155,.35)", borderRadius: "8px", padding: "clamp(20px, 5vw, 40px)", background: "rgba(8,12,9,.96)", boxShadow: "0 24px 80px rgba(0,0,0,.65)" }}>
          <p style={{ margin: "0 0 8px", color: "#7dff9b", fontSize: "12px", fontWeight: 800, textTransform: "uppercase" }}>{copy.brand}</p>
          <h1 style={{ margin: "0 0 12px", fontSize: "clamp(24px, 6vw, 40px)", lineHeight: 1.05 }}>{copy.title}</h1>
          <p style={{ margin: "0 0 24px", color: "#b7c0b9", lineHeight: 1.6 }}>{copy.description}</p>
          <p style={{ margin: "0 0 18px", color: "#9ba59e", fontSize: "13px" }}>Support reference: <strong style={{ color: "#fff" }}>{reference}</strong></p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
            <button type="button" onClick={reset} style={{ minHeight: "44px", border: 0, borderRadius: "6px", padding: "0 18px", color: "#031007", background: "#7dff9b", font: "inherit", fontWeight: 800, cursor: "pointer" }}>{copy.reload}</button>
            <button type="button" onClick={() => window.location.assign("/")} style={{ minHeight: "44px", border: "1px solid rgba(255,255,255,.24)", borderRadius: "6px", padding: "0 18px", color: "#fff", background: "rgba(255,255,255,.06)", font: "inherit", fontWeight: 800, cursor: "pointer" }}>{copy.home}</button>
            <button type="button" onClick={clearLocalCache} style={{ minHeight: "44px", border: "1px solid rgba(255,255,255,.24)", borderRadius: "6px", padding: "0 18px", color: "#fff", background: "rgba(255,255,255,.06)", font: "inherit", fontWeight: 800, cursor: "pointer" }}>{copy.clearCache}</button>
          </div>
        </main>
      </body>
    </html>
  );
}
