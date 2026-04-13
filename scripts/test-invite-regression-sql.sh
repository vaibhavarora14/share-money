#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SQL_DIR="${ROOT_DIR}/supabase/tests/invite-reconciliation/sql"

echo "Running invite reconciliation SQL regression suite..."

echo "Resetting local database (migrations + seed)..."
supabase db reset --local

supabase db query --local -f "${SQL_DIR}/00_setup.sql"
supabase db query --local -f "${SQL_DIR}/01_existing_user_reconcile.sql"
supabase db query --local -f "${SQL_DIR}/02_signup_auto_accept.sql"
supabase db query --local -f "${SQL_DIR}/03_idempotency_and_metrics.sql"

echo "Invite reconciliation SQL regression suite passed."
