-- Fix: anonymous read/write exposure of audit/activity tables
-- Created: 2026-07-07
--
-- group_activity and invitation_reconciliation_audit sit in the public schema
-- with RLS DISABLED and GRANT ALL to anon/authenticated, so anyone with the
-- public anon key can read member emails, user_ids, group_ids (verified) and
-- is granted write/delete. Neither table is read by any client or edge
-- function (mobile makes no direct PostgREST calls; the activity feed reads
-- transaction_history), so we lock both down to deny-all: RLS on, no policies,
-- grants revoked. Writes continue via SECURITY DEFINER functions (owner
-- postgres) which bypass RLS.
--
-- log_group_member_activity() and log_group_invitation_activity() are currently
-- SECURITY INVOKER. The email-invite path inserts as `authenticated`, so with
-- deny-all RLS those trigger writes would be denied and break invite creation.
-- Make them SECURITY DEFINER so the audit write bypasses RLS.
-- (search_path already pinned to public in 20260706060002; re-affirm here.)

CREATE OR REPLACE FUNCTION public.log_group_member_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.group_activity (
      group_id,
      actor_id,
      target_user_id,
      action,
      metadata
    ) VALUES (
      NEW.group_id,
      COALESCE(auth.uid(), NEW.user_id),
      NEW.user_id,
      'member_added',
      jsonb_build_object('role', NEW.role)
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.group_activity (
      group_id,
      actor_id,
      target_user_id,
      action,
      metadata
    ) VALUES (
      OLD.group_id,
      COALESCE(auth.uid(), OLD.user_id),
      OLD.user_id,
      'member_removed',
      jsonb_build_object('role', OLD.role)
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_group_invitation_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor UUID;
BEGIN
  actor := COALESCE(auth.uid(), NEW.invited_by);

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.group_activity (
      group_id,
      actor_id,
      target_email,
      action,
      metadata
    ) VALUES (
      NEW.group_id,
      actor,
      LOWER(NEW.email),
      'invite_created',
      jsonb_build_object('status', NEW.status, 'invitation_id', NEW.id)
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Log status transitions
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NEW.status = 'cancelled' THEN
        INSERT INTO public.group_activity (
          group_id,
          actor_id,
          target_email,
          action,
          metadata
        ) VALUES (
          NEW.group_id,
          actor,
          LOWER(NEW.email),
          'invite_cancelled',
          jsonb_build_object('invitation_id', NEW.id)
        );
      ELSIF NEW.status = 'accepted' THEN
        INSERT INTO public.group_activity (
          group_id,
          actor_id,
          target_email,
          action,
          metadata
        ) VALUES (
          NEW.group_id,
          actor,
          LOWER(NEW.email),
          'invite_accepted',
          jsonb_build_object('invitation_id', NEW.id)
        );
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.log_group_member_activity() IS
  'Audit trail for group membership changes (SECURITY DEFINER so writes bypass RLS on group_activity)';
COMMENT ON FUNCTION public.log_group_invitation_activity() IS
  'Audit trail for invitation changes (SECURITY DEFINER so writes bypass RLS on group_activity)';

-- group_activity: enable RLS, revoke client grants. No policy => deny-all
-- for anon/authenticated; postgres (function owner) bypasses RLS.
ALTER TABLE public.group_activity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.group_activity FROM anon, authenticated;

-- invitation_reconciliation_audit: same treatment, guarded because it is
-- schema-drift (exists on prod, not in local migrations). Its writer is
-- already SECURITY DEFINER, so no trigger fix needed.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'invitation_reconciliation_audit'
  ) THEN
    EXECUTE 'ALTER TABLE public.invitation_reconciliation_audit ENABLE ROW LEVEL SECURITY';
    EXECUTE 'REVOKE ALL ON TABLE public.invitation_reconciliation_audit FROM anon, authenticated';
  END IF;
END
$$;
