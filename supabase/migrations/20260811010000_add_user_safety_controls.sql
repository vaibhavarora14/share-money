-- App Review Guideline 1.2: persist user reports and user-level blocks.

CREATE TABLE IF NOT EXISTS public.user_blocks (
  blocker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (blocker_id, blocked_user_id),
  CONSTRAINT user_blocks_no_self_block CHECK (blocker_id <> blocked_user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked_user
  ON public.user_blocks(blocked_user_id);

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their blocks"
  ON public.user_blocks
  FOR SELECT
  USING (auth.uid() = blocker_id);

CREATE TABLE IF NOT EXISTS public.user_safety_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reported_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL,
  content_type TEXT NOT NULL CHECK (
    content_type IN ('activity', 'transaction', 'settlement', 'profile')
  ),
  content_id TEXT NOT NULL CHECK (char_length(content_id) BETWEEN 1 AND 128),
  reason TEXT NOT NULL CHECK (
    reason IN ('spam', 'harassment', 'hate_speech', 'sexual_content', 'violence', 'other')
  ),
  details TEXT CHECK (details IS NULL OR char_length(details) <= 1000),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'reviewed', 'actioned', 'dismissed')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  CONSTRAINT user_safety_reports_no_self_report CHECK (reporter_id <> reported_user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_safety_reports_status_created
  ON public.user_safety_reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_safety_reports_reported_user
  ON public.user_safety_reports(reported_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_safety_reports_group
  ON public.user_safety_reports(group_id, created_at DESC);

ALTER TABLE public.user_safety_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their submitted safety reports"
  ON public.user_safety_reports
  FOR SELECT
  USING (auth.uid() = reporter_id);

CREATE OR REPLACE FUNCTION public.submit_moderation_action(
  p_action TEXT,
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
  v_reason TEXT;
  v_details TEXT;
  v_report_id UUID;
  v_report_status TEXT;
  v_report_created_at TIMESTAMPTZ;
  v_content_matches BOOLEAN := FALSE;
BEGIN
  IF v_current_user_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Authentication required';
  END IF;

  IF p_action IS NULL OR p_action NOT IN ('report', 'block', 'unblock') THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Unsupported moderation action';
  END IF;

  IF p_target_user_id = v_current_user_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'You cannot block or report yourself';
  END IF;

  IF NOT public.is_user_active_group_member(p_group_id, v_current_user_id)
    OR NOT EXISTS (
      SELECT 1
      FROM public.participants
      WHERE group_id = p_group_id
        AND user_id = p_target_user_id
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'You can only report or block people who share a group with you';
  END IF;

  IF p_action = 'unblock' THEN
    DELETE FROM public.user_blocks
    WHERE blocker_id = v_current_user_id
      AND blocked_user_id = p_target_user_id;

    RETURN QUERY SELECT
      p_action,
      p_target_user_id,
      NULL::UUID,
      NULL::TEXT,
      NULL::TIMESTAMPTZ,
      FALSE;
    RETURN;
  END IF;

  IF p_content_type IS NULL
    OR p_content_type NOT IN ('activity', 'transaction', 'settlement', 'profile')
    OR NULLIF(BTRIM(p_content_id), '') IS NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Reports and blocks must identify valid content';
  END IF;

  v_reason := COALESCE(p_reason, CASE WHEN p_action = 'block' THEN 'harassment' END);
  IF v_reason IS NULL
    OR v_reason NOT IN ('spam', 'harassment', 'hate_speech', 'sexual_content', 'violence', 'other')
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Unsupported report reason';
  END IF;

  v_details := NULLIF(BTRIM(p_details), '');
  IF v_details IS NOT NULL AND CHAR_LENGTH(v_details) > 1000 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Report details must be 1000 characters or fewer';
  END IF;

  CASE p_content_type
    WHEN 'profile' THEN
      v_content_matches := p_content_id = p_target_user_id::TEXT;
    WHEN 'activity' THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.transaction_history
        WHERE id::TEXT = p_content_id
          AND group_id = p_group_id
          AND changed_by = p_target_user_id
      ) INTO v_content_matches;
    WHEN 'transaction' THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.transactions
        WHERE id::TEXT = p_content_id
          AND group_id = p_group_id
          AND user_id = p_target_user_id
      ) INTO v_content_matches;
    WHEN 'settlement' THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.settlements
        WHERE id::TEXT = p_content_id
          AND group_id = p_group_id
          AND created_by = p_target_user_id
      ) INTO v_content_matches;
  END CASE;

  IF NOT v_content_matches THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'The reported content does not match this user or group';
  END IF;

  IF p_action = 'block' THEN
    INSERT INTO public.user_blocks (blocker_id, blocked_user_id)
    VALUES (v_current_user_id, p_target_user_id)
    ON CONFLICT (blocker_id, blocked_user_id) DO NOTHING;
  END IF;

  INSERT INTO public.user_safety_reports (
    reporter_id,
    reported_user_id,
    group_id,
    content_type,
    content_id,
    reason,
    details,
    status,
    reviewed_at
  )
  VALUES (
    v_current_user_id,
    p_target_user_id,
    p_group_id,
    p_content_type,
    BTRIM(p_content_id),
    v_reason,
    v_details,
    'pending',
    NULL
  )
  RETURNING id, status, created_at
  INTO v_report_id, v_report_status, v_report_created_at;

  RETURN QUERY SELECT
    p_action,
    p_target_user_id,
    v_report_id,
    v_report_status,
    v_report_created_at,
    p_action = 'block';
END;
$$;

REVOKE ALL ON TABLE public.user_blocks FROM anon, authenticated;
REVOKE ALL ON TABLE public.user_safety_reports FROM anon, authenticated;
GRANT SELECT ON TABLE public.user_blocks TO authenticated;
GRANT SELECT ON TABLE public.user_safety_reports TO authenticated;

REVOKE ALL ON FUNCTION public.submit_moderation_action(
  TEXT, UUID, UUID, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_moderation_action(
  TEXT, UUID, UUID, TEXT, TEXT, TEXT, TEXT
) TO authenticated, service_role;

COMMENT ON TABLE public.user_blocks IS
  'User-level blocks used to remove content from the blocker activity feed.';
COMMENT ON TABLE public.user_safety_reports IS
  'Reports of objectionable content awaiting developer moderation review.';
