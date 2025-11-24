# Version Management Alternatives

## Overview

This document outlines alternative approaches to version management that could have been used instead of our current implementation. Each approach has different trade-offs.

## 1. Version Storage Strategies

### Current Approach: Single JSON File ✅
**What we did:**
- `mobile/version.json` as single source of truth
- Read by `app.config.js` at build time
- Manual version bumps + CI/CD auto-increment

**Pros:**
- Simple and explicit
- Easy to read/modify
- Works offline
- Version visible in git history

**Cons:**
- Manual sync risk (mitigated by automation)
- File can be corrupted (mitigated by validation)

### Alternative 1: Git Tags Only
**How it works:**
- Version stored only in git tags (`v1.0.0`)
- Build number from commit count or timestamp
- No version.json file

**Example:**
```bash
# Get version from latest tag
VERSION=$(git describe --tags --abbrev=0 | sed 's/v//')
BUILD=$(git rev-list --count HEAD)
```

**Pros:**
- Single source of truth (git)
- No file to manage
- Version history in git

**Cons:warning: **Cons:**
- Requires git to be available at build time
- Harder to preview version before tagging
- Can't easily test version changes
- Expo builds might not have git context

**Tools:** `git describe`, `git rev-list`

---

### Alternative 2: Environment Variables
**How it works:**
- Version in `.env` or CI/CD environment
- Injected at build time

**Example:**
```bash
# .env
APP_VERSION=1.0.0
BUILD_NUMBER=42

# app.config.js
version: process.env.APP_VERSION || '1.0.0'
```

**Pros:**
- Easy to override per environment
- No file to commit
- Works well with CI/CD

:warning: **Cons:**
- Easy to forget to update
- Not visible in git history
- Requires environment setup
- Harder to track changes

**Tools:** `dotenv`, CI/CD env vars

---

### Alternative 3: Package.json Only
**How it works:**
- Version only in `package.json`
- Build number derived or separate

**Example:**
```json
{
  "version": "1.0.0",
  "buildNumber": 1
}
```

**Pros:**
- Standard npm approach
- Single file
- Works with npm versioning tools

:warning: **Cons:**
- Mixes dependency versioning with app versioning
- Less explicit for mobile apps
- Build number needs separate handling

**Tools:** `npm version`, `standard-version`

---

### Alternative 4: Separate Files (Version + Build)
**How it works:**
- `VERSION` file (just version string)
- `BUILD` file (just build number)
- Or `.versionrc.json` config

**Example:**
```
# VERSION
1.0.0

# BUILD
42
```

**Pros:**
- Very simple
- Easy to parse
- Can be updated independently

:warning: **Cons:**
- Two files to manage
- More complex sync logic
- Less structured

---

## 2. Version Bumping Strategies

### Current Approach: Custom Script ✅
**What we did:**
- Custom Node.js script (`scripts/version.js`)
- Manual commands: `npm run version:patch`
- CI/CD auto-increments build

**Pros:**
- Full control
- Custom validation
- Integrated with our workflow

**Cons:**
- Maintenance burden
- Need to write tests
- Custom logic

---

### Alternative 1: npm version
**How it works:**
```bash
npm version patch   # 1.0.0 → 1.0.1
npm version minor   # 1.0.0 → 1.1.0
npm version major   # 1.0.0 → 2.0.0
```

**Pros:**
- Built into npm
- Creates git tags automatically
- Standard tooling

:warning: **Cons:**
- Only handles version, not build number
- Less control over format
- Doesn't sync with app.config.js
- Can't easily add custom validation

**Usage:**
```bash
npm version patch --no-git-tag-version
# Then manually update app.config.js
```

---

### Alternative 2: standard-version
**How it works:**
```bash
npx standard-version
# Automatically bumps version based on conventional commits
```

**Pros:**
- Automatic version bumping from commit messages
- Generates CHANGELOG.md
- Creates git tags
- Follows semantic versioning

**Example commits:**
```
feat: add new feature     → minor bump
fix: bug fix             → patch bump
BREAKING CHANGE: ...      → major bump
```

:warning: **Cons:**
- Requires conventional commits
- More opinionated
- Still need custom logic for build numbers
- Need to configure for Expo

**Setup:**
```json
// .versionrc.json
{
  "types": [
    { "type": "feat", "section": "Features" },
    { "type": "fix", "section": "Bug Fixes" }
  ]
}
```

---

### Alternative 3: semantic-release
**How it works:**
- Fully automated versioning
- Analyzes commits
- Publishes releases
- Updates changelog

**Pros:**
- Fully automated
- No manual version bumps
- Integrates with CI/CD
- Handles releases

:warning: **Cons:**
- Very opinionated
- Complex setup
- Requires conventional commits
- Might be overkill for mobile apps

**Example:**
```yaml
# .github/workflows/release.yml
- uses: semantic-release/semantic-release@v20
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

---

### Alternative 4: Changesets
**How it works:**
- Developers write change files
- Tool aggregates changes
- Bumps version accordingly

**Example:**
```
# .changeset/cool-feature.md
---
"mobile": minor
---

Added cool new feature
```

**Pros:**
- Collaborative versioning
- Clear change tracking
- Good for monorepos

:warning: **Cons:**
- More workflow overhead
- Requires team discipline
- Might be overkill for small teams

---

## 3. Build Number Strategies

### Current Approach: Auto-increment on Push ✅
**What we did:**
- CI/CD increments on every push to main
- Stored in version.json
- Always increments

**Pros:**
- Automatic
- Never conflicts
- Always unique

**Cons:**
- Can skip numbers if commits are skipped
- Requires CI/CD

---

### Alternative 1: Timestamp-Based
**How it works:**
```javascript
const buildNumber = Math.floor(Date.now() / 1000);
// 1704067200 (Unix timestamp)
```

**Pros:**
- Always unique
- No sync needed
- No file to update

:warning: **Cons:**
- Not sequential (harder to compare)
- Large numbers
- Not human-friendly
- iOS/Android might have limits

---

### Alternative 2: Commit Count
**How it works:**
```bash
BUILD=$(git rev-list --count HEAD)
# Or: git rev-list --count $(git describe --tags --abbrev=0)..HEAD
```

**Pros:**
- Automatic
- No file needed
- Sequential

:warning: **Cons:**
- Requires git at build time
- Can change if history rewritten
- Different counts in different branches

---

### Alternative 3: Date-Based (YYYYMMDDHH)
**How it works:**
```javascript
const buildNumber = parseInt(
  new Date().toISOString()
    .replace(/[-:T]/g, '')
    .replace(/\..+/, '')
    .slice(0, 10)
);
// 2024010112 (2024-01-01 12:00)
```

**Pros:**
- Human-readable
- Sortable
- No sync needed

:warning: **Cons:**
- Can't have multiple builds per hour
- Not sequential
- Format limitations

---

### Alternative 4: Hash-Based
**How it works:**
```bash
BUILD=$(git rev-parse --short HEAD | cut -c1-7)
# Or: Convert commit hash to number
```

**Pros:**
- Unique per commit
- No sync needed

:warning: **Cons:**
- Not sequential
- Not numeric (if using hex)
- Hard to compare versions

---

## 4. CI/CD Integration Strategies

### Current Approach: GitHub Actions ✅
**What we did:**
- GitHub Actions workflow
- Runs on push to main
- Commits back to repo

**Pros:**
- Integrated with GitHub
- Free for public repos
- Good documentation
- Flexible

**Cons:**
- GitHub-specific
- Requires write permissions
- Can create commit noise

---

### Alternative 1: GitLab CI
**How it works:**
```yaml
# .gitlab-ci.yml
version_bump:
  script:
    - npm run version:build
    - git commit -m "ci: bump version"
    - git push
```

**Pros:**
- Similar to GitHub Actions
- Good for GitLab repos

**Cons:**
- GitLab-specific
- Different syntax

---

### Alternative 2: Pre-commit Hooks
**How it works:**
```bash
# .git/hooks/pre-commit
#!/bin/bash
cd mobile
npm run version:build
git add version.json
```

**Pros:**
- Runs locally
- No CI/CD needed
- Immediate feedback

:warning: **Cons:**
- Only works if everyone uses it
- Can be bypassed
- Slows down commits
- Doesn't work for all workflows

---

### Alternative 3: EAS Build Hooks
**How it works:**
```json
// eas.json
{
  "build": {
    "production": {
      "env": {
        "BUILD_NUMBER": "$(date +%s)"
      }
    }
  }
}
```

**Pros:**
- Integrated with Expo
- No separate CI/CD
- Works with EAS

:warning: **Cons:**
- Expo-specific
- Less flexible
- Harder to sync with git

---

## 5. Industry Tools Comparison

### Version Management Tools

| Tool | Type | Best For | Complexity |
|------|------|----------|------------|
| **npm version** | CLI | Simple projects | Low |
| **standard-version** | CLI | Conventional commits | Medium |
| **semantic-release** | CI/CD | Automated releases | High |
| **changesets** | Workflow | Monorepos, teams | Medium |
| **Custom Script** ✅ | Script | Full control | Medium |
| **lerna** | Tool | Monorepos | High |
| **rush** | Tool | Large monorepos | Very High |

### Build Number Tools

| Approach | Pros | Cons |
|----------|------|------|
| **Auto-increment** ✅ | Simple, sequential | Requires CI/CD |
| **Git commit count** | Automatic | Requires git |
| **Timestamp** | Unique, no sync | Not sequential |
| **Date-based** | Human-readable | Format limits |
| **Hash-based** | Unique | Not numeric |

## 6. Recommended Alternatives by Use Case

### Small Project / Solo Developer
```bash
# Use npm version + manual build numbers
npm version patch
# Manually update build number in app.config.js
```

### Team with Conventional Commits
```bash
# Use standard-version
npx standard-version
# Custom script for build numbers
```

### Fully Automated CI/CD
```yaml
# Use semantic-release
- uses: semantic-release/semantic-release@v20
```

### Monorepo
```bash
# Use changesets or lerna
npx changeset version
```

### Maximum Control (Current) ✅
```bash
# Custom script with full validation
npm run version:patch
# CI/CD auto-increments build
```

## 7. Why We Chose Current Approach

**Reasons:**
1. ✅ **Full Control**: Custom validation and error handling
2. ✅ **Mobile-Specific**: Handles iOS/Android build numbers correctly
3. ✅ **Expo Integration**: Works seamlessly with Expo config
4. ✅ **Flexibility**: Easy to extend and customize
5. ✅ **Reliability**: Atomic writes, validation, retry logic
6. ✅ **Simplicity**: Single JSON file, clear workflow
7. ✅ **CI/CD Integration**: Automated build increments

**Trade-offs:**
- More code to maintain (but well-tested)
- Custom solution (but documented)
- Manual version bumps (but with automation for builds)

## 8. Migration Paths

### If We Wanted to Switch to standard-version:
```bash
# 1. Install
npm install --save-dev standard-version

# 2. Configure
echo '{"types": [...]}' > .versionrc.json

# 3. Update scripts
"version": "standard-version"

# 4. Keep build number script separate
# 5. Update CI/CD to call both
```

### If We Wanted Git Tags Only:
```bash
# 1. Remove version.json
# 2. Update app.config.js to read from git
# 3. Use git describe for version
# 4. Use git rev-list for build number
```

## Summary

Our current approach balances:
- ✅ **Simplicity** (single JSON file)
- ✅ **Control** (custom validation)
- ✅ **Automation** (CI/CD integration)
- ✅ **Reliability** (error handling, atomic writes)
- ✅ **Mobile-Specific** (iOS/Android support)

**Alternative approaches** are better suited for:
- **npm version**: Simple web projects
- **standard-version**: Teams using conventional commits
- **semantic-release**: Fully automated workflows
- **Git tags**: Git-centric workflows
- **Environment variables**: Multi-environment setups

Our choice fits our needs: mobile app with Expo, need for build numbers, and desire for control and reliability.
