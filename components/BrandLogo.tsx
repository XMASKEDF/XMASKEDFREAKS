"use client";

import Image from "next/image";
import Link from "next/link";
import { CSSProperties, useState } from "react";
import { useBranding } from "@/components/BrandingProvider";

export const officialBrandLogo = {
  src: "/branding/mask-logo.png",
  originalSrc: "/branding/original/mask-logo-original.png",
  optimized: {
    small: "/branding/optimized/mask-logo-256.png",
    medium: "/branding/optimized/mask-logo-512.png",
    large: "/branding/optimized/mask-logo-1024.png"
  },
  title: "XMASKEDFREAKS"
};

type BrandLogoProps = {
  className?: string;
  href?: string;
  logoSrc?: string;
  priority?: boolean;
  showTitle?: boolean;
  style?: CSSProperties;
  title?: string;
};

export default function BrandLogo({
  className = "",
  href = "/",
  logoSrc,
  priority = false,
  showTitle = true,
  style,
  title = officialBrandLogo.title
}: BrandLogoProps) {
  const branding = useBranding();
  const resolvedLogoSrc = logoSrc || branding.logoUrl || officialBrandLogo.src;
  const [logoFailed, setLogoFailed] = useState(false);
  const isPreviewSource = resolvedLogoSrc.startsWith("blob:") || resolvedLogoSrc.startsWith("data:");

  return (
    <Link className={`brand ${className}`.trim()} href={href} style={style} aria-label={`${title} home`}>
      {!logoFailed ? (
        <span className="brand-image-wrap" aria-hidden="true">
          <Image
            className="brand-logo"
            src={resolvedLogoSrc}
            alt=""
            width={96}
            height={96}
            priority={priority}
            unoptimized={isPreviewSource}
            onError={() => setLogoFailed(true)}
          />
        </span>
      ) : null}
      {showTitle || logoFailed ? <span className={`brand-title ${logoFailed ? "brand-fallback" : ""}`.trim()}>{title}</span> : null}
    </Link>
  );
}
