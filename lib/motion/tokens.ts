export const MOTION_TOKENS = {
  duration: { instant: "100ms", fast: "160ms", normal: "220ms", slow: "360ms" },
  easing: {
    enter: "cubic-bezier(0.22, 1, 0.36, 1)",
    exit: "cubic-bezier(0.4, 0, 1, 1)",
    soft: "cubic-bezier(0.2, 0.8, 0.2, 1)",
    snap: "cubic-bezier(0.16, 1, 0.3, 1)",
    spring: "cubic-bezier(0.34, 1.56, 0.64, 1)"
  }
} as const;

