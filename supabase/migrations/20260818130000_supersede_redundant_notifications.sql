-- Keep the inbox actionable by superseding older events for the same
-- recipient and transaction while retaining every immutable notification row.

ALTER TABLE public.notifications
  ADD COLUMN transaction_reference_id INTEGER,
  ADD COLUMN superseded_at TIMESTAMPTZ,
  ADD COLUMN superseded_by_id UUID;

UPDATE public.notifications
SET transaction_reference_id = COALESCE(
  transaction_id,
  CASE
    WHEN snapshot #>> '{transaction,id}' ~ '^[1-9][0-9]*$'
      THEN (snapshot #>> '{transaction,id}')::INTEGER
    ELSE NULL
  END
)
WHERE transaction_reference_id IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.notifications
    WHERE transaction_reference_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot migrate notifications without a stable transaction identity';
  END IF;
END;
$$;

ALTER TABLE public.notifications
  ALTER COLUMN transaction_reference_id SET NOT NULL,
  ADD CONSTRAINT notifications_transaction_reference_positive
    CHECK (transaction_reference_id > 0),
  ADD CONSTRAINT notifications_transaction_reference_matches_live_id
    CHECK (transaction_id IS NULL OR transaction_reference_id = transaction_id),
  ADD CONSTRAINT notifications_superseded_by_fk
    FOREIGN KEY (superseded_by_id)
    REFERENCES public.notifications(id)
    ON DELETE NO ACTION
    DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT notifications_supersession_pair
    CHECK (
      (superseded_at IS NULL AND superseded_by_id IS NULL)
      OR (superseded_at IS NOT NULL AND superseded_by_id IS NOT NULL)
    );

DROP INDEX IF EXISTS public.idx_notifications_recipient_unread;
CREATE INDEX idx_notifications_recipient_unread
  ON public.notifications(recipient_user_id, created_at DESC)
  WHERE read_at IS NULL AND superseded_at IS NULL;

DROP INDEX IF EXISTS public.idx_notifications_recipient_group_unread;
CREATE INDEX idx_notifications_recipient_group_unread
  ON public.notifications(recipient_user_id, group_id)
  WHERE read_at IS NULL AND superseded_at IS NULL;

CREATE INDEX idx_notifications_recipient_active_created
  ON public.notifications(recipient_user_id, created_at DESC, id DESC)
  WHERE superseded_at IS NULL;

-- Collapse any notification history that predates this migration. Older rows
-- point directly to the newest row in their recipient/transaction stream.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY recipient_user_id, transaction_reference_id
      ORDER BY created_at DESC, id DESC
    ) AS position,
    FIRST_VALUE(id) OVER (
      PARTITION BY recipient_user_id, transaction_reference_id
      ORDER BY created_at DESC, id DESC
    ) AS latest_id,
    FIRST_VALUE(created_at) OVER (
      PARTITION BY recipient_user_id, transaction_reference_id
      ORDER BY created_at DESC, id DESC
    ) AS latest_created_at
  FROM public.notifications
)
UPDATE public.notifications AS notification
SET superseded_at = ranked.latest_created_at,
    superseded_by_id = ranked.latest_id
FROM ranked
WHERE notification.id = ranked.id
  AND ranked.position > 1;

CREATE UNIQUE INDEX idx_notifications_recipient_transaction_active
  ON public.notifications(recipient_user_id, transaction_reference_id)
  WHERE superseded_at IS NULL;

UPDATE public.notification_outbox AS outbox
SET status = 'skipped',
    last_error = 'Notification superseded by a newer transaction event',
    processed_at = NOW()
FROM public.notifications AS notification
WHERE notification.id = outbox.notification_id
  AND notification.superseded_at IS NOT NULL
  AND outbox.status IN ('pending', 'failed');

CREATE OR REPLACE FUNCTION public.supersede_previous_transaction_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_active_id UUID;
  current_active_created_at TIMESTAMPTZ;
BEGIN
  NEW.transaction_reference_id := COALESCE(
    NEW.transaction_reference_id,
    NEW.transaction_id,
    CASE
      WHEN NEW.snapshot #>> '{transaction,id}' ~ '^[1-9][0-9]*$'
        THEN (NEW.snapshot #>> '{transaction,id}')::INTEGER
      ELSE NULL
    END
  );

  IF NEW.transaction_reference_id IS NULL THEN
    RAISE EXCEPTION 'Notification requires a stable transaction identity'
      USING ERRCODE = '23514';
  END IF;

  -- Serialize the active row for this recipient/transaction pair so rapid
  -- updates cannot leave two actionable notifications behind.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      NEW.recipient_user_id::TEXT || ':' || NEW.transaction_reference_id::TEXT,
      0
    )
  );

  SELECT notification.id, notification.created_at
  INTO current_active_id, current_active_created_at
  FROM public.notifications AS notification
  WHERE notification.recipient_user_id = NEW.recipient_user_id
    AND notification.transaction_reference_id = NEW.transaction_reference_id
    AND notification.superseded_at IS NULL
  ORDER BY notification.created_at DESC, notification.id DESC
  LIMIT 1;

  -- Retries or imports may arrive out of order. Retain them for history, but
  -- never allow an older event to replace the newer actionable notification.
  IF current_active_id IS NOT NULL
    AND (current_active_created_at, current_active_id) > (NEW.created_at, NEW.id)
  THEN
    NEW.superseded_at := current_active_created_at;
    NEW.superseded_by_id := current_active_id;
    RETURN NEW;
  END IF;

  WITH superseded AS (
    UPDATE public.notifications
    SET superseded_at = NEW.created_at,
        superseded_by_id = NEW.id
    WHERE recipient_user_id = NEW.recipient_user_id
      AND transaction_reference_id = NEW.transaction_reference_id
      AND superseded_at IS NULL
      AND id <> NEW.id
    RETURNING id
  )
  UPDATE public.notification_outbox AS outbox
  SET status = 'skipped',
      last_error = 'Notification superseded by a newer transaction event',
      processed_at = NEW.created_at
  FROM superseded
  WHERE outbox.notification_id = superseded.id
    AND outbox.status IN ('pending', 'failed');

  RETURN NEW;
END;
$$;

CREATE TRIGGER supersede_previous_transaction_notifications_trigger
  BEFORE INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.supersede_previous_transaction_notifications();

CREATE OR REPLACE FUNCTION public.cancel_superseded_notification_outbox()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.notification_outbox AS outbox
  SET status = 'skipped',
      last_error = 'Notification superseded by a newer transaction event',
      processed_at = NEW.created_at
  FROM public.notifications AS notification
  WHERE notification.recipient_user_id = NEW.recipient_user_id
    AND notification.transaction_reference_id = NEW.transaction_reference_id
    AND notification.superseded_at IS NOT NULL
    AND outbox.notification_id = notification.id
    AND outbox.status IN ('pending', 'failed');

  RETURN NEW;
END;
$$;

-- Trigger names are ordered alphabetically for the same event. The zz prefix
-- deliberately runs this after enqueue_transaction_notification_trigger, which
-- also covers multiple versions inserted in one SQL statement.
CREATE TRIGGER zz_cancel_superseded_notification_outbox_trigger
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.cancel_superseded_notification_outbox();

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
    AND superseded_at IS NULL
  GROUP BY notifications.group_id
$$;

CREATE OR REPLACE FUNCTION public.get_active_notification_id(
  p_notification_id UUID
)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH RECURSIVE notification_chain AS (
    SELECT
      notifications.id,
      notifications.superseded_by_id,
      ARRAY[notifications.id] AS visited,
      0 AS depth
    FROM public.notifications
    WHERE notifications.id = p_notification_id
      AND notifications.recipient_user_id = auth.uid()

    UNION ALL

    SELECT
      replacement.id,
      replacement.superseded_by_id,
      notification_chain.visited || replacement.id,
      notification_chain.depth + 1
    FROM notification_chain
    JOIN public.notifications AS replacement
      ON replacement.id = notification_chain.superseded_by_id
    WHERE replacement.recipient_user_id = auth.uid()
      AND notification_chain.depth < 32
      AND NOT replacement.id = ANY(notification_chain.visited)
  )
  SELECT notification_chain.id
  FROM notification_chain
  ORDER BY notification_chain.depth DESC
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.supersede_previous_transaction_notifications()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_superseded_notification_outbox()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_active_notification_id(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_notification_id(UUID)
  TO authenticated;

COMMENT ON COLUMN public.notifications.transaction_reference_id IS
  'Stable transaction identity retained after the live transaction row is deleted.';
COMMENT ON COLUMN public.notifications.superseded_at IS
  'When this immutable event stopped being actionable in the notification inbox.';
COMMENT ON COLUMN public.notifications.superseded_by_id IS
  'The newer notification that replaced this event in the actionable inbox.';
COMMENT ON FUNCTION public.supersede_previous_transaction_notifications() IS
  'Serializes and supersedes the prior active notification for a recipient/transaction pair.';
COMMENT ON FUNCTION public.cancel_superseded_notification_outbox() IS
  'Cancels queued push work for superseded rows, including multi-row notification inserts.';
COMMENT ON FUNCTION public.get_active_notification_id(UUID) IS
  'RLS-scoped resolver from an old push notification ID to the latest actionable replacement.';
