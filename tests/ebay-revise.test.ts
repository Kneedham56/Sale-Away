import { test } from "node:test";
import assert from "node:assert/strict";
import { describeChanges, diffForEbay, hasChanges, legacyReviseXml, mergeLegacyPictures } from "../src/lib/ebay/revise";
import { conditionFor, conditionIdFor } from "../src/lib/ebay/publish";

const before = {
  list_price: "189.99",
  title: "Baffin boots",
  condition: "pre_owned",
  condition_grade: "good",
  condition_notes: null,
  weight_oz: "144.00",
  length_in: "21.00",
  width_in: "15.00",
  height_in: "10.00",
};

test("an edit sends eBay only what changed: condition and box size, not the unchanged price", () => {
  const after = { ...before, list_price: 189.99, condition: "new", condition_grade: null, weight_oz: 160, length_in: 21, width_in: 18, height_in: 7 };
  const c = diffForEbay(before, after);
  assert.equal(c.price, undefined);
  assert.equal(c.title, undefined);
  assert.deepEqual(c.condition, { condition: "new", condition_grade: null, condition_notes: null });
  assert.deepEqual(c.package, { weight_oz: 160, length_in: 21, width_in: 18, height_in: 7 });
  assert.equal(describeChanges(c), "condition and package size");
});

test("saving without changes sends nothing to eBay", () => {
  const same = { ...before, list_price: 189.99, weight_oz: 144, length_in: 21, width_in: 15, height_in: 10 };
  assert.equal(hasChanges(diffForEbay(before, same)), false);
});

test("New is eBay's New with box (1000) for shoes, which also allow New without box", () => {
  const shoes = [1000, 1500, 1750, 2990, 3000, 3010];
  assert.equal(conditionIdFor({ condition: "new", condition_grade: null }, shoes), 1000);
  assert.equal(conditionFor({ condition: "new", condition_grade: null }, shoes), "NEW");
});

test("Seller Hub listings keep the photos she put on eBay herself, drop the ones she deleted", () => {
  const merged = mergeLegacyPictures(["https://i.ebayimg.com/hers1", "https://i.ebayimg.com/app-old"], ["https://i.ebayimg.com/app-new"], [
    "https://i.ebayimg.com/app-old",
  ]);
  assert.deepEqual(merged, ["https://i.ebayimg.com/hers1", "https://i.ebayimg.com/app-new"]);
});

test("Seller Hub revise XML carries condition, package and photos", () => {
  const { item, deleted } = legacyReviseXml("840146442146", {
    conditionId: 1000,
    conditionDescription: null,
    package: { weightOz: 160, dims: { length: 21, width: 18, height: 6.5 } },
    pictureUrls: ["https://i.ebayimg.com/a?x=1&y=2"],
  });
  assert.match(item, /<ConditionID>1000<\/ConditionID>/);
  assert.match(item, /<PackageDepth unit="in">7<\/PackageDepth>/);
  assert.match(item, /<WeightMajor unit="lbs">10<\/WeightMajor><WeightMinor unit="oz">0<\/WeightMinor>/);
  assert.match(item, /<PictureURL>https:\/\/i.ebayimg.com\/a\?x=1&amp;y=2<\/PictureURL>/);
  assert.deepEqual(deleted, ["Item.ConditionDescription"]);
});
