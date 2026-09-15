BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(9);

INSERT INTO auth.users (id, email)
VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'owner@example.com'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'member@example.com'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'solo@example.com');

INSERT INTO public.groups (id, name, created_by)
VALUES
  (
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    'Archive test group',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ),
  (
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    'Solo leave group',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  );

INSERT INTO public.group_members (group_id, user_id, role, status)
VALUES
  (
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'owner',
    'active'
  ),
  (
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'member',
    'active'
  ),
  (
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'owner',
    'active'
  );

INSERT INTO public.participants (group_id, user_id, type, role)
VALUES
  (
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'member',
    'owner'
  ),
  (
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'member',
    'member'
  ),
  (
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'member',
    'owner'
  );

-- Owner archives their membership only
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$SELECT public.update_my_group_membership_visibility(
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd'::uuid,
    true,
    NULL
  )$$,
  'owner can archive their own membership'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);

SELECT ok(
  (
    SELECT archived_at IS NOT NULL
    FROM public.group_members
    WHERE group_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
      AND user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ),
  'owner membership is archived'
);

SELECT ok(
  (
    SELECT archived_at IS NULL
    FROM public.group_members
    WHERE group_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
      AND user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  ),
  'other member is unaffected by archive'
);

-- Hide from archived
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$SELECT public.update_my_group_membership_visibility(
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd'::uuid,
    NULL,
    true
  )$$,
  'owner can hide an archived group from their lists'
);

RESET ROLE;

SELECT ok(
  (
    SELECT hidden_at IS NOT NULL AND archived_at IS NULL
    FROM public.group_members
    WHERE group_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
      AND user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ),
  'hidden_at is set and archived_at cleared on hide'
);

-- Owner leave promotes the other member
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
-- Restore active membership for succession test (was hidden)
UPDATE public.group_members
SET status = 'active', left_at = NULL, archived_at = NULL, hidden_at = NULL, role = 'owner'
WHERE group_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
  AND user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$SELECT public.remove_group_member(
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd'::uuid,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid
  )$$,
  'owner can leave when another active member exists'
);
RESET ROLE;

SELECT ok(
  (
    SELECT role = 'owner' AND status = 'active'
    FROM public.group_members
    WHERE group_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
      AND user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  ),
  'remaining member is promoted to owner'
);

-- Sole member can leave; group row remains
SELECT set_config('request.jwt.claim.sub', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$SELECT public.remove_group_member(
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'::uuid,
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid
  )$$,
  'sole member can leave as former'
);
RESET ROLE;

SELECT ok(
  EXISTS (
    SELECT 1 FROM public.groups WHERE id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
  )
  AND (
    SELECT status = 'left'
    FROM public.group_members
    WHERE group_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
      AND user_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  ),
  'group row kept after sole member leaves'
);

SELECT * FROM finish();
ROLLBACK;
