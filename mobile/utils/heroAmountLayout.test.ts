import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  HERO_AMOUNT_SYMBOL_RESERVE,
  HERO_AMOUNT_WEB_CHAR_WIDTH,
  getWebHeroAmountInputWidth,
} from "./heroAmountLayout.ts";

describe("getWebHeroAmountInputWidth", () => {
  it("sizes empty/short amounts to at least the 40px minimum", () => {
    const result = getWebHeroAmountInputWidth(0, 360);
    assert.equal(result.width, 40);
    assert.equal(result.maxWidth, 360 - HERO_AMOUNT_SYMBOL_RESERVE);
  });

  it("grows with digit count until the container cap", () => {
    const short = getWebHeroAmountInputWidth(3, 600);
    assert.equal(short.width, 3 * HERO_AMOUNT_WEB_CHAR_WIDTH);

    const long = getWebHeroAmountInputWidth(40, 360);
    assert.equal(long.width, 360 - HERO_AMOUNT_SYMBOL_RESERVE);
    assert.ok(long.width < 40 * HERO_AMOUNT_WEB_CHAR_WIDTH);
  });

  it("leaves room for the currency symbol inside the container", () => {
    const { width, maxWidth } = getWebHeroAmountInputWidth(20, 320);
    assert.equal(maxWidth, 320 - HERO_AMOUNT_SYMBOL_RESERVE);
    assert.ok(
      typeof maxWidth === "number" &&
        width + HERO_AMOUNT_SYMBOL_RESERVE <= 320
    );
  });

  it("falls back to 100% maxWidth before layout measurement", () => {
    const result = getWebHeroAmountInputWidth(5, 0);
    assert.equal(result.maxWidth, "100%");
    assert.equal(result.width, 5 * HERO_AMOUNT_WEB_CHAR_WIDTH);
  });
});
