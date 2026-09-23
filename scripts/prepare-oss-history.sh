#!/usr/bin/env bash
# ==============================================================================
# prepare-oss-history.sh
# 
# Prepares the git repository for public Open Source Software (OSS) release by:
# 1. Auditing git history for personal email addresses and PII.
# 2. Creating a complete git bundle backup of all refs.
# 3. Running git-filter-repo to rewrite author metadata and replace sensitive
#    email strings across all historical commit diffs.
# ==============================================================================

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
BACKUP_BUNDLE="${REPO_ROOT}/sharedmoney-pre-oss-backup.bundle"
TEMP_DIR="$(mktemp -d /tmp/sm-oss-filter.XXXXXX)"
trap 'rm -rf "${TEMP_DIR}"' EXIT

MAILMAP_FILE="${TEMP_DIR}/mailmap"
REPLACEMENTS_FILE="${TEMP_DIR}/replacements.txt"

TARGET_EMAILS=(
  "contact@sharedmoney.app"
  "alex.doe@example.com"
  "repair-target@example.com"
  "peter.yillen@example.com"
)

function print_header() {
  echo "======================================================================"
  echo "  SharedMoney OSS Git History Preparation Tool"
  echo "======================================================================"
}

function check_history() {
  echo ""
  echo "🔍 Scanning git history for personal emails..."
  local found_count=0

  for email in "${TARGET_EMAILS[@]}"; do
    echo -n "  Checking for '${email}' in commit messages & diffs... "
    local match_count
    match_count=$(git log --all -S "${email}" --oneline 2>/dev/null | wc -l | tr -d ' ')
    local author_count
    author_count=$(git log --all --author="${email}" --oneline 2>/dev/null | wc -l | tr -d ' ')

    if [ "$match_count" -gt 0 ] || [ "$author_count" -gt 0 ]; then
      echo "FOUND (${author_count} author commits, ${match_count} content diff commits)"
      found_count=$((found_count + match_count + author_count))
    else
      echo "CLEAN (0 matches)"
    fi
  done

  echo ""
  if [ "$found_count" -eq 0 ]; then
    echo "✅ No target personal emails found in git history!"
  else
    echo "⚠️  Found personal email occurrences in git history."
    echo "   Run './scripts/prepare-oss-history.sh rewrite' to sanitize history."
  fi
}

function create_backup() {
  echo ""
  echo "📦 Creating full repository backup bundle..."
  echo "   Destination: ${BACKUP_BUNDLE}"
  git bundle create "${BACKUP_BUNDLE}" --all
  echo "✅ Backup successfully created at: ${BACKUP_BUNDLE}"
  echo "   (To restore if ever needed: git clone ${BACKUP_BUNDLE} restored-repo)"
}

function run_rewrite() {
  print_header

  # Ensure git-filter-repo is installed
  if ! command -v git-filter-repo >/dev/null 2>&1 && ! python3 -m git_filter_repo --version >/dev/null 2>&1; then
    echo "❌ git-filter-repo is required but not installed."
    echo ""
    echo "To install it, run:"
    echo "   pip3 install git-filter-repo"
    echo "   or"
    echo "   brew install git-filter-repo"
    exit 1
  fi

  # Check if inside a secondary worktree
  local is_worktree
  is_worktree=$(git rev-parse --is-inside-work-tree 2>/dev/null || true)
  local git_dir
  git_dir=$(git rev-parse --git-dir)
  if [[ "$git_dir" == *".git/worktrees/"* ]]; then
    echo "⚠️  You are currently in a secondary git worktree (${git_dir})."
    echo "   git-filter-repo must be run inside a dedicated clone or primary repo root."
    echo ""
    echo "Recommended execution in a fresh dedicated clone:"
    echo "   git clone ${REPO_ROOT} /tmp/share-money-oss-clean"
    echo "   cd /tmp/share-money-oss-clean"
    echo "   ./scripts/prepare-oss-history.sh rewrite"
    exit 1
  fi

  # Auto backup
  if [ ! -f "${BACKUP_BUNDLE}" ]; then
    create_backup
  else
    echo "ℹ️ Existing backup bundle found at: ${BACKUP_BUNDLE}"
  fi

  echo ""
  echo "✍️  Preparing mailmap & text replacement configurations..."

  cat << 'EOF' > "${MAILMAP_FILE}"
Vaibhav Arora <contact@sharedmoney.app> <contact@sharedmoney.app>
Vaibhav Arora <contact@sharedmoney.app> <vaibhav@example.com>
EOF

  cat << 'EOF' > "${REPLACEMENTS_FILE}"
contact@sharedmoney.app==>contact@sharedmoney.app
alex.doe@example.com==>alex.doe@example.com
repair-target@example.com==>repair-target@example.com
peter.yillen@example.com==>peter.yillen@example.com
EOF

  echo "🚀 Running git-filter-repo..."
  if command -v git-filter-repo >/dev/null 2>&1; then
    git-filter-repo \
      --mailmap "${MAILMAP_FILE}" \
      --replace-text "${REPLACEMENTS_FILE}" \
      --force
  else
    python3 -m git_filter_repo \
      --mailmap "${MAILMAP_FILE}" \
      --replace-text "${REPLACEMENTS_FILE}" \
      --force
  fi

  echo ""
  echo "🔍 Verifying rewritten history..."
  check_history

  echo ""
  echo "🎉 Git history successfully sanitized!"
  echo "   All commits have been rewritten with new SHAs."
  echo "   To update GitHub, run:"
  echo "     git remote add origin <repo-url> (if needed)"
  echo "     git push --force --all"
  echo "     git push --force --tags"
}

# Command dispatch
ACTION="${1:-check}"

case "$ACTION" in
  check)
    print_header
    check_history
    ;;
  backup)
    print_header
    create_backup
    ;;
  rewrite)
    run_rewrite
    ;;
  *)
    echo "Usage: $0 {check|backup|rewrite}"
    exit 1
    ;;
esac
