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
