"use client";

import { useEffect, useState } from "react";

export function useGameVisibility() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    function updateVisibility() {
      setVisible(document.visibilityState === "visible");
    }
    updateVisibility();
    document.addEventListener("visibilitychange", updateVisibility);
    return () => document.removeEventListener("visibilitychange", updateVisibility);
  }, []);

  return visible;
}
