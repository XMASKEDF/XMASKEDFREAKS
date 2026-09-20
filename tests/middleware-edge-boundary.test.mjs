import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("middleware keeps upload security code outside the Edge dependency boundary", () => {
  const middleware = source("middleware.ts");
  const edgeProvider = source("lib/infrastructure/bot-protection-edge.ts");
  const securityEdge = source("lib/infrastructure/security-edge.ts");

  assert.match(middleware, /@\/lib\/infrastructure\/bot-protection-edge/);
  assert.doesNotMatch(middleware, /@\/lib\/infrastructure\/security-edge/);
  assert.doesNotMatch(edgeProvider, /Buffer|BasicUploadSecurityProvider|UPLOAD_SCANNER/);
  assert.match(securityEdge, /from "\.\/bot-protection-edge"/);
  assert.match(securityEdge, /BasicUploadSecurityProvider/);
});
