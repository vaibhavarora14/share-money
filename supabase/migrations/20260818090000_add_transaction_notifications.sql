-- Durable transaction notifications and native push delivery state.
-- Created: 2026-08-18

CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL,
  transaction_id INTEGER REFERENCES public.transactions(id) ON DELETE SET NULL,
  source_history_id UUID NOT NULL REFERENCES public.transaction_history(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (
    event_type IN ('transaction_created', 'transaction_updated', 'transaction_deleted')
  ),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 240),
  body TEXT NOT NULL DEFAULT '' CHECK (char_length(body) <= 500),
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT notifications_recipient_history_unique
    UNIQUE (recipient_user_id, source_history_id)
);

CREATE INDEX idx_notifications_recipient_created
  ON public.notifications(recipient_user_id, created_at DESC, id DESC);

CREATE INDEX idx_notifications_recipient_unread
  ON public.notifications(recipient_user_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX idx_notifications_recipient_group_unread
  ON public.notifications(recipient_user_id, group_id)
  WHERE read_at IS NULL;

CREATE TABLE public.notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  push_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  permission_status TEXT NOT NULL DEFAULT 'not_requested' CHECK (
    permission_status IN ('not_requested', 'granted', 'denied', 'unavailable')
  ),
  permission_prompted_at TIMESTAMPTZ,
  nudge_dismissed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expo_push_token TEXT NOT NULL UNIQUE CHECK (char_length(expo_push_token) BETWEEN 10 AND 255),
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  device_id TEXT CHECK (device_id IS NULL OR char_length(device_id) <= 255),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  last_error TEXT,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_push_tokens_user_active
  ON public.push_tokens(user_id, active);

CREATE TABLE public.notification_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL UNIQUE REFERENCES public.notifications(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'processing', 'sent', 'skipped', 'failed')
  ),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at TIMESTAMPTZ,
  last_error TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notification_outbox_ready
  ON public.notification_outbox(status, next_attempt_at)
  WHERE status IN ('pending', 'failed');

CREATE TABLE public.notification_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  push_token_id UUID NOT NULL REFERENCES public.push_tokens(id) ON DELETE CASCADE,
  expo_ticket_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'ticketed', 'delivered', 'failed')
  ),
  error_code TEXT,
  error_message TEXT,
  receipt_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT notification_deliveries_notification_token_unique
    UNIQUE (notification_id, push_token_id)
);

CREATE INDEX idx_notification_deliveries_ticket
  ON public.notification_deliveries(expo_ticket_id)
  WHERE expo_ticket_id IS NOT NULL AND receipt_checked_at IS NULL;

CREATE OR REPLACE FUNCTION public.update_notification_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER notification_preferences_updated_at_trigger
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_notification_timestamp();

CREATE TRIGGER push_tokens_updated_at_trigger
  BEFORE UPDATE ON public.push_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_notification_timestamp();

CREATE TRIGGER notification_outbox_updated_at_trigger
  BEFORE UPDATE ON public.notification_outbox
  FOR EACH ROW EXECUTE FUNCTION public.update_notification_timestamp();

CREATE TRIGGER notification_deliveries_updated_at_trigger
  BEFORE UPDATE ON public.notification_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.update_notification_timestamp();

CREATE OR REPLACE FUNCTION public.enqueue_transaction_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notification_outbox(notification_id)
  VALUES (NEW.id)
  ON CONFLICT (notification_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enqueue_transaction_notification_trigger
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_transaction_notification();

CREATE OR REPLACE FUNCTION public.claim_notification_outbox(p_limit INTEGER DEFAULT 25)
RETURNS SETOF public.notification_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH ready AS (
    SELECT id
    FROM public.notification_outbox
    WHERE (
      status IN ('pending', 'failed')
      OR (status = 'processing' AND locked_at < NOW() - INTERVAL '10 minutes')
    )
      AND next_attempt_at <= NOW()
      AND attempts < 5
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(p_limit, 1), 100)
  )
  UPDATE public.notification_outbox AS outbox
  SET status = 'processing',
      attempts = outbox.attempts + 1,
      locked_at = NOW(),
      last_error = NULL
  FROM ready
  WHERE outbox.id = ready.id
  RETURNING outbox.*;
END;
$$;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.notifications FROM anon, authenticated;
REVOKE ALL ON TABLE public.notification_preferences FROM anon, authenticated;
REVOKE ALL ON TABLE public.push_tokens FROM anon, authenticated;
REVOKE ALL ON TABLE public.notification_outbox FROM anon, authenticated;
REVOKE ALL ON TABLE public.notification_deliveries FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_notification_outbox(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enqueue_transaction_notification() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_notification_outbox(INTEGER) TO service_role;

GRANT SELECT ON TABLE public.notifications TO authenticated;
GRANT UPDATE (read_at) ON TABLE public.notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.notification_preferences TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.push_tokens TO authenticated;

CREATE POLICY "Recipients can view own notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (recipient_user_id = auth.uid());

CREATE POLICY "Recipients can mark own notifications read"
  ON public.notifications FOR UPDATE TO authenticated
  USING (recipient_user_id = auth.uid())
  WITH CHECK (recipient_user_id = auth.uid());

CREATE POLICY "Users can view own notification preference"
  ON public.notification_preferences FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can create own notification preference"
  ON public.notification_preferences FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own notification preference"
  ON public.notification_preferences FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can view own push tokens"
  ON public.push_tokens FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can create own push tokens"
  ON public.push_tokens FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own push tokens"
  ON public.push_tokens FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own push tokens"
  ON public.push_tokens FOR DELETE TO authenticated
  USING (user_id = auth.uid());

COMMENT ON TABLE public.notifications IS
  'Authoritative per-user inbox for material expense changes.';
COMMENT ON COLUMN public.notifications.snapshot IS
  'Immutable actor, group, transaction and before/after financial impact used by notification detail.';
COMMENT ON TABLE public.notification_outbox IS
  'Service-only durable queue for best-effort Expo push delivery.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
    AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net')
    AND EXISTS (
      SELECT 1 FROM vault.decrypted_secrets
      WHERE name IN ('notification_worker_function_url', 'notification_worker_secret')
      GROUP BY TRUE HAVING COUNT(*) = 2
    )
  THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'transaction-notification-worker';

    PERFORM cron.schedule(
      'transaction-notification-worker',
      '* * * * *',
      $cron$
        SELECT net.http_post(
          url := (
            SELECT decrypted_secret FROM vault.decrypted_secrets
            WHERE name = 'notification_worker_function_url'
          ),
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-notification-worker-secret', (
              SELECT decrypted_secret FROM vault.decrypted_secrets
              WHERE name = 'notification_worker_secret'
            )
          ),
          body := jsonb_build_object('scheduled_at', NOW())
        ) AS request_id;
      $cron$
    );
  END IF;
END
$$;
