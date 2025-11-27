# GitHub Actions Workflows

## Auto Increment Build Number

**File**: `.github/workflows/auto-increment-build.yml`

### Purpose

Automatically increments the build number in `mobile/version.json` whenever code is pushed to the `main` branch.

### How It Works

1. **Triggers**: Runs on pushes to `main` branch
2. **Skips**: Automatically skips if:
   - `version.json` was manually updated in the commit
   - Commit message contains `[skip ci]` or `[skip build]`
   - Only workflow files changed
3. **Action**: Increments build number and commits back to `main`
4. **Commit**: Creates a commit with message `ci: auto-increment build number to X [skip ci]`

### Usage

**Automatic (Default)**:
- Just push to `main` - build number increments automatically
- No action needed

**Skip Auto-Increment**:
- Add `[skip ci]` or `[skip build]` to your commit message
- Example: `git commit -m "fix: bug fix [skip ci]"`

**Manual Version Bump**:
- Use `npm run version:patch/minor/major` - this increments both version AND build number
- CI/CD will detect the manual change and skip auto-increment

### Example Workflow

```bash
# Make changes
git add .
git commit -m "feat: add new feature"
git push origin main

# CI/CD automatically:
# 1. Detects push to main
# 2. Increments build number (1 → 2)
# 3. Commits: "ci: auto-increment build number to 2 [skip ci]"
# 4. Pushes back to main
```

### Notes

- Build numbers always increment (never decrease)
- Version stays the same unless manually bumped
- The auto-increment commit includes `[skip ci]` to prevent infinite loops
- Works seamlessly with manual version bumps

---

## Deploy Supabase Edge Functions

**File**: `.github/workflows/deploy-edge-functions.yml`

### Purpose

Automatically deploys all Supabase Edge Functions to production whenever Edge Function code is pushed to the `main` branch.

### How It Works

1. **Triggers**: 
   - Runs on pushes to `main` branch when files in `supabase/functions/` change
   - Can be manually triggered via GitHub Actions UI
2. **Setup**: Installs Supabase CLI and links to your project
3. **Deploy**: Deploys all Edge Functions using `supabase functions deploy`
4. **Verify**: Lists deployed functions and provides deployment summary

### Setup Instructions

1. **Get Supabase Access Token**:
   - Go to https://supabase.com/dashboard/account/tokens
   - Click "Generate new token"
   - Copy the token (you won't see it again!)

2. **Get Project ID**:
   - Go to your Supabase project dashboard
   - Navigate to Settings > General
   - Copy your "Reference ID" (this is your Project ID)

3. **Configure GitHub Secrets**:
   - Go to your GitHub repository
   - Navigate to Settings > Secrets and variables > Actions
   - Click "New repository secret"
   - Add the following secrets:
     - `SUPABASE_ACCESS_TOKEN` - Your Supabase access token
     - `SUPABASE_PROJECT_ID` - Your Supabase project reference ID

### Usage

**Automatic (Default)**:
- Push changes to `supabase/functions/` directory
- Merge PR to `main` branch
- Functions are automatically deployed

**Manual Trigger**:
- Go to Actions tab in GitHub
- Select "Deploy Supabase Edge Functions" workflow
- Click "Run workflow"

### Deployed Functions

The workflow deploys all functions in `supabase/functions/`:
- `activity` - Activity feed endpoint
- `balances` - User balances endpoint
- `group-members` - Group member management
- `groups` - Group management
- `invitations` - Group invitations
- `settlements` - Settlement management
- `transactions` - Transaction management

### Notes

- Functions are deployed globally via Supabase's CDN
- Free tier supports up to 25 Edge Functions per project
- Free tier includes 500,000 invocations per month
- Deployment typically takes 1-2 minutes
- All functions are deployed in a single operation
