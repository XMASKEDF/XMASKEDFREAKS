import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { activeFaqEntries, faqAnswerById, faqKnowledgeForPrompt, splitFaqAnswer } from "../lib/support/faq.ts";

const messages = JSON.parse(readFileSync(new URL("../public/locales/en.json", import.meta.url), "utf8")) as Record<string, string>;

test("FAQ registry contains ten active, ordered, unique entries", () => {
  const entries = activeFaqEntries();
  assert.equal(entries.length, 10);
  assert.equal(new Set(entries.map((entry) => entry.id)).size, 10);
  assert.deepEqual(entries.map((entry) => entry.order), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  entries.forEach((entry) => {
    assert.ok(messages[entry.questionKey]);
    assert.ok(messages[entry.answerKey]);
  });
});

test("approved FAQ policy statements are present", () => {
  assert.match(messages["faq.tips.a"], /not required to purchase a \$25 coin package/i);
  assert.match(messages["faq.live.a"], /may be prerecorded/i);
  assert.match(messages["faq.coinUsage.a"], /cannot be exchanged for cash/i);
  assert.match(messages["faq.refunds.a"], /duplicate charges, verified billing errors/i);
  assert.match(messages["faq.privacy.a"], /should not directly store full card numbers or CVV/i);
  assert.match(messages["faq.maya.a"], /should not complete a payment without your explicit approval/i);
});

test("long answers retain readable paragraph and ordered-list boundaries", () => {
  assert.ok(splitFaqAnswer(messages["faq.site.a"]).length >= 4);
  const technicalBlocks = splitFaqAnswer(messages["faq.tech.a"]);
  assert.ok(technicalBlocks.some((block) => block.includes("1. Refresh the page once.")));
  assert.ok(technicalBlocks.length >= 5);
});

test("Maya knowledge is generated from the same visible FAQ messages", () => {
  const knowledge = faqKnowledgeForPrompt(messages);
  assert.match(knowledge, /How do tips work\?/);
  assert.match(knowledge, /Who is Maya\?/);
  assert.match(knowledge, /Maya should not falsely claim that prerecorded footage is occurring live/);
  assert.equal(faqAnswerById(messages, "tips"), messages["faq.tips.a"]);
  assert.equal(faqAnswerById(messages, "coin-usage"), messages["faq.coinUsage.a"]);
});
