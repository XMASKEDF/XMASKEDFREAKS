"use client";

import SectionError from "@/components/reliability/SectionError";

export default function SearchRouteError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <SectionError {...props} feature="Search" />;
}
