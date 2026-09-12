import test from "node:test";
import assert from "node:assert/strict";
import { detectFeedbackLanguage, feedbackCategory, isClearlyAbusiveFeedback, normalizeFeedbackText, translateFeedbackForAdmin } from "../lib/feedback.ts";

test("feedback is normalized to the public 100 character limit", () => {
  assert.equal(normalizeFeedbackText("  A   useful   note  "), "A useful note");
  assert.equal(normalizeFeedbackText("x".repeat(140)).length, 100);
});

test("feedback categories and moderation preserve ordinary criticism", () => {
  assert.equal(feedbackCategory("concern"), "concern");
  assert.equal(feedbackCategory("unknown"), "general");
  assert.equal(isClearlyAbusiveFeedback("The checkout was confusing and too slow."), false);
  assert.equal(isClearlyAbusiveFeedback("Please go die"), true);
});

test("feedback language detection never fabricates non-English translations", () => {
  assert.equal(detectFeedbackLanguage("This is helpful"), "en");
  assert.equal(detectFeedbackLanguage("これは便利です"), "ja");
  assert.deepEqual(translateFeedbackForAdmin("This is helpful", "en"), { text: "This is helpful", status: "complete" });
  assert.deepEqual(translateFeedbackForAdmin("これは便利です", "ja"), { text: null, status: "pending" });
});
