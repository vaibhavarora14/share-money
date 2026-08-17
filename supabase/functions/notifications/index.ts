import { verifyAuth } from '../_shared/auth.ts';
import { createErrorResponse, handleError } from '../_shared/error-handler.ts';
import { createEmptyResponse, createSuccessResponse } from '../_shared/response.ts';
import { isValidUUID, validateBodySize } from '../_shared/validation.ts';

const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 100;
const EXPO_PUSH_TOKEN = /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/;

type PermissionStatus = 'not_requested' | 'granted' | 'denied' | 'unavailable';

function parseLimit(value: string | null): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

function parseJson(body: string | null): Record<string, unknown> {
  if (!body) return {};
  const parsed = JSON.parse(body);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid JSON object');
  }
  return parsed as Record<string, unknown>;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return createEmptyResponse(200, req);

  try {
    const rawBody = req.method === 'GET' ? null : await req.text().catch(() => null);
    const size = validateBodySize(rawBody);
    if (!size.valid) {
      return createErrorResponse(413, size.error || 'Request body too large', 'VALIDATION_ERROR', undefined, req);
    }

    const { user, supabase } = await verifyAuth(req);
    const url = new URL(req.url);

    if (req.method === 'GET') {
      const notificationId = url.searchParams.get('id');
      if (notificationId) {
        if (!isValidUUID(notificationId)) {
          return createErrorResponse(400, 'Invalid notification id', 'VALIDATION_ERROR', undefined, req);
        }

        const { data, error } = await supabase
          .from('notifications')
          .select('*')
          .eq('id', notificationId)
          .eq('recipient_user_id', user.id)
          .maybeSingle();
        if (error) return handleError(error, 'fetching notification detail', req);
        if (!data) return createErrorResponse(404, 'Notification not found', 'NOT_FOUND', undefined, req);
        return createSuccessResponse(data, 200, 0, req);
      }

      const limit = parseLimit(url.searchParams.get('limit'));
      const before = url.searchParams.get('before');
      if (before && Number.isNaN(Date.parse(before))) {
        return createErrorResponse(400, 'Invalid before cursor', 'VALIDATION_ERROR', undefined, req);
      }

      let listQuery = supabase
        .from('notifications')
        .select('*')
        .eq('recipient_user_id', user.id)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(limit + 1);
      if (before) listQuery = listQuery.lt('created_at', before);

      const [listResult, unreadResult, preferenceResult] = await Promise.all([
        listQuery,
        supabase
          .from('notifications')
          .select('id, group_id', { count: 'exact' })
          .eq('recipient_user_id', user.id)
          .is('read_at', null),
        supabase
          .from('notification_preferences')
          .select('push_enabled, permission_status, permission_prompted_at, nudge_dismissed_at')
          .eq('user_id', user.id)
          .maybeSingle(),
      ]);

      if (listResult.error) return handleError(listResult.error, 'fetching notifications', req);
      if (unreadResult.error) return handleError(unreadResult.error, 'counting unread notifications', req);
      if (preferenceResult.error) return handleError(preferenceResult.error, 'fetching notification preference', req);

      const unreadByGroup: Record<string, number> = {};
      for (const row of unreadResult.data ?? []) {
        if (!row.group_id) continue;
        unreadByGroup[row.group_id] = (unreadByGroup[row.group_id] ?? 0) + 1;
      }
      const rows = listResult.data ?? [];
      const items = rows.slice(0, limit);

      return createSuccessResponse({
        items,
        unread_count: unreadResult.count ?? rows.filter((row: { read_at: string | null }) => !row.read_at).length,
        unread_by_group: unreadByGroup,
        has_more: rows.length > limit,
        next_cursor: rows.length > limit ? items[items.length - 1]?.created_at ?? null : null,
        preference: preferenceResult.data ?? {
          push_enabled: false,
          permission_status: 'not_requested',
          permission_prompted_at: null,
          nudge_dismissed_at: null,
        },
      }, 200, 0, req);
    }

    let payload: Record<string, unknown>;
    try {
      payload = parseJson(rawBody);
    } catch {
      return createErrorResponse(400, 'Invalid JSON in request body', 'VALIDATION_ERROR', undefined, req);
    }

    if (req.method === 'PATCH') {
      const action = payload.action;
      const now = new Date().toISOString();

      if (action === 'read') {
        const id = typeof payload.id === 'string' ? payload.id : '';
        if (!isValidUUID(id)) {
          return createErrorResponse(400, 'Invalid notification id', 'VALIDATION_ERROR', undefined, req);
        }
        const { data, error } = await supabase
          .from('notifications')
          .update({ read_at: now })
          .eq('id', id)
          .eq('recipient_user_id', user.id)
          .select('id, read_at')
          .maybeSingle();
        if (error) return handleError(error, 'marking notification read', req);
        if (!data) return createErrorResponse(404, 'Notification not found', 'NOT_FOUND', undefined, req);
        return createSuccessResponse(data, 200, 0, req);
      }

      if (action === 'read_all') {
        const requestedThrough = typeof payload.through === 'string' ? payload.through : now;
        if (Number.isNaN(Date.parse(requestedThrough))) {
          return createErrorResponse(400, 'Invalid read-all timestamp', 'VALIDATION_ERROR', undefined, req);
        }
        const through = new Date(Math.min(Date.parse(requestedThrough), Date.now())).toISOString();
        const { data, error } = await supabase
          .from('notifications')
          .update({ read_at: now })
          .eq('recipient_user_id', user.id)
          .is('read_at', null)
          .lte('created_at', through)
          .select('id');
        if (error) return handleError(error, 'marking all notifications read', req);
        return createSuccessResponse({ updated: data?.length ?? 0, read_at: now, through }, 200, 0, req);
      }

      return createErrorResponse(400, 'Unsupported notification action', 'VALIDATION_ERROR', undefined, req);
    }

    if (req.method === 'PUT') {
      const action = payload.action;

      if (action === 'preference') {
        const pushEnabled = payload.push_enabled;
        const permissionStatus = payload.permission_status;
        const allowed: PermissionStatus[] = ['not_requested', 'granted', 'denied', 'unavailable'];
        if (typeof pushEnabled !== 'boolean' || !allowed.includes(permissionStatus as PermissionStatus)) {
          return createErrorResponse(400, 'Invalid notification preference', 'VALIDATION_ERROR', undefined, req);
        }
        if (pushEnabled && permissionStatus !== 'granted') {
          return createErrorResponse(400, 'Push requires granted permission', 'VALIDATION_ERROR', undefined, req);
        }

        const promptedAt = permissionStatus === 'not_requested' ? null : new Date().toISOString();
        const { data, error } = await supabase
          .from('notification_preferences')
          .upsert({
            user_id: user.id,
            push_enabled: pushEnabled,
            permission_status: permissionStatus,
            permission_prompted_at: promptedAt,
          }, { onConflict: 'user_id' })
          .select('push_enabled, permission_status, permission_prompted_at, nudge_dismissed_at')
          .single();
        if (error) return handleError(error, 'updating notification preference', req);
        return createSuccessResponse(data, 200, 0, req);
      }

      if (action === 'dismiss_nudge') {
        const { data, error } = await supabase
          .from('notification_preferences')
          .upsert({
            user_id: user.id,
            push_enabled: false,
            permission_status: 'not_requested',
            nudge_dismissed_at: new Date().toISOString(),
          }, { onConflict: 'user_id' })
          .select('push_enabled, permission_status, permission_prompted_at, nudge_dismissed_at')
          .single();
        if (error) return handleError(error, 'dismissing notification nudge', req);
        return createSuccessResponse(data, 200, 0, req);
      }

      if (action === 'push_token') {
        const token = typeof payload.token === 'string' ? payload.token.trim() : '';
        const platform = payload.platform;
        const deviceId = typeof payload.device_id === 'string' ? payload.device_id.slice(0, 255) : null;
        if (!EXPO_PUSH_TOKEN.test(token) || (platform !== 'ios' && platform !== 'android')) {
          return createErrorResponse(400, 'Invalid Expo push token', 'VALIDATION_ERROR', undefined, req);
        }

        const { data, error } = await supabase
          .from('push_tokens')
          .upsert({
            user_id: user.id,
            expo_push_token: token,
            platform,
            device_id: deviceId,
            active: true,
            last_error: null,
            last_seen_at: new Date().toISOString(),
          }, { onConflict: 'expo_push_token' })
          .select('id, platform, active, last_seen_at')
          .single();
        if (error) return handleError(error, 'registering push token', req);
        return createSuccessResponse(data, 200, 0, req);
      }

      return createErrorResponse(400, 'Unsupported notification action', 'VALIDATION_ERROR', undefined, req);
    }

    if (req.method === 'DELETE') {
      const token = typeof payload.token === 'string' ? payload.token.trim() : '';
      if (!EXPO_PUSH_TOKEN.test(token)) {
        return createErrorResponse(400, 'Invalid Expo push token', 'VALIDATION_ERROR', undefined, req);
      }
      const { error } = await supabase
        .from('push_tokens')
        .delete()
        .eq('user_id', user.id)
        .eq('expo_push_token', token);
      if (error) return handleError(error, 'removing push token', req);
      return createSuccessResponse({ success: true }, 200, 0, req);
    }

    return createErrorResponse(405, 'Method not allowed', 'METHOD_NOT_ALLOWED', undefined, req);
  } catch (error) {
    return handleError(error, 'notifications handler', req);
  }
});
