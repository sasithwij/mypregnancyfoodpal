import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildIndex, normalize, search } from "../public/search.js";
import { buildSystemPrompt, cleanResult, compactRules, OUTPUT_SCHEMA } from "../lib/prompt.js";
import handler, { buildUserContent, MODELS, pickModel, requestParams } from "../api/check.js";

const rulesFile = JSON.parse(readFileSync(new URL("../data/pregnancy_food_rules.json", import.meta.url), "utf8"));
const index = buildIndex(rulesFile.rules);
const ids = (query) => search(index, query).map((r) => r.id);

test("normalize handles case, accents, plurals and punctuation", () => {
  assert.equal(normalize("  Pâté, Eggs! "), "pate egg");
  assert.equal(normalize("Medium-Rare"), "medium rare");
});

test("search finds the expected rules", () => {
  assert.equal(ids("brie")[0], "cheese-soft-uncooked");
  assert.ok(ids("camem").includes("cheese-soft-uncooked"), "partial typing works");
  assert.ok(ids("pâté").includes("pate-refrigerated"));
  assert.ok(ids("mayonnaise").includes("raw-egg-foods"));
  assert.deepEqual(ids("rockmelon"), ["rockmelon"]);
  assert.deepEqual(ids("zzzz"), []);
});

test("specific matches hide the general one", () => {
  const hits = ids("smoked salmon");
  assert.equal(hits[0], "seafood-smoked-chilled");
  assert.ok(!hits.includes("fish-cooked"), "plain cooked fish should not show for smoked salmon");
});

test("warning rules are amber with a 'Not OK unless' caveat", () => {
  const warned = rulesFile.rules.filter((r) => r.warning);
  assert.ok(warned.length >= 2);
  for (const rule of warned) {
    assert.equal(rule.rating, "amber", rule.id);
    assert.match(rule.caveat, /^Not OK unless/, rule.id);
  }
});

test("system prompt includes every rule id and stays compact", () => {
  const prompt = buildSystemPrompt(rulesFile);
  for (const rule of rulesFile.rules) assert.ok(prompt.includes(`"id":"${rule.id}"`), rule.id);
  assert.ok(prompt.length < 40_000, `prompt is ${prompt.length} chars`);
  assert.ok(!JSON.stringify(compactRules(rulesFile.rules)).includes("match_terms"));
});

test("output schema is strict at every level", () => {
  assert.equal(OUTPUT_SCHEMA.additionalProperties, false);
  assert.equal(OUTPUT_SCHEMA.properties.items.items.additionalProperties, false);
  const item = OUTPUT_SCHEMA.properties.items.items;
  assert.deepEqual([...item.required].sort(), Object.keys(item.properties).sort());
});

test("cleanResult drops made-up rule ids", () => {
  const out = cleanResult(
    { kind: "dish", summary: "s", items: [{ name: "x", rating: "red", rule_ids: ["raw-egg-foods", "made-up"], explanation: "e", ask_kitchen: null, confidence: "high" }] },
    rulesFile,
  );
  assert.deepEqual(out.items[0].rule_ids, ["raw-egg-foods"]);
});

test("buildUserContent validates input", () => {
  assert.ok(buildUserContent({}).error);
  assert.ok(buildUserContent({ text: "x".repeat(501) }).error);
  assert.ok(buildUserContent({ image: { data: "abc", media_type: "image/heic" } }).error);
  const ok = buildUserContent({ mode: "menu", image: { data: "aGVsbG8=", media_type: "image/jpeg" } });
  assert.equal(ok.content[0].type, "image");
  assert.match(ok.content[1].text, /menu/);
  assert.equal(buildUserContent({ text: "brie" }).content[0].type, "text");
});

function fakeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(k, v) { this.headers[k] = v; },
    end(b) { this.body = JSON.parse(b); },
  };
}

test("handler rejects wrong passcode and missing key without calling the AI", async () => {
  const saved = { ...process.env };
  try {
    process.env.APP_PASSCODE = "secret";
    let res = fakeRes();
    await handler({ method: "POST", headers: {}, body: { text: "brie" } }, res);
    assert.equal(res.statusCode, 401);

    delete process.env.ANTHROPIC_API_KEY;
    res = fakeRes();
    await handler({ method: "POST", headers: { "x-app-passcode": "secret" }, body: { text: "brie" } }, res);
    assert.equal(res.statusCode, 500);
    assert.match(res.body.error, /ANTHROPIC_API_KEY/);

    res = fakeRes();
    await handler({ method: "GET", headers: {} }, res);
    assert.equal(res.statusCode, 405);
  } finally {
    process.env = saved;
  }
});

test("dev server mock only uses real rule ids", () => {
  const src = readFileSync(new URL("../scripts/dev.mjs", import.meta.url), "utf8");
  const known = new Set(rulesFile.rules.map((r) => r.id));
  for (const [, list] of src.matchAll(/rule_ids: \[([^\]]*)\]/g)) {
    for (const id of list.match(/"[^"]+"/g) ?? []) assert.ok(known.has(id.slice(1, -1)), id);
  }
});

test("model can be picked by short name or id, defaulting to Sonnet", () => {
  assert.equal(pickModel(undefined), MODELS.sonnet);
  assert.equal(pickModel(" Haiku "), MODELS.haiku);
  assert.equal(pickModel("claude-opus-5-5"), MODELS.opus);
  assert.equal(pickModel("gpt"), MODELS.sonnet);
});

test("refusal fallback is only sent for models that support it", () => {
  for (const model of [MODELS.opus, MODELS.sonnet]) {
    const p = requestParams(model, "sys", []);
    assert.equal(p.fallbacks, "default");
    assert.deepEqual(p.betas, ["server-side-fallback-2026-07-01"]);
  }
  const haiku = requestParams(MODELS.haiku, "sys", []);
  assert.equal(haiku.fallbacks, undefined);
  assert.equal(haiku.betas, undefined);
  assert.equal(haiku.output_config.format.type, "json_schema");
});
