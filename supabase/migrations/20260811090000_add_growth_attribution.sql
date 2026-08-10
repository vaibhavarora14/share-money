-- Growth attribution, durable group activation, and idempotent Splitwise imports.
-- Acquisition data is deliberately bounded metadata; it must never contain ledger data.

BEGIN;

ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS acquisition_context JSONB,
  ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS activation_method TEXT;

ALTER TABLE public.groups
  DROP CONSTRAINT IF EXISTS groups_activation_method_check;

ALTER TABLE public.groups
  ADD CONSTRAINT groups_activation_method_check
  CHECK (activation_method IS NULL OR activation_method IN ('manual_expense', 'splitwise_import'));

CREATE INDEX IF NOT EXISTS idx_groups_activated_at
  ON public.groups(activated_at)
  WHERE activated_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.splitwise_imports (
  id UUID PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'completed', 'failed')),
  imported_expenses INTEGER NOT NULL DEFAULT 0 CHECK (imported_expenses >= 0),
  imported_settlements INTEGER NOT NULL DEFAULT 0 CHECK (imported_settlements >= 0),
  activated BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_splitwise_imports_group_created
  ON public.splitwise_imports(group_id, created_at DESC);

ALTER TABLE public.splitwise_imports ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.splitwise_imports TO authenticated;

DROP POLICY IF EXISTS "Users can view own Splitwise imports" ON public.splitwise_imports;
CREATE POLICY "Users can view own Splitwise imports"
  ON public.splitwise_imports
  FOR SELECT
  USING (created_by = auth.uid());

DROP POLICY IF EXISTS "Users can create own Splitwise imports" ON public.splitwise_imports;
CREATE POLICY "Users can create own Splitwise imports"
  ON public.splitwise_imports
  FOR INSERT
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "Users can update own Splitwise imports" ON public.splitwise_imports;
CREATE POLICY "Users can update own Splitwise imports"
  ON public.splitwise_imports
  FOR UPDATE
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

DROP FUNCTION IF EXISTS public.create_group(VARCHAR, TEXT);

CREATE FUNCTION public.create_group(
  group_name VARCHAR(255),
  group_description TEXT DEFAULT NULL,
  group_acquisition_context JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_group_id UUID;
  current_user_id UUID;
BEGIN
  current_user_id := auth.uid();

  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  INSERT INTO public.groups (name, description, created_by, acquisition_context)
  VALUES (group_name, group_description, current_user_id, group_acquisition_context)
  RETURNING id INTO new_group_id;

  RETURN new_group_id;
END;
$$;

COMMIT;
