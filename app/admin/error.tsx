"use client";

import SectionError from "@/components/reliability/SectionError";

export default function AdminRouteError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <SectionError {...props} feature="Admin" title="This ADMIN panel is temporarily isolated" />;
}
