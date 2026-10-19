import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeListing, parsePastedListing, parsePastedQuick, TITLE_MAX } from "../src/lib/ai/parse";
import { buildSku, withItemNumber } from "../src/lib/sku";
import { cleanMeasurements, looksLikeClothing, measurementsText } from "../src/lib/measurements";
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

test("SKU follows her custom label and always ends in the item number", () => {
  const sku = buildSku({ cost: 0.62, lot_code: "GS #3-1/18/25", date_sourced: "2025-01-18", item_number: 42 }, "{cost} {lot} {listed}", "2025-11-12");
  assert.equal(sku, ".62 GS #3-1/18/25 11/2025 #42");
  assert.equal(buildSku({ cost: 1, lot_code: "GS #8-10/10/26", date_sourced: null, item_number: 11089 }, "", "2026-10-19"), "1.00 GS #8-10/10/26 10/2026 #11089");
  assert.equal(buildSku({ cost: null, lot_code: null, date_sourced: null, item_number: 7 }, "{cost}-{lot}-{n}", "2026-01-05"), "X-NA-7");
  // Two items from the same trip, same cost, same month never share a SKU
  assert.notEqual(withItemNumber("1.00 GS #8-10/10/26 10/2026", 11089), withItemNumber("1.00 GS #8-10/10/26 10/2026", 11090));
  assert.equal(withItemNumber("1.00 GS #8 #11089", 11089), "1.00 GS #8 #11089");
  assert.ok(withItemNumber("x".repeat(80), 11089).length <= 50);
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

import { bestMatch, words } from "../src/lib/similar";
test("cleanup matching finds a retitled listing", () => {
  const cands = [
    { value: "a", words: words("Express Trench Coat Small Pink Double Breasted Belted Lined") },
    { value: "b", words: words("Pottery Barn Toddler Dinosaur Costume Triceratops") },
  ];
  assert.equal(bestMatch("Express Trench Coat Womens Small Pink Double Breasted Belt Lined Long", cands)?.value, "a");
  assert.equal(bestMatch("Hello Kitty Plush Mascot", cands), null);
});

test("measurements go into the description in inches", () => {
  const list = cleanMeasurements([{ name: "Pit to pit", value: "20" }, { name: "Length", value: "27.5" }, { name: "Waist", value: "" }, { name: "Heel height", value: "3 1/2" }]);
  assert.equal(list.length, 3);
  assert.equal(measurementsText(list), "Measurements (laid flat):\nPit to pit: 20 in\nLength: 27.5 in\nHeel height: 3 1/2 in");
  assert.equal(measurementsText([]), "");
  assert.ok(looksLikeClothing("Womens Tops", null));
  assert.ok(!looksLikeClothing("Pyrex mixing bowl", "Housewares"));
});
