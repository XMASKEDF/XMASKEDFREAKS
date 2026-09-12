"use client";

import SectionError from "@/components/reliability/SectionError";

export default function PaintingsRouteError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <SectionError {...props} feature="Paintings" />;
}
