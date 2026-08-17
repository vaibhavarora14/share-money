import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from '../_shared/env.ts';
import { createErrorResponse, handleError } from '../_shared/error-handler.ts';
import { log } from '../_shared/logger.ts';
import { createEmptyResponse, createSuccessResponse } from '../_shared/response.ts';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';

interface OutboxRow {
  id: string;
  notification_id: string;
  attempts: number;
}

interface NotificationRow {
  id: string;
  recipient_user_id: string;
  title: string;
  body: string;
  group_id: string | null;
  transaction_id: number | null;
  snapshot: Record<string, unknown>;
}

interface PushTokenRow {
  id: string;
  expo_push_token: string;
  platform: 'ios' | 'android';
}

interface ExpoResult {
  status?: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

function assertWorkerSecret(req: Request): void {
  const expected = Deno.env.get('NOTIFICATION_WORKER_SECRET');
  const received = req.headers.get('x-notification-worker-secret');
  if (!expected || !received || received !== expected) {
    throw new Error('Unauthorized notification worker request');
  }
}

function createAdmin(): SupabaseClient {
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

function expoHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'Accept-Encoding': 'gzip, deflate',
    'Content-Type': 'application/json',
  };
  const accessToken = Deno.env.get('EXPO_ACCESS_TOKEN');
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  return headers;
}

async function markOutbox(
  admin: SupabaseClient,
  row: OutboxRow,
  status: 'sent' | 'skipped' | 'failed',
  error: string | null = null,
): Promise<void> {
  const terminal = status !== 'failed' || row.attempts >= 5;
  const delaySeconds = Math.min(3600, Math.pow(2, row.attempts) * 60);
  const { error: updateError } = await admin
    .from('notification_outbox')
    .update({
      status,
      locked_at: null,
      last_error: error?.slice(0, 1000) ?? null,
      processed_at: terminal ? new Date().toISOString() : null,
      next_attempt_at: terminal
        ? new Date().toISOString()
        : new Date(Date.now() + delaySeconds * 1000).toISOString(),
    })
    .eq('id', row.id);
  if (updateError) throw updateError;
}

async function deactivateToken(
  admin: SupabaseClient,
  tokenId: string,
  errorCode: string,
): Promise<void> {
  await admin
    .from('push_tokens')
    .update({ active: false, last_error: errorCode })
    .eq('id', tokenId);
}

async function reserveDelivery(
  admin: SupabaseClient,
  notificationId: string,
  tokenId: string,
): Promise<{ id: string; alreadyTicketed: boolean }> {
  const { data: existing, error: existingError } = await admin
    .from('notification_deliveries')
    .select('id, status')
    .eq('notification_id', notificationId)
    .eq('push_token_id', tokenId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing && (existing.status === 'ticketed' || existing.status === 'delivered')) {
    return { id: existing.id, alreadyTicketed: true };
  }

  const { data, error } = await admin
    .from('notification_deliveries')
    .upsert({
      notification_id: notificationId,
      push_token_id: tokenId,
      status: 'pending',
      error_code: null,
      error_message: null,
    }, { onConflict: 'notification_id,push_token_id' })
    .select('id')
    .single();
  if (error || !data) throw error ?? new Error('Unable to reserve push delivery');
  return { id: data.id, alreadyTicketed: false };
}

async function sendPush(
  notification: NotificationRow,
  token: PushTokenRow,
  unreadCount: number,
): Promise<ExpoResult> {
  const isDigest = unreadCount > 1;
  const response = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: expoHeaders(),
    body: JSON.stringify({
      to: token.expo_push_token,
      sound: 'default',
      title: isDigest ? 'ShareMoney' : notification.title,
      body: isDigest
        ? `${unreadCount > 99 ? '99+' : unreadCount} new notifications`
        : notification.body,
      badge: Math.min(unreadCount, 99),
      channelId: 'transactions',
      collapseId: `notifications-${notification.recipient_user_id}`,
      tag: `notifications-${notification.recipient_user_id}`,
      data: isDigest
        ? { route: 'notifications' }
        : {
          route: 'notification-detail',
          notification_id: notification.id,
          group_id: notification.group_id,
          transaction_id: notification.transaction_id,
        },
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Expo push request failed (${response.status}): ${JSON.stringify(payload)}`);
  }
  return (Array.isArray(payload?.data) ? payload.data[0] : payload?.data) ?? {};
}

async function processOutboxRow(admin: SupabaseClient, row: OutboxRow): Promise<'sent' | 'skipped'> {
  const { data: notification, error: notificationError } = await admin
    .from('notifications')
    .select('id, recipient_user_id, title, body, group_id, transaction_id, snapshot')
    .eq('id', row.notification_id)
    .maybeSingle();
  if (notificationError) throw notificationError;
  if (!notification) {
    await markOutbox(admin, row, 'skipped', 'Notification no longer exists');
    return 'skipped';
  }

  const [preferenceResult, tokensResult, unreadResult] = await Promise.all([
    admin
      .from('notification_preferences')
      .select('push_enabled, permission_status')
      .eq('user_id', notification.recipient_user_id)
      .maybeSingle(),
    admin
      .from('push_tokens')
      .select('id, expo_push_token, platform')
      .eq('user_id', notification.recipient_user_id)
      .eq('active', true),
    admin
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_user_id', notification.recipient_user_id)
      .is('read_at', null),
  ]);
  if (preferenceResult.error) throw preferenceResult.error;
  if (tokensResult.error) throw tokensResult.error;
  if (unreadResult.error) throw unreadResult.error;

  const preference = preferenceResult.data;
  const tokens = (tokensResult.data ?? []) as PushTokenRow[];
  if (!preference?.push_enabled || preference.permission_status !== 'granted' || tokens.length === 0) {
    await markOutbox(admin, row, 'skipped');
    return 'skipped';
  }

  const unreadCount = Math.max(1, unreadResult.count ?? 1);
  let ticketed = 0;

  for (const token of tokens) {
    const reservation = await reserveDelivery(admin, notification.id, token.id);
    if (reservation.alreadyTicketed) {
      ticketed += 1;
      continue;
    }
    const deliveryId = reservation.id;
    try {
      const ticket = await sendPush(notification as NotificationRow, token, unreadCount);
      const errorCode = ticket.details?.error ?? null;
      const status = ticket.status === 'ok' && ticket.id ? 'ticketed' : 'failed';
      const { error: deliveryError } = await admin
        .from('notification_deliveries')
        .update({
          status,
          expo_ticket_id: ticket.id ?? null,
          error_code: errorCode,
          error_message: ticket.message ?? null,
        })
        .eq('id', deliveryId);
      if (deliveryError) throw deliveryError;

      if (status === 'ticketed') ticketed += 1;
      if (errorCode === 'DeviceNotRegistered') {
        await deactivateToken(admin, token.id, errorCode);
      } else if (status === 'failed') {
        throw new Error(ticket.message || errorCode || 'Expo rejected the push ticket');
      }
    } catch (error) {
      await admin
        .from('notification_deliveries')
        .update({
          status: 'failed',
          error_message: error instanceof Error ? error.message.slice(0, 1000) : String(error).slice(0, 1000),
        })
        .eq('id', deliveryId);
      throw error;
    }
  }

  await markOutbox(admin, row, 'sent', ticketed > 0 ? null : 'Expo rejected every token');
  return 'sent';
}

async function checkReceipts(admin: SupabaseClient): Promise<number> {
  const { data: deliveries, error } = await admin
    .from('notification_deliveries')
    .select('id, expo_ticket_id, push_token_id')
    .eq('status', 'ticketed')
    .is('receipt_checked_at', null)
    .not('expo_ticket_id', 'is', null)
    .order('created_at')
    .limit(300);
  if (error) throw error;
  if (!deliveries?.length) return 0;

  const ids = deliveries.map((delivery) => delivery.expo_ticket_id);
  const response = await fetch(EXPO_RECEIPTS_URL, {
    method: 'POST',
    headers: expoHeaders(),
    body: JSON.stringify({ ids }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Expo receipt request failed (${response.status})`);

  let checked = 0;
  for (const delivery of deliveries) {
    const receipt = payload?.data?.[delivery.expo_ticket_id];
    if (!receipt) continue;
    const errorCode = receipt.details?.error ?? null;
    await admin
      .from('notification_deliveries')
      .update({
        status: receipt.status === 'ok' ? 'delivered' : 'failed',
        error_code: errorCode,
        error_message: receipt.message ?? null,
        receipt_checked_at: new Date().toISOString(),
      })
      .eq('id', delivery.id);
    if (errorCode === 'DeviceNotRegistered') {
      await deactivateToken(admin, delivery.push_token_id, errorCode);
    }
    checked += 1;
  }
  return checked;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return createEmptyResponse(200, req);
  if (req.method !== 'POST') {
    return createErrorResponse(405, 'Method not allowed', 'METHOD_NOT_ALLOWED', undefined, req);
  }

  try {
    assertWorkerSecret(req);
    const admin = createAdmin();
    const { data, error } = await admin.rpc('claim_notification_outbox', { p_limit: 25 });
    if (error) throw error;

    let sent = 0;
    let skipped = 0;
    let failed = 0;
    for (const row of (data ?? []) as OutboxRow[]) {
      try {
        const result = await processOutboxRow(admin, row);
        if (result === 'sent') sent += 1;
        else skipped += 1;
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        log.error('Notification push attempt failed', 'notification-worker', {
          outboxId: row.id,
          notificationId: row.notification_id,
          error: message,
        });
        await markOutbox(admin, row, 'failed', message);
      }
    }

    let receiptsChecked = 0;
    try {
      receiptsChecked = await checkReceipts(admin);
    } catch (error) {
      log.warn('Expo receipts check failed', 'notification-worker', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return createSuccessResponse({
      claimed: data?.length ?? 0,
      sent,
      skipped,
      failed,
      receipts_checked: receiptsChecked,
    }, 200, 0, req);
  } catch (error) {
    return handleError(error, 'notification worker', req);
  }
});
