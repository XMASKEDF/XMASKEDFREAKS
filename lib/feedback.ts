export const FEEDBACK_CATEGORIES = ["concern", "appreciation", "suggestion", "general"] as const;
export type FeedbackCategory = typeof FEEDBACK_CATEGORIES[number];

const abusivePatterns = [
  /\b(?:kill|hurt)\s+(?:you|yourself|them)\b/i,
  /\b(?:go\s+)?die\b/i,
  /\b(?:nazi|terrorist)\b/i,
  /https?:\/\//i,
  /<\s*script/i
];

export function normalizeFeedbackText(value: unknown) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, 100);
}

export function feedbackCategory(value: unknown): FeedbackCategory {
  return FEEDBACK_CATEGORIES.includes(value as FeedbackCategory) ? value as FeedbackCategory : "general";
}

export function detectFeedbackLanguage(text: string) {
  if (/[,\u0600-\u06ff]/u.test(text)) return "ar";
  if (/[\u3040-\u30ff]/u.test(text)) return "ja";
  if (/[\u4e00-\u9fff]/u.test(text)) return "zh-CN";
  if (/[\uac00-\ud7af]/u.test(text)) return "ko";
  return "en";
}

export function isClearlyAbusiveFeedback(text: string) {
  return abusivePatterns.some((pattern) => pattern.test(text));
}

export function translateFeedbackForAdmin(text: string, language: string) {
  // Never invent a translation. A configured translation worker can replace
  // the pending value while preserving the original exactly as submitted.
  return language === "en" ? { text, status: "complete" as const } : { text: null, status: "pending" as const };
}
