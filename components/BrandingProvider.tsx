"use client";

import { createContext, type ReactNode, useContext } from "react";
import type { SiteBrandingSettings } from "@/lib/media/branding";

const BrandingContext = createContext<SiteBrandingSettings>({ logoMediaId: null, logoUrl: "/branding/mask-logo.png" });
export function BrandingProvider({ settings, children }: { settings: SiteBrandingSettings; children: ReactNode }) { return <BrandingContext.Provider value={settings}>{children}</BrandingContext.Provider>; }
export function useBranding() { return useContext(BrandingContext); }
