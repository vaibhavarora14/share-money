import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from './env.ts';
import { log } from './logger.ts';

/**
 * Broadcasts a realtime message to connected clients on channel group-sync:${groupId}
 * Uses Supabase Realtime REST API for low-overhead, non-blocking delivery.
 * 
 * Supports both:
 * - Direct Push Model (TRANSACTION_PUSHED, BALANCES_PUSHED): clients update cache directly without GET requests.
 * - Invalidation Signal (DATA_MUTATED): clients pull if payload wasn't fully supplied.
 */
export async function broadcastToGroup(
  groupId: string,
  event: 'TRANSACTION_PUSHED' | 'BALANCES_PUSHED' | 'DATA_MUTATED',
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
      body: JSON.stringify({
        messages: [
          {
            topic: `group-sync:${groupId}`,
            event,
            payload: {
              ...payload,
              groupId,
              timestamp: new Date().toISOString(),
            },
          },
        ],
      }),
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
