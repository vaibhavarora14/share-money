import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  RECORD_SETTLEMENT_LABEL,
  SETTLE_OUTSIDE_APP_HELP,
} from "./settleCopy.ts";

Deno.test("settle copy stays outside-app product truth", () => {
  assertEquals(
    SETTLE_OUTSIDE_APP_HELP,
    "When someone pays outside the app, log it here.",
  );
  assertEquals(RECORD_SETTLEMENT_LABEL, "Record settlement");
});
