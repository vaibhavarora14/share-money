import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from './env.ts';
import { log } from './logger.ts';
import {
  buildGroupBroadcastBody,
  type RealtimeGroupEvent,
} from './realtime-broadcast-body.ts';

export type { RealtimeGroupEvent, RealtimeBroadcastMessage } from './realtime-broadcast-body.ts';
export {
  buildGroupBroadcastBody,
  sanitizeGroupBroadcastPayload,
} from './realtime-broadcast-body.ts';

/**
 * Broadcasts a realtime message to connected clients on private channel
 * group-sync:${groupId}. Uses Supabase Realtime REST API for low-overhead,
 * non-blocking delivery.
 *
 * Production-safe contract:
 * - Only DATA_MUTATED and id-only TRANSACTION_PUSHED (delete) are emitted.
 * - Payloads are sanitized so full ledger rows cannot leak even if a caller
 *   accidentally includes them.
 * - Messages are marked private: true; membership requires realtime.messages
 *   RLS from supabase/manual/realtime_messages_group_sync_rls.sql (Dashboard /
 *   privileged SQL Editor — not applied by db push).
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
