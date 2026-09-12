"use client";

import { useEffect } from "react";

function normalizeColor(value: string) {
  return value.replace(/\s+/g, "").toLowerCase();
}

export default function StyleHealthCheck() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;

    const reportStylesheetFailure = (event: Event) => {
      const target = event.target;
      if (target instanceof HTMLLinkElement && target.rel === "stylesheet") {
        console.error(`[Style health] Stylesheet failed to load: ${target.href}`);
      }
    };

    window.addEventListener("error", reportStylesheetFailure, true);

    const frame = window.requestAnimationFrame(() => {
      const rootStyles = window.getComputedStyle(document.documentElement);
      const bodyStyles = window.getComputedStyle(document.body);
      const shell = document.querySelector<HTMLElement>("[data-xmf-app-shell='styled']");
      const cssLinks = Array.from(document.querySelectorAll<HTMLLinkElement>("link[rel='stylesheet'][href*='/_next/static/css/']"));
      const loadedCss = new Set(Array.from(document.styleSheets).map((sheet) => sheet.href).filter(Boolean));
      const missingChunks = cssLinks.filter((link) => !loadedCss.has(link.href)).map((link) => link.href);
      const green = rootStyles.getPropertyValue("--green").trim();
      const background = normalizeColor(bodyStyles.backgroundColor);
      const shellDisplay = shell ? window.getComputedStyle(shell).display : "missing";
      const healthy = green.length > 0
        && !["rgba(0,0,0,0)", "transparent", "rgb(255,255,255)"].includes(background)
        && shellDisplay !== "missing"
        && missingChunks.length === 0;

      if (!healthy) {
        console.error("[Style health] Global presentation layer is unhealthy.", {
          globalVariableLoaded: Boolean(green),
          bodyBackground: bodyStyles.backgroundColor,
          appShellDisplay: shellDisplay,
          missingCssChunks: missingChunks
        });
      }
    });

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("error", reportStylesheetFailure, true);
    };
  }, []);

  return null;
}
