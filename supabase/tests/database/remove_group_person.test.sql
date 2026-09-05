BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(1);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'participants'
      AND policyname = 'Users can delete unlinked participants in their groups'
      AND cmd = 'DELETE'
  ),
  'group members can delete unlinked people through RLS'
);

SELECT * FROM finish();
ROLLBACK;
