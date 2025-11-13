# Updated PR Title and Description

## Title
```
Automate Supabase database migrations on merge to main
```

## Description
```markdown
## Problem

Currently, database migrations in `supabase/migrations/` need to be manually applied to production when changes are merged to the main branch. This creates a risk of:
- Forgetting to apply migrations
- Production database being out of sync with code
- Manual errors during migration execution

## Solution

Implemented automated database migration execution via GitHub Actions that runs when code is merged to the `main` branch.

## Changes

- ✅ Created GitHub Actions workflow (`.github/workflows/supabase-migrations.yml`)
  - Triggers automatically on push to `main` when migration files change
  - Supports manual triggering via workflow_dispatch
  - Validates required secrets before execution
  - Links to production Supabase project
  - Applies migrations using Supabase CLI
  - Provides clear success/failure reporting
  - Fails workflow on migration errors (blocks deployment if configured)

- ✅ Updated `TECH.md` with comprehensive documentation
  - Setup instructions for GitHub Secrets
  - Step-by-step configuration guide
  - Workflow operation details
  - Manual triggering instructions
  - Failure handling procedures
  - Security best practices

## Required GitHub Secrets

The workflow requires the following secrets to be configured:
- `SUPABASE_ACCESS_TOKEN` - Supabase access token from dashboard
- `SUPABASE_PROJECT_REF` - Project reference ID from Supabase settings
- `SUPABASE_DB_PASSWORD` - Database password from Supabase settings

## How It Works

1. When code is merged to `main` with new migration files, the workflow automatically triggers
2. Validates all required secrets are configured
3. Installs Supabase CLI and links to production project
4. Applies pending migrations using `supabase db push`
5. Reports success/failure status in GitHub Actions

## Testing

- Workflow can be manually triggered from the Actions tab
- All migration files are validated before execution
- Clear error messages displayed on failure

## Acceptance Criteria

- [x] Migrations are automatically applied when PRs are merged to main
- [x] Migration failures block deployment (workflow fails on error)
- [x] Migration status is visible in GitHub Actions
- [x] Process is documented in TECH.md
```
