"use client";

import SectionError from "@/components/reliability/SectionError";

export default function LiveRouteError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <SectionError {...props} feature="Live" title="The live room is reconnecting" />;
}
