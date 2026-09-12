"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BackgroundProvider } from "@/components/background/BackgroundProvider";
import BackgroundRendererBoundary from "@/components/background/BackgroundRendererBoundary";
import type { SiteBackgroundSettings } from "@/lib/media/backgrounds";

function appliesToRoute(scope: SiteBackgroundSettings["scope"], pathname: string) {
  if (scope === "live") return pathname === "/" || pathname === "/sandbox";
  if (scope === "games") return pathname.startsWith("/games");
  if (scope === "admin") return pathname.startsWith("/admin");
  if (scope === "landing") return pathname === "/";
  return true;
}

function RouteAwareBackground({ settings }: { settings: SiteBackgroundSettings }) {
  const pathname = usePathname();
  const [matrixDisabled, setMatrixDisabled] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return undefined;
    const readOverride = () => setMatrixDisabled(new URLSearchParams(window.location.search).get("xmfMatrix") === "off");
    readOverride();
    window.addEventListener("popstate", readOverride);
    return () => window.removeEventListener("popstate", readOverride);
  }, []);

  const effectiveSettings = matrixDisabled
    ? { ...settings, matrixSlim: { ...settings.matrixSlim, enabled: false } }
    : settings;
  const active = effectiveSettings.enabled && appliesToRoute(effectiveSettings.scope, pathname || "/");

  return <BackgroundProvider settings={effectiveSettings} active={active} />;
}

export default function GlobalBackgroundClient({ settings }: { settings: SiteBackgroundSettings }) {
  return <BackgroundRendererBoundary>
    <RouteAwareBackground settings={settings} />
  </BackgroundRendererBoundary>;
}
