-- Make moderation POSTs safe to retry after an ambiguous network failure.

ALTER TABLE public.user_safety_reports
  ADD COLUMN IF NOT EXISTS request_id UUID,
  ADD COLUMN IF NOT EXISTS moderation_action TEXT NOT NULL DEFAULT 'report';

ALTER TABLE public.user_safety_reports
  DROP CONSTRAINT IF EXISTS user_safety_reports_moderation_action_check;

ALTER TABLE public.user_safety_reports
  ADD CONSTRAINT user_safety_reports_moderation_action_check
  CHECK (moderation_action IN ('report', 'block'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_safety_reports_request_id
  ON public.user_safety_reports(reporter_id, request_id)
  WHERE request_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.submit_moderation_action_v2(
  p_action TEXT,
  p_request_id UUID,
  p_group_id UUID,
  p_target_user_id UUID,
  p_content_type TEXT DEFAULT NULL,
  p_content_id TEXT DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_details TEXT DEFAULT NULL
)
RETURNS TABLE (
  action TEXT,
  target_user_id UUID,
  report_id UUID,
  report_status TEXT,
  report_created_at TIMESTAMPTZ,
  blocked BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current_user_id UUID := auth.uid();
  v_existing public.user_safety_reports%ROWTYPE;
  v_result RECORD;
  v_normalized_reason TEXT := COALESCE(
    p_reason,
    CASE WHEN p_action = 'block' THEN 'harassment' END
  );
  v_normalized_details TEXT := NULLIF(BTRIM(p_details), '');
BEGIN
  IF v_current_user_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Authentication required';
  END IF;

  IF p_request_id IS NOT NULL THEN
    SELECT *
    INTO v_existing
    FROM public.user_safety_reports
    WHERE reporter_id = v_current_user_id
      AND request_id = p_request_id;

    IF FOUND THEN
      IF v_existing.moderation_action IS DISTINCT FROM p_action
        OR v_existing.reported_user_id IS DISTINCT FROM p_target_user_id
        OR v_existing.group_id IS DISTINCT FROM p_group_id
        OR v_existing.content_type IS DISTINCT FROM p_content_type
        OR v_existing.content_id IS DISTINCT FROM BTRIM(p_content_id)
        OR v_existing.reason IS DISTINCT FROM v_normalized_reason
        OR v_existing.details IS DISTINCT FROM v_normalized_details
      THEN
        RAISE EXCEPTION USING
          ERRCODE = '22023',
          MESSAGE = 'An idempotency key cannot be reused for a different moderation action';
      END IF;

      RETURN QUERY SELECT
        v_existing.moderation_action,
        v_existing.reported_user_id,
        v_existing.id,
        v_existing.status,
        v_existing.created_at,
        v_existing.moderation_action = 'block';
      RETURN;
    END IF;
  END IF;

  SELECT *
  INTO v_result
  FROM public.submit_moderation_action(
    p_action,
    p_group_id,
    p_target_user_id,
    p_content_type,
    p_content_id,
    p_reason,
    p_details
  );

  IF v_result.report_id IS NOT NULL THEN
    UPDATE public.user_safety_reports
    SET request_id = p_request_id,
        moderation_action = p_action
    WHERE id = v_result.report_id;
  END IF;

  RETURN QUERY SELECT
    v_result.action::TEXT,
    v_result.target_user_id::UUID,
    v_result.report_id::UUID,
    v_result.report_status::TEXT,
    v_result.report_created_at::TIMESTAMPTZ,
    v_result.blocked::BOOLEAN;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_moderation_action_v2(
  TEXT, UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_moderation_action_v2(
  TEXT, UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT
) TO authenticated, service_role;

COMMENT ON FUNCTION public.submit_moderation_action_v2(
  TEXT, UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT
) IS 'Validates and persists an idempotent report, block, or unblock action.';
