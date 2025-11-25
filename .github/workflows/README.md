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
