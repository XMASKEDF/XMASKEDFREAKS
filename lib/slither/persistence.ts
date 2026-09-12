import { SlitherScoreEntry } from "./types";

const STORAGE_KEY = "xmf-slither-local-scores";

export function loadLocalSlitherScores(): SlitherScoreEntry[] {
  if (typeof localStorage === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") as SlitherScoreEntry[];
  } catch {
    return [];
  }
}

export function saveLocalSlitherScore(entry: SlitherScoreEntry) {
  if (typeof localStorage === "undefined") return [];
  const next = [...loadLocalSlitherScores(), entry].sort((a, b) => b.score - a.score).slice(0, 10);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}
