-- Wake the transaction notification worker as soon as durable outbox work arrives.
-- The minute cron in 20260818090000 remains the recovery path if this request fails.

CREATE OR REPLACE FUNCTION public.get_notification_unread_summary()
RETURNS TABLE(group_id UUID, unread_count BIGINT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT notifications.group_id, COUNT(*)
  FROM public.notifications
  WHERE recipient_user_id = auth.uid()
    AND read_at IS NULL
  GROUP BY notifications.group_id
$$;

REVOKE ALL ON FUNCTION public.get_notification_unread_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_notification_unread_summary() TO authenticated;

CREATE OR REPLACE FUNCTION public.wake_transaction_notification_worker()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  -- Dynamic SQL keeps local databases usable when pg_net or Vault is unavailable.
  -- Delivery is deliberately fail-open: inserting the durable outbox row must win
  -- even when the best-effort wake-up cannot be sent.
  EXECUTE $request$
    WITH worker_config AS (
      SELECT
        MAX(decrypted_secret) FILTER (
          WHERE name = 'notification_worker_function_url'
        ) AS function_url,
        MAX(decrypted_secret) FILTER (
          WHERE name = 'notification_worker_secret'
        ) AS worker_secret
      FROM vault.decrypted_secrets
    )
    SELECT CASE
      WHEN function_url IS NOT NULL AND worker_secret IS NOT NULL THEN
        net.http_post(
          url := function_url,
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-notification-worker-secret', worker_secret
          ),
          body := jsonb_build_object('triggered_at', NOW())
        )
      ELSE NULL
    END
    FROM worker_config
  $request$;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Notification worker wake-up failed; cron will retry: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS wake_transaction_notification_worker_trigger
  ON public.notification_outbox;

CREATE TRIGGER wake_transaction_notification_worker_trigger
  AFTER INSERT ON public.notification_outbox
  FOR EACH ROW
  EXECUTE FUNCTION public.wake_transaction_notification_worker();

REVOKE ALL ON FUNCTION public.wake_transaction_notification_worker() FROM PUBLIC;

COMMENT ON FUNCTION public.wake_transaction_notification_worker() IS
  'Best-effort immediate pg_net wake-up; durable outbox cron remains the fallback.';

COMMENT ON FUNCTION public.get_notification_unread_summary() IS
  'Exact RLS-scoped unread totals grouped for inbox and group badges.';
