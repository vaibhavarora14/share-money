import { assertEquals } from "jsr:@std/assert@1";
import { formatCurrency } from "./currency.ts";

Deno.test("formats Thai Baht with the baht symbol", () => {
  assertEquals(formatCurrency(1250.5, "THB"), "฿1,250.50");
});

Deno.test("formats zero-decimal currencies without cents", () => {
  assertEquals(formatCurrency(15000, "VND"), "₫15,000");
  assertEquals(formatCurrency(1200, "JPY"), "¥1,200");
});

Deno.test("falls back to the currency code for unknown symbols", () => {
  assertEquals(formatCurrency(20, "XYZ"), "XYZ20.00");
});
