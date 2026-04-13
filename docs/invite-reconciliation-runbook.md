# Invite Reconciliation Runbook

This runbook covers detection, response, and recovery for invite auto-accept regressions.

## Monitoring Queries

### Primary metric view

```sql
SELECT *
FROM public.invitation_reconciliation_metrics;
```

Fields:
- `pending_for_existing_users`
- `failed_events_last_24h`
- `accepted_events_last_24h`
- `generated_at`

### Audit drill-down

```sql
SELECT source, outcome, user_id, email, invitation_id, group_id, error_code, error_message, created_at
FROM public.invitation_reconciliation_audit
ORDER BY created_at DESC
LIMIT 200;
```

## Alert Thresholds

- **P1:** `pending_for_existing_users > 0` for 15+ minutes.
- **P1:** `failed_events_last_24h > 0` and increasing across two checks.
- **P2:** sudden drop to zero in `accepted_events_last_24h` during normal invite traffic.

## Escalation

1. On-call engineer investigates with audit drill-down query.
2. If impacted users are identified, perform one-user recovery SQL below.
3. Trigger scheduled auto-heal workflow if pending backlog exists.
4. If failures persist, page backend owner and investigate latest auth/invitation changes.

## One-User Emergency Recovery

Replace placeholders with the target user/group/invitation ids.

```sql
BEGIN;

SELECT public.sync_participant_state(
  'GROUP_UUID'::uuid,
  'USER_UUID'::uuid,
  'USER_EMAIL',
  'member',
  'member'
);

INSERT INTO public.group_members (group_id, user_id, role, status, left_at)
VALUES ('GROUP_UUID'::uuid, 'USER_UUID'::uuid, 'member', 'active', NULL)
ON CONFLICT (group_id, user_id)
DO UPDATE SET
  role = CASE
    WHEN public.group_members.role = 'owner' THEN public.group_members.role
    ELSE EXCLUDED.role
  END,
  status = 'active',
  left_at = NULL;

UPDATE public.group_invitations
SET status = 'accepted', accepted_at = CURRENT_TIMESTAMP
WHERE id = 'INVITATION_UUID'::uuid
  AND status = 'pending';

COMMIT;
```

## Post-Recovery Verification Checklist

- `group_members` row exists for `(group_id, user_id)` and `status='active'`.
- `group_invitations.status='accepted'` for the recovered invitation.
- participant row has `type='member'` and `user_id` linked.
- user can see the expected group in app UI after refresh/sign-in.

## Scheduled Auto-Heal

Workflow: `.github/workflows/invite-reconciliation-auto-heal.yml`

- Runs hourly and on manual dispatch.
- Executes `supabase/tests/invite-reconciliation/sql/auto_heal_existing_users.sql`.
- Fails if `pending_for_existing_users` remains above zero after reconciliation.

If auto-heal fails:
1. Re-run manually via workflow dispatch.
2. Inspect failure logs and audit table.
3. Run one-user emergency recovery for critical users.
