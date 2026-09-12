"use client";

import SectionError from "@/components/reliability/SectionError";

export default function AccountRouteError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <SectionError {...props} feature="Account" />;
}
