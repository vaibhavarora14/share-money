import { assertEquals } from "jsr:@std/assert@1";
import {
  buildRatesPayload,
  isCacheFresh,
  mergeUsdRates,
  parseExchangeRateApiResponse,
  parseFrankfurterResponse,
  rowsToUsdRates,
  usdRatesToRows,
  validateGroupRateInput,
} from "./rates.ts";

Deno.test("parseFrankfurterResponse keeps official USD quotes", () => {
  const parsed = parseFrankfurterResponse({
    amount: 1,
    base: "USD",
    date: "2026-09-02",
    rates: { EUR: 0.86, GBP: 0.74, INR: "nope", XYZ: 2 },
  });

  assertEquals(parsed?.asOf, "2026-09-02");
  assertEquals(parsed?.usdRates.USD, 1);
  assertEquals(parsed?.usdRates.EUR, 0.86);
  assertEquals(parsed?.usdRates.GBP, 0.74);
  assertEquals(parsed?.usdRates.INR, undefined);
  assertEquals(parsed?.usdRates.XYZ, undefined);
});

Deno.test("parseExchangeRateApiResponse fills currencies Frankfurter omits", () => {
  const parsed = parseExchangeRateApiResponse({
    result: "success",
    time_last_update_utc: "Wed, 02 Sep 2026 00:00:01 +0000",
    rates: { INR: 88.5, EUR: 0.85, USD: 1 },
  });

  assertEquals(parsed?.usdRates.INR, 88.5);
  assertEquals(parsed?.asOf, "2026-09-02");
});

Deno.test("mergeUsdRates lets Frankfurter win overlapping quotes", () => {
  const merged = mergeUsdRates({ EUR: 0.86 }, { EUR: 0.85, INR: 88.5 });
  assertEquals(merged.EUR, 0.86);
  assertEquals(merged.INR, 88.5);
  assertEquals(merged.USD, 1);
});

Deno.test("isCacheFresh expires after the shared TTL", () => {
  const now = Date.parse("2026-09-03T12:00:00.000Z");
  assertEquals(isCacheFresh("2026-09-03T01:00:00.000Z", now), true);
  assertEquals(isCacheFresh("2026-09-02T11:00:00.000Z", now), false);
});

Deno.test("usd rate rows round-trip through the cache shape", () => {
  const rows = usdRatesToRows({ USD: 1, INR: 88.5 }, "2026-09-02", (code) =>
    code === "INR" ? "exchangerate-api" : "frankfurter"
  );
  assertEquals(rows.find((row) => row.quote_currency === "INR")?.provider, "exchangerate-api");
  assertEquals(rowsToUsdRates(rows).INR, 88.5);
});

Deno.test("validateGroupRateInput rejects same-currency and invalid rates", () => {
  const valid = validateGroupRateInput({
    group_id: "11111111-1111-1111-1111-111111111111",
    from: "eur",
    to: "inr",
    rate: 91.2,
    source: "expense",
  });
  assertEquals(valid.valid, true);
  assertEquals(valid.value?.from, "EUR");
  assertEquals(valid.value?.source, "expense");

  assertEquals(validateGroupRateInput({
    group_id: "11111111-1111-1111-1111-111111111111",
    from: "EUR",
    to: "EUR",
    rate: 1,
  }).valid, false);
  assertEquals(validateGroupRateInput({
    group_id: "not-a-uuid",
    from: "EUR",
    to: "INR",
    rate: 91.2,
  }).valid, false);
});

Deno.test("buildRatesPayload keeps group overrides next to the market book", () => {
  const payload = buildRatesPayload(
    { EUR: 0.86, INR: 88.5 },
    [{ from_currency: "EUR", to_currency: "INR", rate: 91.2, source: "group" }],
    "2026-09-02",
    false,
    ["frankfurter", "exchangerate-api"],
  );
  assertEquals(payload.overrides[0], {
    from: "EUR",
    to: "INR",
    rate: 91.2,
    source: "group",
    updated_at: undefined,
  });
  assertEquals(payload.usd_rates.INR, 88.5);
});
