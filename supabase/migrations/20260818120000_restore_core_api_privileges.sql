-- Make the table privileges required by the existing RLS policies explicit.
-- Supabase environments do not guarantee that API-role default privileges are
-- retroactively applied to tables created by later migrations.

REVOKE ALL ON TABLE
  public.groups,
  public.group_members,
  public.group_invitations,
  public.participants,
  public.transactions,
  public.transaction_splits,
  public.settlements,
  public.transaction_history,
  public.transaction_history_archive
FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.groups,
  public.group_members,
  public.group_invitations,
  public.participants,
  public.transactions,
  public.transaction_splits,
  public.settlements
TO authenticated;

GRANT SELECT ON TABLE
  public.transaction_history,
  public.transaction_history_archive
TO authenticated;

GRANT ALL ON TABLE
  public.groups,
  public.group_members,
  public.group_invitations,
  public.participants,
  public.transactions,
  public.transaction_splits,
  public.settlements,
  public.transaction_history,
  public.transaction_history_archive
TO service_role;
