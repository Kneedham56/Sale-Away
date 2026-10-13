import { test } from "node:test";
import assert from "node:assert/strict";
import { mockOrders, mockTransactions } from "../src/lib/ebay/mock";
import { lineGross } from "../src/lib/ebay/sync";

test("mock fixtures cover the plan's cases", () => {
  const orders = mockOrders();
  assert.ok(orders.some((o) => o.lineItems.length > 1), "multi-item order");
  assert.ok(orders.some((o) => o.cancelStatus?.cancelState === "CANCELED"), "cancelled");
  assert.ok(orders.some((o) => o.orderPaymentStatus === "FULLY_REFUNDED"), "refund");
  assert.ok(mockTransactions().some((t) => t.transactionType === "SHIPPING_LABEL"), "label cost");
});

test("line gross is item price plus buyer-paid shipping", () => {
  const [first] = mockOrders();
  assert.equal(lineGross(first.lineItems[0]), 31.49);
});
