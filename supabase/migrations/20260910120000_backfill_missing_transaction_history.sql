-- Migration: 20260910120000_backfill_missing_transaction_history.sql
-- Description: Backfill legacy transactions and settlements into transaction_history
-- so that groups (such as early groups like "forget") display their complete activity feed.

-- 1. Backfill transactions lacking history records
INSERT INTO public.transaction_history (
  transaction_id,
  activity_type,
  group_id,
  action,
  changed_by,
  changed_at,
  changes,
  snapshot
)
SELECT
  t.id AS transaction_id,
  'transaction' AS activity_type,
  t.group_id,
  'created' AS action,
  COALESCE(
    t.user_id,
    (SELECT p.user_id FROM public.participants p WHERE p.id = t.paid_by_participant_id AND p.user_id IS NOT NULL LIMIT 1),
    (SELECT gm.user_id FROM public.group_members gm WHERE gm.group_id = t.group_id AND gm.role = 'owner' LIMIT 1),
    (SELECT gm.user_id FROM public.group_members gm WHERE gm.group_id = t.group_id LIMIT 1),
    (SELECT id FROM auth.users LIMIT 1)
  ) AS changed_by,
  COALESCE(t.created_at, t.date::timestamp, NOW()) AS changed_at,
  jsonb_build_object('action', 'created', 'transaction', to_jsonb(t)) AS changes,
  to_jsonb(t) AS snapshot
FROM public.transactions t
WHERE t.group_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.transaction_history th
    WHERE th.transaction_id = t.id
  )
  AND EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = COALESCE(
      t.user_id,
      (SELECT p.user_id FROM public.participants p WHERE p.id = t.paid_by_participant_id AND p.user_id IS NOT NULL LIMIT 1),
      (SELECT gm.user_id FROM public.group_members gm WHERE gm.group_id = t.group_id AND gm.role = 'owner' LIMIT 1),
      (SELECT gm.user_id FROM public.group_members gm WHERE gm.group_id = t.group_id LIMIT 1),
      (SELECT id FROM auth.users LIMIT 1)
    )
  );

-- 2. Backfill settlements lacking history records
INSERT INTO public.transaction_history (
  settlement_id,
  activity_type,
  group_id,
  action,
  changed_by,
  changed_at,
  changes,
  snapshot
)
SELECT
  s.id AS settlement_id,
  'settlement' AS activity_type,
  s.group_id,
  'created' AS action,
  COALESCE(
    s.created_by,
    (SELECT p.user_id FROM public.participants p WHERE p.id = s.from_participant_id AND p.user_id IS NOT NULL LIMIT 1),
    (SELECT p.user_id FROM public.participants p WHERE p.id = s.to_participant_id AND p.user_id IS NOT NULL LIMIT 1),
    (SELECT gm.user_id FROM public.group_members gm WHERE gm.group_id = s.group_id AND gm.role = 'owner' LIMIT 1),
    (SELECT gm.user_id FROM public.group_members gm WHERE gm.group_id = s.group_id LIMIT 1),
    (SELECT id FROM auth.users LIMIT 1)
  ) AS changed_by,
  COALESCE(s.created_at, NOW()) AS changed_at,
  jsonb_build_object('action', 'created', 'settlement', to_jsonb(s)) AS changes,
  to_jsonb(s) AS snapshot
FROM public.settlements s
WHERE s.group_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.transaction_history th
    WHERE th.settlement_id = s.id
  )
  AND EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = COALESCE(
      s.created_by,
      (SELECT p.user_id FROM public.participants p WHERE p.id = s.from_participant_id AND p.user_id IS NOT NULL LIMIT 1),
      (SELECT p.user_id FROM public.participants p WHERE p.id = s.to_participant_id AND p.user_id IS NOT NULL LIMIT 1),
      (SELECT gm.user_id FROM public.group_members gm WHERE gm.group_id = s.group_id AND gm.role = 'owner' LIMIT 1),
      (SELECT gm.user_id FROM public.group_members gm WHERE gm.group_id = s.group_id LIMIT 1),
      (SELECT id FROM auth.users LIMIT 1)
    )
  );
