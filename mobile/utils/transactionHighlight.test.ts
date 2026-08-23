import { assertEquals } from "jsr:@std/assert@1";
import {
  createTransactionHighlightTimer,
  getCachedTransactionHighlightRowY,
  openTransactionWithHighlightConsumption,
  shouldClearTransactionHighlightOnScroll,
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

Deno.test("scroll clears a highlight even when the target row layout is still pending", () => {
  assertEquals(shouldClearTransactionHighlightOnScroll(42), true);
  assertEquals(shouldClearTransactionHighlightOnScroll(null), false);
});

Deno.test("repeated layouts do not restart an active highlight timer", () => {
  const scheduled: Array<{ callback: () => void; cancelled: boolean }> = [];
  let cleared = 0;
  const timer = createTransactionHighlightTimer(
    () => {
      cleared += 1;
    },
    (callback, delayMs) => {
      assertEquals(delayMs, 1_000);
      const entry = { callback, cancelled: false };
      scheduled.push(entry);
      return () => {
        entry.cancelled = true;
      };
    },
  );

  timer.start();
  timer.start();
  timer.start();

  assertEquals(scheduled.length, 1);
  scheduled[0].callback();
  assertEquals(cleared, 1);
  timer.cancel();
  assertEquals(scheduled[0].cancelled, true);
});

Deno.test("a cached initial row layout survives the request effect ordering", () => {
  assertEquals(
    getCachedTransactionHighlightRowY(42, { transactionId: 42, y: 120 }),
    120,
  );
  assertEquals(
    getCachedTransactionHighlightRowY(42, { transactionId: 7, y: 120 }),
    null,
  );
  assertEquals(getCachedTransactionHighlightRowY(42, null), null);
});

Deno.test("opening the highlighted transaction consumes it before navigation", () => {
  let requestedTransactionId: number | null = 42;
  let route = "group";
  const events: string[] = [];

  openTransactionWithHighlightConsumption(
    42,
    (transactionId) => {
      events.push("consume");
      if (requestedTransactionId === transactionId) {
        requestedTransactionId = null;
      }
    },
    () => {
      events.push("open");
      route = "transaction";
    },
  );

  assertEquals(events, ["consume", "open"]);
  assertEquals(route, "transaction");
  assertEquals(requestedTransactionId, null);
  const remountedVisibleTransactionId = requestedTransactionId;
  assertEquals(
    remountedVisibleTransactionId,
    null,
    "the highlight must not replay after the group remounts",
  );
});

Deno.test("opening any transaction consumes the active highlight before navigation", () => {
  let consumedTransactionId: number | null = null;
  let opened = false;

  openTransactionWithHighlightConsumption(
    42,
    (transactionId) => {
      consumedTransactionId = transactionId;
    },
    () => {
      opened = true;
    },
  );

  assertEquals(consumedTransactionId, 42);
  assertEquals(opened, true);
});
