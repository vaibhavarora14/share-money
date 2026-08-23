export const TRANSACTION_HIGHLIGHT_DURATION_MS = 1_000;

type HighlightScheduler = (
  callback: () => void,
  delayMs: number,
) => () => void;

const defaultScheduler: HighlightScheduler = (callback, delayMs) => {
  const timeout = setTimeout(callback, delayMs);
  return () => clearTimeout(timeout);
};

export function startTransactionHighlightTimer(
  onClear: () => void,
  schedule: HighlightScheduler = defaultScheduler,
): () => void {
  return schedule(onClear, TRANSACTION_HIGHLIGHT_DURATION_MS);
}

export function shouldConsumeTransactionHighlight(
  requestedTransactionId: number | null,
  visibleTransactionId: number | null,
  highlightedRowY: number | null,
  transactionsSectionY: number | null,
  alreadyConsumed: boolean,
): boolean {
  return !alreadyConsumed &&
    requestedTransactionId !== null &&
    requestedTransactionId === visibleTransactionId &&
    highlightedRowY !== null &&
    transactionsSectionY !== null;
}

export function shouldClearTransactionHighlightOnScroll(
  visibleTransactionId: number | null,
  highlightedRowY: number | null,
): boolean {
  return visibleTransactionId !== null && highlightedRowY !== null;
}

export function openTransactionWithHighlightConsumption(
  highlightedTransactionId: number | null,
  onConsumeHighlight: ((transactionId: number) => void) | undefined,
  onOpenTransaction: () => void,
): void {
  if (highlightedTransactionId !== null) {
    onConsumeHighlight?.(highlightedTransactionId);
  }

  onOpenTransaction();
}
