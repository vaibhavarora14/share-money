-- Fix ERROR-level Supabase security advisors on share money (xesuklogveedeppxbbit):
-- 1) auth_users_exposed: public.invitation_reconciliation_metrics joins auth.users
-- 2) security_definer_view: same view runs as owner (postgres) and was granted to anon
--
-- The view is schema-drift (never in local migrations) and is unused by the app /
-- edge functions. Dropping it removes both ERROR findings. Ops can query audit
-- tables with the service role if needed.
--
-- Also revoke anon EXECUTE on SECURITY DEFINER RPCs that are not intentionally
-- public. Keep get_group_invite_preview(text) executable by anon (invite links).

DROP VIEW IF EXISTS public.invitation_reconciliation_metrics;

-- Internal / trigger / admin SECURITY DEFINER functions must not be callable by anon.
REVOKE ALL ON FUNCTION public.accept_group_invitation(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.accept_pending_invitations_for_user(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.add_group_creator_as_owner() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.auto_create_participant_for_invitation() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.auto_create_participant_for_member() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.auto_update_participant_for_member() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_group(character varying, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_or_create_participant(uuid, uuid, character varying) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_user_active_group_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_user_group_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_user_group_owner(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_user_invited_to_group(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_user_member_or_invited(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.log_group_invitation_activity() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.log_group_member_activity() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.merge_participant_into_canonical(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_group_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.repair_participant_duplicates(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sync_participant_state(uuid, uuid, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.track_settlement_changes() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.track_transaction_changes() FROM PUBLIC, anon;

-- These exist on prod (schema drift) — revoke if present.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'log_invitation_reconciliation_event'
  ) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.log_invitation_reconciliation_event(text, uuid, text, uuid, uuid, text, text, text) FROM PUBLIC, anon';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'reconcile_pending_invitations_for_user'
  ) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.reconcile_pending_invitations_for_user(uuid, text, text) FROM PUBLIC, anon';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'create_group_share_link'
      AND pg_get_function_identity_arguments(p.oid) = 'p_group_id uuid, p_max_uses integer, p_valid_days integer'
  ) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.create_group_share_link(uuid, integer, integer) FROM PUBLIC, anon';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'redeem_group_invite_link'
  ) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.redeem_group_invite_link(text) FROM PUBLIC, anon';
  END IF;
END
$$;

-- Intentionally public (unauthenticated invite preview).
GRANT EXECUTE ON FUNCTION public.get_group_invite_preview(text) TO anon, authenticated;

-- Trigger-only / internal helpers: also revoke from authenticated so they cannot
-- be invoked via PostgREST RPC (triggers still fire as function owner).
REVOKE ALL ON FUNCTION public.add_group_creator_as_owner() FROM authenticated;
REVOKE ALL ON FUNCTION public.auto_create_participant_for_invitation() FROM authenticated;
REVOKE ALL ON FUNCTION public.auto_create_participant_for_member() FROM authenticated;
REVOKE ALL ON FUNCTION public.auto_update_participant_for_member() FROM authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM authenticated;
REVOKE ALL ON FUNCTION public.log_group_invitation_activity() FROM authenticated;
REVOKE ALL ON FUNCTION public.log_group_member_activity() FROM authenticated;
REVOKE ALL ON FUNCTION public.track_settlement_changes() FROM authenticated;
REVOKE ALL ON FUNCTION public.track_transaction_changes() FROM authenticated;
REVOKE ALL ON FUNCTION public.merge_participant_into_canonical(uuid, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.repair_participant_duplicates(uuid, text) FROM authenticated;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'log_invitation_reconciliation_event'
  ) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.log_invitation_reconciliation_event(text, uuid, text, uuid, uuid, text, text, text) FROM authenticated';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'reconcile_pending_invitations_for_user'
  ) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.reconcile_pending_invitations_for_user(uuid, text, text) FROM authenticated';
  END IF;
END
$$;
