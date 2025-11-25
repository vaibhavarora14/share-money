# How to Test the Validation Script

## Quick Start

Run the validation script:
```bash
.github/workflows/validate-workflow.sh
```

## Detailed Testing Guide

### 1. Basic Test

**Run the script:**
```bash
cd /workspace
.github/workflows/validate-workflow.sh
```

**Expected output:**
- ✅ All checks should pass
- Green checkmarks for each validation step
- Summary showing "All checks passed!"

### 2. Test Individual Components

#### Test Version Script Works
```bash
cd mobile
node scripts/version.js show
```

**Expected:** Shows current version and build number

#### Test Dry-Run Mode
```bash
cd mobile
node scripts/version.js build --dry-run
```

**Expected:** Shows what would change without modifying files

#### Test Version Increment (Dry-Run)
```bash
cd mobile
node scripts/version.js patch --dry-run
```

**Expected:** Shows version would increment (1.0.0 → 1.0.1)

### 3. Test Validation Script with Errors

#### Simulate Missing version.json
```bash
# Backup the file
mv mobile/version.json mobile/version.json.backup

# Run validation
.github/workflows/validate-workflow.sh

# Restore the file
mv mobile/version.json.backup mobile/version.json
```

**Expected:** Script should detect missing file and show error

#### Simulate Invalid version.json
```bash
# Backup original
cp mobile/version.json mobile/version.json.backup

# Create invalid version
echo '{"version": "invalid", "buildNumber": -1}' > mobile/version.json

# Run validation
.github/workflows/validate-workflow.sh

# Restore original
mv mobile/version.json.backup mobile/version.json
```

**Expected:** Script should detect invalid structure/format

#### Simulate Missing npm Script
```bash
# Backup package.json
cp mobile/package.json mobile/package.json.backup

# Remove version:build script (temporarily)
# Edit package.json to remove the script

# Run validation
.github/workflows/validate-workflow.sh

# Restore
mv mobile/package.json.backup mobile/package.json
```

**Expected:** Script should detect missing script

### 4. Test Workflow File Validation

#### Test with Invalid YAML
```bash
# Backup workflow file
cp .github/workflows/auto-increment-build.yml .github/workflows/auto-increment-build.yml.backup

# Create invalid YAML (missing colon)
echo "name: Auto Increment" > .github/workflows/auto-increment-build.yml
echo "on:" >> .github/workflows/auto-increment-build.yml
echo "  push" >> .github/workflows/auto-increment-build.yml  # Missing colon after push

# Run validation
.github/workflows/validate-workflow.sh

# Restore
mv .github/workflows/auto-increment-build.yml.backup .github/workflows/auto-increment-build.yml
```

**Expected:** YAML validation should fail or show warning

### 5. Test Workflow Logic Simulation

The script simulates what the workflow would do:

```bash
.github/workflows/validate-workflow.sh
```

Look for section "9. Simulating workflow logic":
- Shows current version
- Shows current build
- Validates format
- Tests increment (dry-run)

### 6. Manual Workflow Testing (Recommended Before Merge)

#### Option A: Test on a Feature Branch

```bash
# Create test branch
git checkout -b test/workflow-validation

# Make a small change
echo "# Workflow test" >> README.md
git add README.md
git commit -m "test: validate workflow"

# Push to trigger workflow (if workflow is set to run on all branches for testing)
git push origin test/workflow-validation

# Check GitHub Actions tab to see if workflow runs
```

**Note:** Current workflow only runs on `main`, so you'd need to temporarily modify it for testing.

#### Option B: Temporarily Modify Workflow for Testing

```bash
# Edit .github/workflows/auto-increment-build.yml
# Change:
#   branches:
#     - main
# To:
#   branches:
#     - main
#     - test/**
```

Then test on a branch, then revert the change.

#### Option C: Use GitHub CLI to Test

```bash
# Install GitHub CLI if not installed
# gh workflow run "Auto Increment Build Number" --ref test/workflow-validation
```

### 7. Test All Validation Checks

Run through each check manually:

```bash
# 1. Check workflow file exists
ls -la .github/workflows/auto-increment-build.yml

# 2. Validate YAML
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/auto-increment-build.yml'))"

# 3. Check required files
ls -la mobile/version.json
ls -la mobile/scripts/version.js
ls -la mobile/package.json

# 4. Check npm script
grep "version:build" mobile/package.json

# 5. Test version script
cd mobile && node scripts/version.js show

# 6. Test dry-run
cd mobile && node scripts/version.js build --dry-run

# 7. Check workflow triggers
grep -A 2 "branches:" .github/workflows/auto-increment-build.yml

# 8. Check permissions
grep "contents: write" .github/workflows/auto-increment-build.yml

# 9. Check skip logic
grep "\[skip ci\]" .github/workflows/auto-increment-build.yml

# 10. Check retry logic
grep "MAX_RETRIES" .github/workflows/auto-increment-build.yml
```

### 8. Test Edge Cases

#### Test with Different Version Formats
```bash
cd mobile

# Test valid version
node -e "const v = require('./version.json'); console.log('Version:', v.version)"

# Test version validation
node scripts/version.js show
```

#### Test Build Number Edge Cases
```bash
cd mobile

# Current build number
node -p "require('./version.json').buildNumber"

# Test increment
node scripts/version.js build --dry-run
```

### 9. Continuous Validation

Add to your development workflow:

```bash
# Add to package.json scripts
"validate:workflow": ".github/workflows/validate-workflow.sh"

# Run before commits
npm run validate:workflow
```

Or add as a git hook:

```bash
# .git/hooks/pre-commit
#!/bin/bash
.github/workflows/validate-workflow.sh
```

### 10. CI/CD Integration

You could also add validation to CI/CD:

```yaml
# .github/workflows/validate.yml
name: Validate Workflow
on: [pull_request]
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Validate workflow
        run: .github/workflows/validate-workflow.sh
```

## Expected Output Examples

### ✅ Success Case
```
🔍 Validating GitHub Workflow...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Checking workflow file exists...
✓ Workflow file exists

2. Validating YAML syntax...
✓ YAML syntax is valid (python)

3. Checking required files...
✓ mobile/version.json exists
✓ version.json structure is valid
✓ mobile/scripts/version.js exists
✓ mobile/package.json exists

4. Checking npm scripts...
✓ version:build script exists

5. Testing version script...
✓ Version script runs successfully
✓ Dry-run mode works

6. Checking workflow triggers...
✓ Workflow triggers on main branch
✓ paths-ignore configured (prevents loops)

7. Checking workflow permissions...
✓ Write permissions configured

8. Checking for common issues...
✓ Skip CI logic present
✓ Retry logic present
✓ Validation logic present

9. Simulating workflow logic...
  Current version: 1.0.0
  Current build: 1
  ✓ Version format is valid
  ✓ Build number is valid (>= 1)
  Testing build increment (dry-run)...
  ✓ Build increment would work (would be: 2)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Validation Summary:

✅ All checks passed! Workflow should work correctly.
```

### ❌ Error Case
```
Validation Summary:

❌ Validation failed with 1 error(s) and 0 warning(s)
Please fix the errors before pushing to main.
```

## Troubleshooting

### Script Not Executable
```bash
chmod +x .github/workflows/validate-workflow.sh
```

### Python YAML Module Missing
```bash
pip3 install pyyaml
```

### Node.js Not Found
```bash
# Ensure Node.js is installed
node --version
```

### Version Script Fails
```bash
cd mobile
node scripts/version.js show
# Check for errors
```

## Quick Test Checklist

- [ ] Run validation script: `.github/workflows/validate-workflow.sh`
- [ ] All checks pass (green checkmarks)
- [ ] Test version script: `cd mobile && node scripts/version.js show`
- [ ] Test dry-run: `cd mobile && node scripts/version.js build --dry-run`
- [ ] Verify workflow file exists: `ls .github/workflows/auto-increment-build.yml`
- [ ] Check YAML syntax: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/auto-increment-build.yml'))"`

## Next Steps After Validation

1. ✅ All checks pass → Ready to merge
2. ❌ Errors found → Fix issues, then re-run validation
3. ⚠️ Warnings → Review warnings, fix if needed

Once validation passes, the workflow is ready to use on the `main` branch!
