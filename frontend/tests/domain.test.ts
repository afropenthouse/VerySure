import { test } from "node:test";
import assert from "node:assert/strict";
import { amountToKobo, money } from "../src/domain";
test("wallet form converts naira input to integer kobo with required minimum", () => {
  assert.equal(amountToKobo("100.01", 100), 10001);
  assert.equal(amountToKobo("500"), 50000);
  for (const value of [
    "-1",
    "0",
    "1.001",
    "NaN",
    "",
    "Infinity",
    "999999999999999999",
  ])
    assert.throws(() => amountToKobo(value));
  assert.throws(() => amountToKobo("99.99", 100));
});
test("wallet display preserves kobo precision", () => {
  assert.equal(money(10001), "₦100.01");
  assert.equal(money(0), "₦0.00");
});
