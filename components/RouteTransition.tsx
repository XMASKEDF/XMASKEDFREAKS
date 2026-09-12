"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

export default function RouteTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [visiblePath, setVisiblePath] = useState(pathname);
  useEffect(() => { setVisiblePath(pathname); }, [pathname]);
  return <div className={`route-transition ${visiblePath === pathname ? "is-current" : ""}`} key={pathname}>{children}</div>;
}
