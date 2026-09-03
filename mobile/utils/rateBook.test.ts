import { assertEquals } from "jsr:@std/assert@1";
import { resolveRate } from "./currencyMerge.ts";
import {
  groupSettingsFromGroup,
  overrideMapFromResponse,
  rateBookFromResponse,
  resolveRateBook,
} from "./rateBook.ts";

Deno.test("rateBookFromResponse builds a USD-pivot book with group overrides", () => {
  const book = rateBookFromResponse({
    as_of: "2026-09-02",
    usd_rates: { USD: 1, EUR: 0.86, INR: 88.5 },
    overrides: [{ from: "EUR", to: "INR", rate: 91.2, source: "group" }],
  });

  assertEquals(book?.asOf, "2026-09-02");
  assertEquals(resolveRate("EUR", "INR", book!)?.rate, 91.2);
  assertEquals(resolveRate("EUR", "INR", book!)?.source, "group");
  assertEquals(overrideMapFromResponse({
    overrides: [{ from: "eur", to: "inr", rate: 91.2 }],
  })["EUR:INR"], 91.2);
});

Deno.test("rateBookFromResponse ignores an empty market payload", () => {
  assertEquals(rateBookFromResponse(null), null);
  assertEquals(rateBookFromResponse({ usd_rates: {} }), null);
});

Deno.test("groupSettingsFromGroup maps server columns and keeps a fallback currency", () => {
  assertEquals(
    groupSettingsFromGroup(
      { settlement_currency: "eur", unify_balances: true },
      "INR",
      { "EUR:INR": 91.2 }
    ),
    {
      enabled: true,
      settlementCurrency: "EUR",
      customRates: { "EUR:INR": 91.2 },
    }
  );
  assertEquals(
    groupSettingsFromGroup(undefined, "INR").enabled,
    false
  );
});

Deno.test("resolveRateBook falls back to preview quotes when the server book is missing", () => {
  const preview = resolveRateBook(null, { "EUR:INR": 91.2 });
  assertEquals(resolveRate("USD", "INR", preview)?.rate, 88.5);
  assertEquals(resolveRate("EUR", "INR", preview)?.source, "group");
});
