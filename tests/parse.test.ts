import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeListing, parsePastedListing, parsePastedQuick, TITLE_MAX } from "../src/lib/ai/parse";
import { buildSku } from "../src/lib/sku";
import { applyTemplate } from "../src/lib/listing-text";
import { ebaySoldSearchUrl } from "../src/lib/ai/prompts";

test("reads the JSON block from a chat app answer", () => {
  const text = `Here's my take!\n\n**TITLE:** Something\n\n\`\`\`json\n{"title":"Vera Bradley Backpack Floral","category":"Backpacks","item_specifics":[{"name":"Brand","value":"Vera Bradley"},{"name":"Color","value":"unknown"}],"description":"Nice","condition_text":"Good","price":"$24.99","price_low":30,"price_high":20,"confidence":"medium","price_basis":"estimate, not verified against sold comps","decision":"KEEP","rule":"Slow Dime","resale_note":"Sells for ~$25"}\n\`\`\``;
  const s = parsePastedListing(text);
  assert.equal(s.title, "Vera Bradley Backpack Floral");
  assert.equal(s.price, 24.99);
  assert.equal(s.price_low, 20); // swapped into order
  assert.equal(s.price_high, 30);
  assert.ok(s.flags.some((f) => f.includes("Color")));
  assert.ok(s.flags.some((f) => /estimate/i.test(f)));
});

test("falls back to labeled lines when there is no JSON", () => {
  const s = parsePastedListing(
    "1. TITLE: Pyrex Butterprint Bowl 403 Turquoise\n2. CATEGORY: Mixing Bowls\n3. ITEM SPECIFICS:\n- Brand: Pyrex\n- Pattern: Butterprint\n4. PRICE: $34.99 ($28 - $40)\n5. CONFIDENCE: medium\n6. DECISION: KEEP - Fast Nickel. Sells around $30."
  );
  assert.equal(s.title, "Pyrex Butterprint Bowl 403 Turquoise");
  assert.equal(s.price, 34.99);
  assert.equal(s.price_low, 28);
  assert.equal(s.decision, "KEEP");
  assert.equal(s.rule, "Fast Nickel");
  assert.deepEqual(s.item_specifics.map((x) => x.name), ["Brand", "Pattern"]);
});

test("trims titles to 80 characters on a word boundary and flags it", () => {
  const long = "Word ".repeat(30).trim();
  const s = normalizeListing({ title: long, price_basis: "based on sold comps" });
  assert.ok(s.title.length <= TITLE_MAX);
  assert.ok(!s.title.endsWith(" "));
  assert.ok(s.flags.some((f) => f.includes("trimmed")));
});

test("quick check answer", () => {
  const q = parsePastedQuick('DONATE. This sells for about $8.\n{"decision":"DONATE","rule":"Dead Weight","resale_note":"About $8","price_estimate":8}');
  assert.equal(q.decision, "DONATE");
  assert.equal(q.price_estimate, 8);
});

test("SKU encodes cost, lot, month listed and stays eBay-safe", () => {
  const sku = buildSku({ cost: 2.5, lot_code: "GS #4-10/3/26", date_sourced: "2026-10-03", item_number: 42 }, "{cost}-{lot}-{listed}-{n}", "2026-10-12");
  assert.equal(sku, "2p5-GS410326-1026-42");
  assert.match(sku, /^[A-Za-z0-9\-_.]{1,50}$/);
  assert.equal(buildSku({ cost: null, lot_code: null, date_sourced: null, item_number: 7 }, "", "2026-01-05"), "X-NA-0126-7");
});

test("description template", () => {
  assert.equal(applyTemplate("{title}\n{description}\nCondition: {condition}", { title: "T", description: "D", condition: "C" }), "T\nD\nCondition: C");
  assert.equal(applyTemplate("", { title: "T", description: "D", condition: "" }), "D");
});

test("sold search link drops FLAW and keeps 8 words", () => {
  const url = ebaySoldSearchUrl("Ash Ketchum Pokemon Figure Tomy 1998 PVC 4.75\" Vintage *FLAWS");
  assert.ok(url.includes("LH_Sold=1"));
  assert.ok(!decodeURIComponent(url).includes("FLAW"));
});
