import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from './env.ts';
import { log } from './logger.ts';
import {
  buildGroupBroadcastBody,
  type RealtimeGroupEvent,
} from './realtime-broadcast-body.ts';

export type { RealtimeGroupEvent, RealtimeBroadcastMessage } from './realtime-broadcast-body.ts';
export { buildGroupBroadcastBody } from './realtime-broadcast-body.ts';

/**
 * Broadcasts a realtime message to connected clients on private channel
 * group-sync:${groupId}. Uses Supabase Realtime REST API for low-overhead,
 * non-blocking delivery.
 *
 * Production-safe contract:
 * - Prefer DATA_MUTATED with id-only payloads (no full transaction/settlement
 *   bodies). Public/non-member listeners must not receive ledger contents.
 * - Messages are marked private: true so only authorized private-channel
 *   subscribers (group members via realtime.messages RLS) receive them.
 * - TRANSACTION_PUSHED / BALANCES_PUSHED remain typed for delete/id signals
 *   and legacy clients, but callers must not attach full row payloads.
 */
export async function broadcastToGroup(
  groupId: string,
  event: RealtimeGroupEvent,
  payload: Record<string, unknown>
): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !groupId) return;

  try {
    const endpoint = `${SUPABASE_URL}/realtime/v1/api/broadcast`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildGroupBroadcastBody(groupId, event, payload)),
    });

    if (!response.ok) {
      log.warn('Realtime broadcast returned non-200', 'realtime-broadcast', {
        status: response.status,
        groupId,
        event,
      });
    }
  } catch (error) {
    // Best-effort push: failures should never abort the primary database mutation
    log.warn('Failed to broadcast realtime message', 'realtime-broadcast', {
      error: (error as Error)?.message,
      groupId,
      event,
    });
  }
}
