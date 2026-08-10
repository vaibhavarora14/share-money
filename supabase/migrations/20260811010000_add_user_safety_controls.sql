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

CREATE POLICY "Users can create their blocks"
  ON public.user_blocks
  FOR INSERT
  WITH CHECK (auth.uid() = blocker_id);

CREATE POLICY "Users can remove their blocks"
  ON public.user_blocks
  FOR DELETE
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

CREATE POLICY "Users can submit safety reports"
  ON public.user_safety_reports
  FOR INSERT
  WITH CHECK (
    auth.uid() = reporter_id
    AND reporter_id <> reported_user_id
  );

COMMENT ON TABLE public.user_blocks IS
  'User-level blocks used to remove content from the blocker activity feed.';
COMMENT ON TABLE public.user_safety_reports IS
  'Reports of objectionable content awaiting developer moderation review.';
