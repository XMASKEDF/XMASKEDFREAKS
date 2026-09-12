export const PUBLIC_NAVIGATION = [
  { id: "live", href: "/live", translationKey: "nav.live" },
  { id: "fansly", href: "/fansly", translationKey: "nav.fansly" },
  { id: "upcoming", href: "/upcoming", translationKey: "nav.upcoming" },
  { id: "merch", href: "/merch", translationKey: "nav.merch" },
  { id: "audio", href: "/audio-clips", translationKey: "nav.audioClips" },
  { id: "games", href: "/games", translationKey: "nav.games" },
  { id: "feet", href: "/feet", translationKey: "nav.feet" },
  { id: "paintings", href: "/paintings", translationKey: "nav.paintings" },
  { id: "feedback", href: "/feedback", translationKey: "nav.feedback" }
] as const;

export type PublicNavigationId = typeof PUBLIC_NAVIGATION[number]["id"];
