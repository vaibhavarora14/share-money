export type RealtimeGroupEvent =
  | 'TRANSACTION_PUSHED'
  | 'BALANCES_PUSHED'
  | 'DATA_MUTATED';

/** Shape of one message in the Realtime REST broadcast batch body. */
export interface RealtimeBroadcastMessage {
  topic: string;
  event: RealtimeGroupEvent;
  private: true;
  payload: Record<string, unknown>;
}

/**
 * Build the REST broadcast body for a group-sync signal.
 * Always private + never requires callers to remember the topic convention.
 * Callers must pass id-only / signal payloads (no full ledger rows).
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
          ...payload,
          groupId,
          timestamp,
        },
      },
    ],
  };
}
