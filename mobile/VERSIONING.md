# Version Management Guide

## Overview

ShareMoney uses a centralized version management system. The version is stored in `version.json` and automatically synced to `app.config.js` and `package.json`.

## Version Format

- **Version**: Semantic versioning (MAJOR.MINOR.PATCH)
  - Example: `1.0.0`
- **Build Number**: Incremental integer for each build
  - Example: `1`

## Quick Start

### View Current Version

```bash
npm run version:show
```

### Bump Version

```bash
# Patch release (bug fixes)
npm run version:patch    # 1.0.0 → 1.0.1

# Minor release (new features)
npm run version:minor     # 1.0.0 → 1.1.0

# Major release (breaking changes)
npm run version:major     # 1.0.0 → 2.0.0
```

## How It Works

1. **Version File**: `mobile/version.json` is the single source of truth
2. **Auto-Sync**: `app.config.js` reads from `version.json` automatically
3. **Build Numbers**: Automatically incremented when you bump version
4. **Package.json**: Version script also updates `package.json` for consistency

## Version Display in App

Use the `VersionDisplay` component to show version info:

```typescript
import { VersionDisplay } from './components/VersionDisplay';

// Default display
<VersionDisplay />

// Compact display
<VersionDisplay variant="compact" />

// With build date
<VersionDisplay showBuildDate />
```

## Release Workflow

### For Bug Fixes (Patch)
```bash
npm run version:patch
git add mobile/version.json mobile/package.json
git commit -m "chore: bump version to 1.0.1"
git tag v1.0.1
```

### For New Features (Minor)
```bash
npm run version:minor
git add mobile/version.json mobile/package.json
git commit -m "chore: bump version to 1.1.0"
git tag v1.1.0
```

### For Breaking Changes (Major)
```bash
npm run version:major
git add mobile/version.json mobile/package.json
git commit -m "chore: bump version to 2.0.0"
git tag v2.0.0
```

## Files Modified

When you run a version command, these files are updated:
- `mobile/version.json` - Version and build number
- `mobile/package.json` - Version (for consistency)

The `app.config.js` reads from `version.json` at build time, so no manual update needed.

## Build Numbers

- Build numbers always increment (never decrease)
- Each version bump increments the build number
- Used by iOS (`CFBundleVersion`) and Android (`versionCode`)
- Required for app store submissions

## Notes

- Version is synced automatically - don't edit manually
- Build numbers increment automatically
- Use semantic versioning (MAJOR.MINOR.PATCH)
- Tag releases with git tags for tracking
