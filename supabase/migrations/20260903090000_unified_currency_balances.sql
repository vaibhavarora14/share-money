-- Unified balances: optional settlement currency, preferred currency, and rate books.
-- Original expense/settlement amounts stay in the currency they were entered in.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_currency VARCHAR(3);

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_preferred_currency_format;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_preferred_currency_format
  CHECK (
    preferred_currency IS NULL
    OR preferred_currency ~ '^[A-Z]{3}$'
  );

COMMENT ON COLUMN public.profiles.preferred_currency IS
  'ISO 4217 code used for this user''s personal totals. Does not change group settlement.';

ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS settlement_currency VARCHAR(3);

ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS unify_balances BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.groups
  DROP CONSTRAINT IF EXISTS groups_settlement_currency_format;

ALTER TABLE public.groups
  ADD CONSTRAINT groups_settlement_currency_format
  CHECK (
    settlement_currency IS NULL
    OR settlement_currency ~ '^[A-Z]{3}$'
  );

COMMENT ON COLUMN public.groups.settlement_currency IS
  'Optional ISO 4217 code the group agrees to settle in. NULL keeps per-currency balances.';
COMMENT ON COLUMN public.groups.unify_balances IS
  'When true, clients show a derived one-currency total. Stored amounts are not rewritten.';

CREATE TABLE IF NOT EXISTS public.exchange_rates (
  base_currency VARCHAR(3) NOT NULL,
  quote_currency VARCHAR(3) NOT NULL,
  rate NUMERIC(18, 8) NOT NULL CHECK (rate > 0),
  as_of DATE NOT NULL,
  provider TEXT NOT NULL DEFAULT 'frankfurter',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (base_currency, quote_currency)
);

COMMENT ON TABLE public.exchange_rates IS
  'Cached market quotes used by every client so members see the same derived balance.';

CREATE TABLE IF NOT EXISTS public.group_exchange_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  from_currency VARCHAR(3) NOT NULL CHECK (from_currency ~ '^[A-Z]{3}$'),
  to_currency VARCHAR(3) NOT NULL CHECK (to_currency ~ '^[A-Z]{3}$'),
  rate NUMERIC(18, 8) NOT NULL CHECK (rate > 0),
  CONSTRAINT group_exchange_rates_distinct_pair CHECK (from_currency <> to_currency),
  source TEXT NOT NULL DEFAULT 'group' CHECK (source IN ('group', 'expense')),
  set_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (group_id, from_currency, to_currency)
);

CREATE INDEX IF NOT EXISTS idx_group_exchange_rates_group_id
  ON public.group_exchange_rates(group_id);

CREATE OR REPLACE FUNCTION public.touch_exchange_rate_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS exchange_rates_updated_at_trigger ON public.exchange_rates;
CREATE TRIGGER exchange_rates_updated_at_trigger
  BEFORE UPDATE ON public.exchange_rates
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_exchange_rate_updated_at();

DROP TRIGGER IF EXISTS group_exchange_rates_updated_at_trigger ON public.group_exchange_rates;
CREATE TRIGGER group_exchange_rates_updated_at_trigger
  BEFORE UPDATE ON public.group_exchange_rates
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_exchange_rate_updated_at();

COMMENT ON TABLE public.group_exchange_rates IS
  'Group-agreed pair overrides. Beat cached market rates for that group only.';

ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_exchange_rates ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.exchange_rates FROM anon, authenticated;
GRANT SELECT ON TABLE public.exchange_rates TO authenticated;
GRANT ALL ON TABLE public.exchange_rates TO service_role;

REVOKE ALL ON TABLE public.group_exchange_rates FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.group_exchange_rates TO authenticated;
GRANT ALL ON TABLE public.group_exchange_rates TO service_role;

DROP POLICY IF EXISTS "Authenticated users can read exchange rates"
  ON public.exchange_rates;
CREATE POLICY "Authenticated users can read exchange rates"
  ON public.exchange_rates
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Members can view group exchange rates"
  ON public.group_exchange_rates;
CREATE POLICY "Members can view group exchange rates"
  ON public.group_exchange_rates
  FOR SELECT
  TO authenticated
  USING (public.is_user_group_member(group_id, auth.uid()));

DROP POLICY IF EXISTS "Active members can write group exchange rates"
  ON public.group_exchange_rates;
CREATE POLICY "Active members can write group exchange rates"
  ON public.group_exchange_rates
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.group_members
      WHERE group_id = group_exchange_rates.group_id
        AND user_id = auth.uid()
        AND status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.group_members
      WHERE group_id = group_exchange_rates.group_id
        AND user_id = auth.uid()
        AND status = 'active'
    )
  );

CREATE OR REPLACE FUNCTION public.update_group_currency_settings(
  p_group_id UUID,
  p_settlement_currency VARCHAR,
  p_unify_balances BOOLEAN
)
RETURNS public.groups
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_group public.groups;
  normalized VARCHAR(3);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = p_group_id
      AND user_id = auth.uid()
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Not an active group member';
  END IF;

  IF p_settlement_currency IS NULL OR btrim(p_settlement_currency) = '' THEN
    normalized := NULL;
  ELSE
    normalized := upper(btrim(p_settlement_currency));
    IF normalized !~ '^[A-Z]{3}$' THEN
      RAISE EXCEPTION 'settlement_currency must be a 3-letter code';
    END IF;
  END IF;

  UPDATE public.groups
  SET
    settlement_currency = normalized,
    unify_balances = COALESCE(p_unify_balances, FALSE),
    updated_at = CURRENT_TIMESTAMP
  WHERE id = p_group_id
  RETURNING * INTO updated_group;

  IF updated_group.id IS NULL THEN
    RAISE EXCEPTION 'Group not found';
  END IF;

  RETURN updated_group;
END;
$$;

REVOKE ALL ON FUNCTION public.update_group_currency_settings(UUID, VARCHAR, BOOLEAN)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_group_currency_settings(UUID, VARCHAR, BOOLEAN)
  TO authenticated, service_role;
