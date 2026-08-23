import { assertEquals } from "jsr:@std/assert@1";
import {
  shouldConsumeTransactionHighlight,
  startTransactionHighlightTimer,
} from "./transactionHighlight.ts";

Deno.test("transaction highlight clears after a one-second glimpse", () => {
  let scheduledDelay = 0;
  let scheduledCallback: (() => void) | null = null;
  let cleared = false;

  const cancel = startTransactionHighlightTimer(
    () => {
      cleared = true;
    },
    (callback, delayMs) => {
      scheduledCallback = callback;
      scheduledDelay = delayMs;
      return () => {
        scheduledCallback = null;
      };
    },
  );

  assertEquals(scheduledDelay, 1_000);
  assertEquals(cleared, false);

  scheduledCallback?.();
  assertEquals(cleared, true);

  cancel();
  assertEquals(scheduledCallback, null);
});

Deno.test("transaction highlight is consumed only after its row is laid out", () => {
  assertEquals(shouldConsumeTransactionHighlight(42, 42, null, 100, false), false);
  assertEquals(shouldConsumeTransactionHighlight(42, 42, 20, 100, false), true);
  assertEquals(shouldConsumeTransactionHighlight(42, 42, 20, 100, true), false);
  assertEquals(shouldConsumeTransactionHighlight(42, 7, 20, 100, false), false);
});
