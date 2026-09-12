"use client";

import { useEffect } from "react";
import { reportClientReliability } from "@/components/reliability/ReliabilityClientReporter";

function supportReference(feature: string, error: Error & { digest?: string }) {
  if (error.digest) return `XMF-${error.digest.slice(0, 12).toUpperCase()}`;
  let value = 2166136261;
  for (const character of `${feature}:${error.name}:${error.message}`) {
    value ^= character.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  return `XMF-${(value >>> 0).toString(36).toUpperCase()}`;
}

export default function SectionError({
  error,
  reset,
  feature = "Frontend",
  title = "This section needs a moment"
}: {
  error: Error & { digest?: string };
  reset: () => void;
  feature?: string;
  title?: string;
}) {
  const reference = supportReference(feature, error);

  useEffect(() => {
    reportClientReliability({
      title: `${feature} route error boundary activated`,
      message: error.message,
      stack: error.stack,
      feature,
      eventType: "route_error_boundary",
      severity: 3,
      automaticResponse: "The failure was isolated to one section and the rest of the website remained available."
    });
  }, [error, feature]);

  return (
    <main className="section-error-shell">
      <section>
        <p className="kicker">{feature} recovery</p>
        <h1>{title}</h1>
        <p>The rest of the website is still available. Try this section again, or return home while the issue is reviewed.</p>
        <small>Support reference: <strong>{reference}</strong></small>
        <div>
          <button className="primary" type="button" onClick={reset}>Try again</button>
          <button className="secondary" type="button" onClick={() => window.location.assign("/")}>Return home</button>
          <button className="secondary" type="button" onClick={() => window.location.assign("/#faq")}>Get support</button>
        </div>
      </section>
    </main>
  );
}
