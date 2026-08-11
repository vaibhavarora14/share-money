-- Growth attribution, durable activation, idempotent group creation, and
-- transactionally safe Splitwise imports.

BEGIN;

ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS acquisition_context JSONB,
  ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS activation_method TEXT,
  ADD COLUMN IF NOT EXISTS activation_source_id TEXT,
  ADD COLUMN IF NOT EXISTS creation_id UUID;

ALTER TABLE public.groups
  DROP CONSTRAINT IF EXISTS groups_activation_method_check;

ALTER TABLE public.groups
  ADD CONSTRAINT groups_activation_method_check
  CHECK (activation_method IS NULL OR activation_method IN ('manual_expense', 'splitwise_import'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_groups_creator_creation_id
  ON public.groups(created_by, creation_id)
  WHERE creation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_groups_activated_at
  ON public.groups(activated_at)
  WHERE activated_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.splitwise_imports (
  id UUID PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_hash TEXT NOT NULL,
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
REVOKE ALL ON public.splitwise_imports FROM PUBLIC, anon, authenticated;

-- This helper is intentionally strict about required fields and discards every
-- unrecognised field. The SECURITY DEFINER group RPC therefore cannot be used
-- to bypass the edge-function privacy allowlist.
CREATE OR REPLACE FUNCTION public.sanitize_group_acquisition_context(
  p_context JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_source TEXT;
  v_medium TEXT;
  v_campaign TEXT;
  v_content TEXT;
  v_landing_path TEXT;
  v_referrer_host TEXT;
  v_intent TEXT;
  v_captured_at TEXT;
BEGIN
  IF p_context IS NULL THEN
    RETURN NULL;
  END IF;

  IF jsonb_typeof(p_context) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid acquisition context';
  END IF;

  v_source := p_context->>'source';
  v_medium := p_context->>'medium';
  v_campaign := NULLIF(p_context->>'campaign', '');
  v_content := NULLIF(p_context->>'content', '');
  v_landing_path := p_context->>'landing_path';
  v_referrer_host := NULLIF(LOWER(p_context->>'referrer_host'), '');
  v_intent := p_context->>'intent';
  v_captured_at := p_context->>'captured_at';

  IF v_source IS NULL OR LENGTH(v_source) > 120 OR v_source !~ '^[A-Za-z0-9][A-Za-z0-9_-]*$'
     OR v_medium IS NULL OR LENGTH(v_medium) > 120 OR v_medium !~ '^[A-Za-z0-9][A-Za-z0-9_-]*$'
     OR v_landing_path IS NULL OR LENGTH(v_landing_path) > 200 OR v_landing_path !~ '^/[A-Za-z0-9/_-]*$'
     OR v_intent NOT IN ('splitwise-import', 'standard')
     OR v_captured_at IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid acquisition context';
  END IF;

  PERFORM v_captured_at::TIMESTAMPTZ;

  IF v_campaign IS NOT NULL
     AND (LENGTH(v_campaign) > 120 OR v_campaign !~ '^[A-Za-z0-9][A-Za-z0-9_-]*$') THEN
    v_campaign := NULL;
  END IF;

  IF v_content IS NOT NULL
     AND (LENGTH(v_content) > 120 OR v_content !~ '^[A-Za-z0-9][A-Za-z0-9_-]*$') THEN
    v_content := NULL;
  END IF;

  IF v_referrer_host IS NOT NULL
     AND (LENGTH(v_referrer_host) > 253 OR v_referrer_host !~ '^(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$') THEN
    v_referrer_host := NULL;
  END IF;

  RETURN jsonb_strip_nulls(jsonb_build_object(
    'source', v_source,
    'medium', v_medium,
    'campaign', v_campaign,
    'content', v_content,
    'landing_path', v_landing_path,
    'referrer_host', v_referrer_host,
    'intent', v_intent,
    'captured_at', v_captured_at
  ));
END;
$$;

DROP FUNCTION IF EXISTS public.create_group(VARCHAR, TEXT);
DROP FUNCTION IF EXISTS public.create_group(VARCHAR, TEXT, JSONB);

CREATE OR REPLACE FUNCTION public.create_group(
  group_name VARCHAR(255),
  group_description TEXT DEFAULT NULL,
  group_acquisition_context JSONB DEFAULT NULL,
  group_creation_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_group_id UUID;
  v_user_id UUID := auth.uid();
  v_acquisition_context JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'User not authenticated';
  END IF;

  IF NULLIF(BTRIM(group_name), '') IS NULL OR LENGTH(BTRIM(group_name)) > 255 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid group name';
  END IF;

  IF group_creation_id IS NOT NULL THEN
    SELECT id INTO v_group_id
    FROM public.groups
    WHERE created_by = v_user_id
      AND creation_id = group_creation_id;

    IF v_group_id IS NOT NULL THEN
      RETURN v_group_id;
    END IF;
  END IF;

  v_acquisition_context := public.sanitize_group_acquisition_context(group_acquisition_context);

  INSERT INTO public.groups (
    name,
    description,
    created_by,
    acquisition_context,
    creation_id
  ) VALUES (
    BTRIM(group_name),
    NULLIF(BTRIM(group_description), ''),
    v_user_id,
    v_acquisition_context,
    group_creation_id
  )
  ON CONFLICT (created_by, creation_id) WHERE creation_id IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_group_id;

  IF v_group_id IS NULL THEN
    SELECT id INTO STRICT v_group_id
    FROM public.groups
    WHERE created_by = v_user_id
      AND creation_id = group_creation_id;
  END IF;

  RETURN v_group_id;
END;
$$;

REVOKE ALL ON FUNCTION public.sanitize_group_acquisition_context(JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_group(VARCHAR, TEXT, JSONB, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_group(VARCHAR, TEXT, JSONB, UUID) TO authenticated;

-- Keep growth fields writable only through the secured functions and triggers.
REVOKE INSERT, UPDATE ON public.groups FROM authenticated;
GRANT INSERT (name, description, created_by) ON public.groups TO authenticated;
GRANT UPDATE (name, description, updated_at) ON public.groups TO authenticated;

CREATE OR REPLACE FUNCTION public.activate_group_on_first_expense()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_import_id TEXT := NULLIF(current_setting('sharedmoney.splitwise_import_id', TRUE), '');
BEGIN
  IF NEW.group_id IS NOT NULL AND NEW.type = 'expense' THEN
    UPDATE public.groups
    SET
      activated_at = NOW(),
      activation_method = CASE WHEN v_import_id IS NULL THEN 'manual_expense' ELSE 'splitwise_import' END,
      activation_source_id = COALESCE(v_import_id, NEW.id::TEXT)
    WHERE id = NEW.group_id
      AND activated_at IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_activate_group_on_first_expense ON public.transactions;
CREATE TRIGGER trigger_activate_group_on_first_expense
  AFTER INSERT ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.activate_group_on_first_expense();

REVOKE ALL ON FUNCTION public.activate_group_on_first_expense() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.import_splitwise(
  p_import_id UUID,
  p_group_id UUID,
  p_expenses JSONB,
  p_settlements JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_request_hash TEXT;
  v_existing public.splitwise_imports%ROWTYPE;
  v_expense JSONB;
  v_settlement JSONB;
  v_split JSONB;
  v_transaction_id INTEGER;
  v_expense_count INTEGER;
  v_settlement_count INTEGER;
  v_split_total NUMERIC;
  v_activated BOOLEAN := FALSE;
  v_participant_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'User not authenticated';
  END IF;

  IF p_import_id IS NULL OR p_group_id IS NULL
     OR jsonb_typeof(p_expenses) <> 'array'
     OR jsonb_typeof(p_settlements) <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid Splitwise import request';
  END IF;

  v_expense_count := jsonb_array_length(p_expenses);
  v_settlement_count := jsonb_array_length(p_settlements);

  IF v_expense_count + v_settlement_count = 0
     OR v_expense_count + v_settlement_count > 2000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Splitwise import must contain between 1 and 2000 items';
  END IF;

  v_request_hash := md5(p_group_id::TEXT || ':' || p_expenses::TEXT || ':' || p_settlements::TEXT);

  SELECT * INTO v_existing
  FROM public.splitwise_imports
  WHERE id = p_import_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.created_by <> v_user_id OR v_existing.group_id <> p_group_id THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Import id is already in use';
    END IF;

    IF v_existing.request_hash <> v_request_hash THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Import id cannot be reused with a different payload';
    END IF;

    IF v_existing.status = 'completed' THEN
      RETURN jsonb_build_object(
        'import_id', v_existing.id,
        'imported_expenses', v_existing.imported_expenses,
        'imported_settlements', v_existing.imported_settlements,
        'activated', v_existing.activated,
        'duplicate', TRUE
      );
    END IF;

    IF v_existing.status = 'processing'
       AND v_existing.updated_at > NOW() - INTERVAL '15 minutes' THEN
      RAISE EXCEPTION USING ERRCODE = '55P03', MESSAGE = 'Import is already processing';
    END IF;

    UPDATE public.splitwise_imports
    SET status = 'processing', updated_at = NOW()
    WHERE id = p_import_id;
  ELSE
    IF NOT EXISTS (
      SELECT 1
      FROM public.group_members
      WHERE group_id = p_group_id
        AND user_id = v_user_id
        AND status = 'active'
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Active group membership is required';
    END IF;

    INSERT INTO public.splitwise_imports (
      id,
      group_id,
      created_by,
      request_hash
    ) VALUES (
      p_import_id,
      p_group_id,
      v_user_id,
      v_request_hash
    );
  END IF;

  -- Validate membership again for a non-completed retry. A user who left may
  -- retrieve a completed result but may not resume a failed/stale import.
  IF NOT EXISTS (
    SELECT 1
    FROM public.group_members
    WHERE group_id = p_group_id
      AND user_id = v_user_id
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Active group membership is required';
  END IF;

  PERFORM set_config('sharedmoney.splitwise_import_id', p_import_id::TEXT, TRUE);

  FOR v_expense IN SELECT value FROM jsonb_array_elements(p_expenses)
  LOOP
    IF jsonb_typeof(v_expense) <> 'object'
       OR NULLIF(BTRIM(v_expense->>'description'), '') IS NULL
       OR LENGTH(BTRIM(v_expense->>'description')) > 1000
       OR COALESCE((v_expense->>'amount')::NUMERIC, 0) <= 0
       OR COALESCE(LENGTH(v_expense->>'currency'), 0) <> 3
       OR jsonb_typeof(v_expense->'splits') <> 'array'
       OR jsonb_array_length(v_expense->'splits') = 0 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid Splitwise expense';
    END IF;

    v_participant_id := (v_expense->>'paid_by_participant_id')::UUID;
    IF NOT EXISTS (
      SELECT 1 FROM public.participants
      WHERE id = v_participant_id AND group_id = p_group_id
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid participant in Splitwise expense';
    END IF;

    SELECT COALESCE(SUM((split->>'amount')::NUMERIC), 0)
    INTO v_split_total
    FROM jsonb_array_elements(v_expense->'splits') split;

    IF ROUND(v_split_total, 2) <> ROUND((v_expense->>'amount')::NUMERIC, 2) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Split amounts must equal the expense amount';
    END IF;

    INSERT INTO public.transactions (
      user_id,
      amount,
      description,
      date,
      type,
      category,
      group_id,
      currency,
      paid_by_participant_id
    ) VALUES (
      v_user_id,
      (v_expense->>'amount')::NUMERIC,
      BTRIM(v_expense->>'description'),
      (v_expense->>'date')::DATE,
      'expense',
      NULLIF(BTRIM(v_expense->>'category'), ''),
      p_group_id,
      UPPER(v_expense->>'currency'),
      v_participant_id
    )
    RETURNING id INTO v_transaction_id;

    FOR v_split IN SELECT value FROM jsonb_array_elements(v_expense->'splits')
    LOOP
      v_participant_id := (v_split->>'participant_id')::UUID;
      IF COALESCE((v_split->>'amount')::NUMERIC, 0) <= 0 OR NOT EXISTS (
        SELECT 1 FROM public.participants
        WHERE id = v_participant_id AND group_id = p_group_id
      ) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid participant split';
      END IF;

      INSERT INTO public.transaction_splits (transaction_id, participant_id, amount)
      VALUES (v_transaction_id, v_participant_id, (v_split->>'amount')::NUMERIC);
    END LOOP;
  END LOOP;

  FOR v_settlement IN SELECT value FROM jsonb_array_elements(p_settlements)
  LOOP
    IF jsonb_typeof(v_settlement) <> 'object'
       OR COALESCE((v_settlement->>'amount')::NUMERIC, 0) <= 0
       OR COALESCE(LENGTH(v_settlement->>'currency'), 0) <> 3
       OR (v_settlement->>'from_participant_id') = (v_settlement->>'to_participant_id') THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid Splitwise settlement';
    END IF;

    IF (
      SELECT COUNT(*)
      FROM public.participants
      WHERE group_id = p_group_id
        AND id IN (
          (v_settlement->>'from_participant_id')::UUID,
          (v_settlement->>'to_participant_id')::UUID
        )
    ) <> 2 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid participant in Splitwise settlement';
    END IF;

    INSERT INTO public.settlements (
      group_id,
      from_participant_id,
      to_participant_id,
      amount,
      currency,
      notes,
      created_by
    ) VALUES (
      p_group_id,
      (v_settlement->>'from_participant_id')::UUID,
      (v_settlement->>'to_participant_id')::UUID,
      (v_settlement->>'amount')::NUMERIC,
      UPPER(v_settlement->>'currency'),
      NULLIF(BTRIM(v_settlement->>'notes'), ''),
      v_user_id
    );
  END LOOP;

  UPDATE public.groups
  SET
    activated_at = NOW(),
    activation_method = 'splitwise_import',
    activation_source_id = p_import_id::TEXT
  WHERE id = p_group_id
    AND activated_at IS NULL;
  v_activated := FOUND;

  IF NOT v_activated THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.groups
      WHERE id = p_group_id
        AND activation_method = 'splitwise_import'
        AND activation_source_id = p_import_id::TEXT
    ) INTO v_activated;
  END IF;

  PERFORM set_config('sharedmoney.splitwise_import_id', '', TRUE);

  UPDATE public.splitwise_imports
  SET
    status = 'completed',
    imported_expenses = v_expense_count,
    imported_settlements = v_settlement_count,
    activated = v_activated,
    completed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_import_id;

  RETURN jsonb_build_object(
    'import_id', p_import_id,
    'imported_expenses', v_expense_count,
    'imported_settlements', v_settlement_count,
    'activated', v_activated,
    'duplicate', FALSE
  );
END;
$$;

REVOKE ALL ON FUNCTION public.import_splitwise(UUID, UUID, JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_splitwise(UUID, UUID, JSONB, JSONB) TO authenticated;

COMMIT;
