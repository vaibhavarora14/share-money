export type RealtimeGroupEvent =
  | 'TRANSACTION_PUSHED'
  | 'DATA_MUTATED';

/** Shape of one message in the Realtime REST broadcast batch body. */
export interface RealtimeBroadcastMessage {
  topic: string;
  event: RealtimeGroupEvent;
  private: true;
  payload: Record<string, unknown>;
}

/**
 * Keys allowed on the wire. Full ledger rows (transaction, settlement,
 * balances, …) are never forwarded — defense in depth beyond caller convention.
 */
const ALLOWED_SIGNAL_KEYS = new Set([
  'entity',
  'action',
  'transactionId',
  'settlementId',
]);

function isPlainScalar(value: unknown): boolean {
  const t = typeof value;
  return (
    value === null ||
    t === 'string' ||
    t === 'number' ||
    t === 'boolean'
  );
}

/**
 * Strip accidental full-row bodies and unknown keys. Only id-only / signal
 * fields survive (plus groupId + timestamp added by the builder).
 */
export function sanitizeGroupBroadcastPayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!ALLOWED_SIGNAL_KEYS.has(key)) continue;
    if (!isPlainScalar(value)) continue;
    sanitized[key] = value;
  }
  return sanitized;
}

/**
 * Build the REST broadcast body for a group-sync signal.
 * Always private; payloads are sanitized to id-only / DATA_MUTATED signals.
 */
export function buildGroupBroadcastBody(
  groupId: string,
  event: RealtimeGroupEvent,
  payload: Record<string, unknown>,
  timestamp = new Date().toISOString(),
): { messages: RealtimeBroadcastMessage[] } {
  return {
    messages: [
      {
        topic: `group-sync:${groupId}`,
        event,
        private: true,
        payload: {
          ...sanitizeGroupBroadcastPayload(payload),
          groupId,
          timestamp,
        },
      },
    ],
  };
}
