-- Monthly pending balance email reminders
-- Created: 2026-08-01
--
-- Requires these Supabase Vault secrets before the cron job can invoke the
-- function successfully:
--   monthly_reminders_function_url = https://<project-ref>.supabase.co/functions/v1/monthly-reminders
--   monthly_reminders_cron_secret = same value as REMINDER_CRON_SECRET

CREATE TABLE IF NOT EXISTS public.monthly_reminder_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_key TEXT NOT NULL CHECK (period_key ~ '^\d{4}-\d{2}$'),
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  stats JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_monthly_reminder_runs_period_key
  ON public.monthly_reminder_runs(period_key);

CREATE INDEX IF NOT EXISTS idx_monthly_reminder_runs_started_at
  ON public.monthly_reminder_runs(started_at DESC);

CREATE TABLE IF NOT EXISTS public.monthly_reminder_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES public.monthly_reminder_runs(id) ON DELETE SET NULL,
  period_key TEXT NOT NULL CHECK (period_key ~ '^\d{4}-\d{2}$'),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed')),
  action_count INTEGER NOT NULL DEFAULT 0 CHECK (action_count >= 0),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  resend_message_id TEXT,
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT monthly_reminder_deliveries_period_user_unique
    UNIQUE(period_key, user_id)
);

CREATE INDEX IF NOT EXISTS idx_monthly_reminder_deliveries_run_id
  ON public.monthly_reminder_deliveries(run_id);

CREATE INDEX IF NOT EXISTS idx_monthly_reminder_deliveries_status
  ON public.monthly_reminder_deliveries(status);

CREATE INDEX IF NOT EXISTS idx_monthly_reminder_deliveries_period_status
  ON public.monthly_reminder_deliveries(period_key, status);

CREATE OR REPLACE FUNCTION public.update_monthly_reminder_deliveries_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS monthly_reminder_deliveries_updated_at_trigger
  ON public.monthly_reminder_deliveries;

CREATE TRIGGER monthly_reminder_deliveries_updated_at_trigger
  BEFORE UPDATE ON public.monthly_reminder_deliveries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_monthly_reminder_deliveries_updated_at();

ALTER TABLE public.monthly_reminder_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_reminder_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.monthly_reminder_runs FROM anon, authenticated;
REVOKE ALL ON TABLE public.monthly_reminder_deliveries FROM anon, authenticated;

COMMENT ON TABLE public.monthly_reminder_runs IS
  'Audit log for monthly pending balance reminder function runs.';
COMMENT ON TABLE public.monthly_reminder_deliveries IS
  'Per-user monthly reminder delivery audit and dedupe table.';
COMMENT ON CONSTRAINT monthly_reminder_deliveries_period_user_unique
  ON public.monthly_reminder_deliveries IS
  'Prevents duplicate monthly pending balance reminder emails per user.';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_available_extensions
    WHERE name = 'pg_cron'
  ) THEN
    BEGIN
      EXECUTE 'CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Skipping pg_cron extension creation: %', SQLERRM;
    END;
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_available_extensions
    WHERE name = 'pg_net'
  ) THEN
    BEGIN
      EXECUTE 'CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Skipping pg_net extension creation: %', SQLERRM;
    END;
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_extension
    WHERE extname = 'pg_cron'
  ) AND EXISTS (
    SELECT 1
    FROM pg_extension
    WHERE extname = 'pg_net'
  ) THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'monthly-pending-balance-reminders';

    PERFORM cron.schedule(
      'monthly-pending-balance-reminders',
      '0 9 1 * *',
      $cron$
        SELECT net.http_post(
          url := (
            SELECT decrypted_secret
            FROM vault.decrypted_secrets
            WHERE name = 'monthly_reminders_function_url'
          ),
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-reminder-cron-secret', (
              SELECT decrypted_secret
              FROM vault.decrypted_secrets
              WHERE name = 'monthly_reminders_cron_secret'
            )
          ),
          body := jsonb_build_object('scheduled_at', NOW())
        ) AS request_id;
      $cron$
    );
  END IF;
END
$$;
