import type { Messages } from "@/lib/i18n";

export type FaqCategory = "Platform" | "Wallet" | "Tipping" | "Streaming" | "Account" | "Privacy" | "Support";

export type FaqEntry = {
  id: string;
  questionKey: string;
  answerKey: string;
  category: FaqCategory;
  order: number;
  isActive: boolean;
};

export const faqEntries: FaqEntry[] = [
  { id: "site-workflow", questionKey: "faq.site.q", answerKey: "faq.site.a", category: "Platform", order: 1, isActive: true },
  { id: "wallet-deposits", questionKey: "faq.wallet.q", answerKey: "faq.wallet.a", category: "Wallet", order: 2, isActive: true },
  { id: "tips", questionKey: "faq.tips.q", answerKey: "faq.tips.a", category: "Tipping", order: 3, isActive: true },
  { id: "coin-usage", questionKey: "faq.coinUsage.q", answerKey: "faq.coinUsage.a", category: "Wallet", order: 4, isActive: true },
  { id: "tip-refunds", questionKey: "faq.refunds.q", answerKey: "faq.refunds.a", category: "Tipping", order: 5, isActive: true },
  { id: "stream-format", questionKey: "faq.live.q", answerKey: "faq.live.a", category: "Streaming", order: 6, isActive: true },
  { id: "account-purpose", questionKey: "faq.account.q", answerKey: "faq.account.a", category: "Account", order: 7, isActive: true },
  { id: "video-lag", questionKey: "faq.tech.q", answerKey: "faq.tech.a", category: "Support", order: 8, isActive: true },
  { id: "privacy", questionKey: "faq.privacy.q", answerKey: "faq.privacy.a", category: "Privacy", order: 9, isActive: true },
  { id: "maya", questionKey: "faq.maya.q", answerKey: "faq.maya.a", category: "Support", order: 10, isActive: true }
];

export function activeFaqEntries(hiddenIds: string[] = []) {
  const hidden = new Set(hiddenIds);
  return faqEntries.filter((entry) => entry.isActive && !hidden.has(entry.id)).sort((a, b) => a.order - b.order);
}

export function faqKnowledgeForPrompt(messages: Messages) {
  return activeFaqEntries().map((entry) => {
    const question = messages[entry.questionKey];
    const answer = messages[entry.answerKey];
    return question && answer ? `${question}\n${answer}` : "";
  }).filter(Boolean).join("\n\n");
}

export function faqAnswerById(messages: Messages, id: string) {
  const entry = faqEntries.find((item) => item.id === id && item.isActive);
  return entry ? messages[entry.answerKey] || "" : "";
}

export function splitFaqAnswer(answer: string) {
  return answer.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
}
