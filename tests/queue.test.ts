import { test } from "node:test";
import assert from "node:assert/strict";
import { chunk, everyN, groupsFromStarts, laneFor, mergeUp, splitAt } from "../src/lib/queue";
import { legacyReviseXml } from "../src/lib/ebay/revise";

test("AI item starts become group sizes, ignoring junk and duplicates", () => {
  assert.deepEqual(groupsFromStarts(10, [0, 4, 7]), [4, 3, 3]);
  assert.deepEqual(groupsFromStarts(10, [7, 4, 4, -1, 99, 2.5]), [4, 3, 3]);
  assert.deepEqual(groupsFromStarts(3, []), [3]);
  assert.deepEqual(groupsFromStarts(0, [0]), []);
});

test("every N photos, with a short last item", () => {
  assert.deepEqual(everyN(10, 4), [4, 4, 2]);
  assert.deepEqual(everyN(3, 0), [1, 1, 1]);
});

test("tap a photo to split, Join above to merge", () => {
  assert.deepEqual(splitAt([4, 4], 2), [2, 2, 4]);
  assert.deepEqual(splitAt([4, 4], 4), [4, 4], "first photo of an item: nothing to split");
  assert.deepEqual(mergeUp([2, 2, 4], 1), [4, 4]);
  assert.deepEqual(mergeUp([4, 4], 0), [4, 4]);
  assert.deepEqual(chunk(["a", "b", "c", "d", "e"], [2, 3]), [["a", "b"], ["c", "d", "e"]]);
});

test("cheap clean items go to quick send, the rest to review", () => {
  const base = { price: 12, decision: "KEEP", flags: [] as string[] };
  assert.equal(laneFor(base, 20), "quick");
  assert.equal(laneFor({ ...base, price: 45 }, 20), "review");
  assert.equal(laneFor({ ...base, price: null }, 20), "review");
  assert.equal(laneFor({ ...base, decision: "DONATE" }, 20), "review");
  assert.equal(laneFor({ ...base, flags: ["eBay requires these specifics: Size."] }, 20), "review");
  assert.equal(laneFor({ ...base, flags: ["Title trimmed to 80 characters."] }, 20), "quick");
});

test("relist sends only the item number plus any new price and package", () => {
  const { item } = legacyReviseXml("123456789012", { price: 169.99 });
  assert.equal(item, "<Item><ItemID>123456789012</ItemID><StartPrice>169.99</StartPrice></Item>");
});
