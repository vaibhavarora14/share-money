import { assertEquals } from "jsr:@std/assert@1";
import {
  shouldConsumeTransactionHighlight,
  startTransactionHighlightTimer,
} from "./transactionHighlight.ts";

Deno.test("transaction highlight clears after a one-second glimpse", () => {
  let scheduledDelay = 0;
  const scheduled = { callback: null as (() => void) | null };
  let cleared = false;

  const cancel = startTransactionHighlightTimer(
    () => {
      cleared = true;
    },
    (callback, delayMs) => {
      scheduled.callback = callback;
      scheduledDelay = delayMs;
      return () => {
        scheduled.callback = null;
      };
    },
  );

  assertEquals(scheduledDelay, 1_000);
  assertEquals(cleared, false);

  scheduled.callback?.();
  assertEquals(cleared, true);

  cancel();
  assertEquals(scheduled.callback, null);
});

Deno.test("transaction highlight is consumed only after its row is laid out", () => {
  assertEquals(shouldConsumeTransactionHighlight(42, 42, null, 100, false), false);
  assertEquals(shouldConsumeTransactionHighlight(42, 42, 20, 100, false), true);
  assertEquals(shouldConsumeTransactionHighlight(42, 42, 20, 100, true), false);
  assertEquals(shouldConsumeTransactionHighlight(42, 7, 20, 100, false), false);
});
