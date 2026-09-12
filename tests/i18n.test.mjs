import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const readJson = async (file) => JSON.parse(await readFile(new URL(file, root), "utf8"));
const locales = ["en", "es", "fr", "de", "pt", "ja", "ko", "zh-CN", "ar", "ru"];

test("registry exposes the ten supported locales and Arabic RTL", async () => {
  const registry = await readJson("public/locales/manifest.json");
  assert.deepEqual(registry.map((item) => item.code), locales);
  assert.equal(registry.find((item) => item.code === "ar").direction, "rtl");
});

test("every stable tip id has a translated phrase while prices remain language-neutral", async () => {
  const tips = await readFile(new URL("lib/tips.ts", root), "utf8");
  const ids = [...tips.matchAll(/\{ id: "([a-z-]+)", emoji:/g)].map((match) => match[1]);
  assert.deepEqual(ids, ["great-show", "need-more", "im-watching", "that-was-hot", "keep-going", "dont-stop", "okayyy-i-see-yall", "show-some-love", "turn-it-up", "keep-the-show-going", "vip-energy", "yall-wild", "favorite-creators", "cant-stop-watching", "worth-every-minute", "doing-amazing", "appreciate-content", "yall-nasty", "big-tipper"]);
  for (const locale of locales) {
    const messages = await readJson(`public/locales/core/${locale}.json`);
    for (const id of ids) assert.equal(typeof messages[`tipMenu.option.${id}`], "string", `${locale}:${id}`);
  }
  assert.match(tips, /tokenCost: 8/);
  assert.match(tips, /tokenCost: 400/);
});

test("required interpolation variables are preserved", async () => {
  for (const locale of locales) {
    const messages = await readJson(`public/locales/core/${locale}.json`);
    assert.match(messages["tipMenu.optionLabel"], /\{\{phrase\}\}/);
    assert.match(messages["tipMenu.optionLabel"], /\{\{tokens\}\}/);
    assert.match(messages["tipMenu.customRange"], /\{\{minimum\}\}/);
    assert.match(messages["tipMenu.customRange"], /\{\{maximum\}\}/);
  }
});

test("wallet and Live access controls are translated in every locale", async () => {
  const required = ["wallet.addCoins", "wallet.confirmPackage", "wallet.payReceive", "wallet.refillResume", "wallet.refillTokens", "wallet.access.unlock", "wallet.access.leave"];
  for (const locale of locales) {
    const messages = await readJson(`public/locales/wallet/${locale}.json`);
    for (const key of required) assert.equal(typeof messages[key], "string", `${locale}:${key}`);
    assert.match(messages["wallet.payReceive"], /\{\{amount\}\}/);
    assert.match(messages["wallet.payReceive"], /\{\{coins\}\}/);
  }
});

test("game catalog, controls, HUD, pause, and game-over labels are translated", async () => {
  const required = ["gamesRoute.title", "gamesRoute.offlineTitle", "gameUi.activate", "gameUi.pacInstructions", "gameUi.spaceInstructions", "gameUi.enterArena", "gameUi.pausedCopy", "gameUi.finalScore"];
  for (const locale of locales) {
    const messages = await readJson(`public/locales/games/${locale}.json`);
    for (const key of required) assert.equal(typeof messages[key], "string", `${locale}:${key}`);
    assert.match(messages["gameUi.finalScore"], /\{\{score\}\}/);
  }
});

test("gate keeps only the three required confirmations", async () => {
  const source = await readFile(new URL("components/LiveRoom.tsx", root), "utf8");
  assert.match(source, /requiredGateCheckKeys = \["age\.check1", "age\.check2", "age\.check3"\]/);
  assert.doesNotMatch(source, /requiredGateCheckKeys = \[[^\]]*age\.check4/);
});
