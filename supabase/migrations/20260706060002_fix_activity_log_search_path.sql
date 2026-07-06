-- Fix signup auto-join: activity-log triggers broke under auth search_path
-- Created: 2026-07-06
--
-- Root cause:
-- log_group_member_activity() and log_group_invitation_activity() (from
-- 20251217100000_admin_free_groups.sql) reference the group_activity table
-- WITHOUT a schema qualifier. GoTrue signups execute as supabase_auth_admin,
-- whose search_path is "auth", so when handle_new_user() auto-accepts a
-- pending invitation on signup, the nested trigger fails with
--   relation "group_activity" does not exist
-- and the per-invitation exception handler rolls back the membership insert,
-- leaving the invitation stuck in 'pending'. This silently broke the
-- invite-then-signup auto-join flow for every signup since that migration.
--
-- Fix: recreate both functions with schema-qualified references and a pinned
-- search_path so they work in any execution context.

CREATE OR REPLACE FUNCTION public.log_group_member_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
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
  'Audit trail for group membership changes (schema-qualified so it works under any search_path, e.g. auth signup triggers)';
COMMENT ON FUNCTION public.log_group_invitation_activity() IS
  'Audit trail for invitation changes (schema-qualified so it works under any search_path, e.g. auth signup triggers)';
