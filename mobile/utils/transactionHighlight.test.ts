import { assertEquals } from "jsr:@std/assert";
import { startTransactionHighlightTimer } from "./transactionHighlight.ts";

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
