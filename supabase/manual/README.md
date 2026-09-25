# Manual Supabase SQL (not applied by `db push`)

Scripts in this directory are **not** part of `supabase/migrations/` and are
**not** run by `supabase db push` / GitHub Actions.

Use them when the CI/deploy login role lacks privileges that a Dashboard owner
role has (for example, ownership of `realtime.*` tables).

| File | Purpose |
| --- | --- |
| [`realtime_messages_group_sync_rls.sql`](./realtime_messages_group_sync_rls.sql) | RLS on `realtime.messages` so only active group members can receive private `group-sync:<groupId>` broadcasts |

## Private Realtime channels checklist

1. Apply the auto migration (`20260925000000_enable_realtime_and_indexes.sql`) via normal `db push` — indexes, publication, `REPLICA IDENTITY FULL`.
2. Run `realtime_messages_group_sync_rls.sql` in the **SQL Editor** as a privileged role.
3. Confirm Realtime Authorization is enabled in the project (Dashboard → Realtime settings).
4. App already uses `private: true` on the client channel and edge REST broadcasts.
