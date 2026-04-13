#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "Starting local Supabase stack..."
supabase start

echo "Running SQL regression checks..."
bash "${ROOT_DIR}/scripts/test-invite-regression-sql.sh"

while IFS= read -r line; do
  case "${line}" in
    [A-Z_]*=*)
      eval "export ${line}"
      ;;
  esac
done < <(supabase status -o env)

FUNCTIONS_ENV_FILE="/tmp/invite-reconcile-functions.env"
cat > "${FUNCTIONS_ENV_FILE}" <<EOF
SUPABASE_URL=${API_URL}
SUPABASE_ANON_KEY=${ANON_KEY}
SUPABASE_SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY}
ALLOWED_ORIGIN=*
EOF

echo "Starting local edge functions for API regression..."
supabase functions serve --env-file "${FUNCTIONS_ENV_FILE}" >/tmp/invite-reconcile-functions.log 2>&1 &
FUNCTIONS_PID=$!

cleanup() {
  if ps -p "${FUNCTIONS_PID}" >/dev/null 2>&1; then
    kill "${FUNCTIONS_PID}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

sleep 4

echo "Running API regression checks..."
node "${ROOT_DIR}/supabase/tests/invite-reconciliation/api/run-api-regression.mjs"

echo "Local invite reconciliation regression suite passed."
