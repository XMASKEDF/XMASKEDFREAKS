"use client";

import SectionError from "@/components/reliability/SectionError";

export default function ApplicationRouteError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <SectionError {...props} />;
}
