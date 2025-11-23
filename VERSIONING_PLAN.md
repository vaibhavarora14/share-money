# Versioning Plan for ShareMoney

## Overview

This document outlines a comprehensive versioning strategy for the ShareMoney application, covering mobile app versioning, API versioning, and version management workflows.

## Current State

- **Mobile App**: Version `1.0.0` (hardcoded in `app.json`, `app.config.js`, `package.json`)
- **Backend API**: No versioning currently implemented
- **Database**: Already versioned via Supabase migrations
- **Runtime Version**: Using `appVersion` policy for Expo updates

## Versioning Strategy

### 1. Semantic Versioning (SemVer)

We'll follow [Semantic Versioning 2.0.0](https://semver.org/) format: `MAJOR.MINOR.PATCH`

- **MAJOR**: Breaking changes (API changes, major UI overhauls)
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes, small improvements

**Examples:**
- `1.0.0` → `1.0.1` (bug fix)
- `1.0.1` → `1.1.0` (new feature)
- `1.1.0` → `2.0.0` (breaking change)

### 2. Version Components

#### 2.1 Mobile App Version
- **Version Code** (`version`): Semantic version string (e.g., `1.0.0`)
- **Build Number** (`buildNumber`): Incremental integer for each build
  - iOS: `CFBundleVersion`
  - Android: `versionCode`
- **Runtime Version**: Used by Expo Updates (currently `appVersion` policy)

#### 2.2 API Version
- **API Version**: Version string in API responses (e.g., `v1`)
- **API Compatibility**: Track minimum supported app version

#### 2.3 Database Version
- Already handled via Supabase migrations (timestamp-based)

## Implementation Plan

### Phase 1: Centralized Version Management

#### 1.1 Create Version Configuration File
**File**: `mobile/version.json`
```json
{
  "version": "1.0.0",
  "buildNumber": 1,
  "apiVersion": "v1",
  "minSupportedVersion": "1.0.0"
}
```

#### 1.2 Update Configuration Files
- Modify `app.config.js` to read from `version.json`
- Update `package.json` to sync with version file
- Ensure `app.json` stays in sync (fallback)

#### 1.3 Version Display in App
- Add version display in Settings/About screen
- Show: `Version 1.0.0 (Build 1)`
- Optionally show API version and build date

### Phase 2: API Versioning

#### 2.1 API Version Headers
- Add `X-API-Version` header to all API responses
- Add `X-Min-Client-Version` header for compatibility checks

#### 2.2 Version Endpoint
- Create `/api/version` endpoint returning:
  ```json
  {
    "apiVersion": "v1",
    "minSupportedAppVersion": "1.0.0",
    "latestAppVersion": "1.0.0"
  }
  ```

#### 2.3 Client-Side Version Check
- Check API version on app startup
- Warn user if app version is too old
- Handle API version mismatches gracefully

### Phase 3: Build Number Management

#### 3.1 Build Number Strategy
- **Development**: Auto-increment on each build
- **Preview**: Increment manually or via CI/CD
- **Production**: Increment on release

#### 3.2 Integration with EAS Build
- Use EAS build hooks to auto-increment build numbers
- Store build numbers in version file or environment

### Phase 4: Automation & Tooling

#### 4.1 Version Management Scripts
Create npm scripts:
- `npm run version:patch` - Increment patch version
- `npm run version:minor` - Increment minor version
- `npm run version:major` - Increment major version
- `npm run version:show` - Display current version

#### 4.2 CI/CD Integration
- Auto-increment build numbers in CI/CD
- Tag releases with version numbers
- Generate changelog from git tags

#### 4.3 Pre-release Checklist
- Update version in all files
- Update changelog
- Create git tag
- Build and test

## File Structure Changes

```
/workspace/
├── mobile/
│   ├── version.json          # NEW: Centralized version config
│   ├── app.config.js         # MODIFY: Read from version.json
│   ├── package.json          # MODIFY: Sync with version.json
│   ├── scripts/
│   │   └── version.js        # NEW: Version management script
│   └── screens/
│       └── AboutScreen.tsx   # NEW: Version display screen
├── netlify/
│   └── functions/
│       └── version.ts        # NEW: API version endpoint
└── scripts/
    └── version-sync.js       # NEW: Sync version across files
```

## Version Display Locations

### Mobile App
1. **Settings/About Screen** (primary)
   - App version: `1.0.0`
   - Build number: `1`
   - API version: `v1`
   - Build date: `2025-01-XX`

2. **Debug Menu** (development only)
   - Full version info
   - Runtime version
   - Update channel

### API Responses
- All API responses include `X-API-Version` header
- Version endpoint for compatibility checks

## Version Update Workflow

### For Patch Releases (Bug Fixes)
```bash
npm run version:patch
# Updates: 1.0.0 → 1.0.1
# Auto-increments build number
# Commits changes
```

### For Minor Releases (New Features)
```bash
npm run version:minor
# Updates: 1.0.1 → 1.1.0
# Resets patch to 0
# Auto-increments build number
# Commits changes
```

### For Major Releases (Breaking Changes)
```bash
npm run version:major
# Updates: 1.1.0 → 2.0.0
# Resets minor and patch to 0
# Auto-increments build number
# Commits changes
```

## Compatibility & Migration Strategy

### App Version Compatibility
- Track minimum supported app version in API
- Show upgrade prompt for outdated apps
- Support graceful degradation

### API Version Compatibility
- Maintain backward compatibility for at least 2 major versions
- Deprecation warnings before breaking changes
- Version negotiation on API calls

### Database Migrations
- Already handled via Supabase migrations
- No changes needed

## Testing Strategy

### Version Display Testing
- Verify version appears correctly in UI
- Test version display in different locales
- Verify build number increments

### API Version Testing
- Test version endpoint
- Test version header in responses
- Test compatibility checks

### Build Testing
- Verify version syncs across all files
- Test build number increments
- Verify EAS builds use correct version

## Documentation Updates

### Developer Documentation
- Version management guide
- Release process documentation
- Version bumping guidelines

### User Documentation
- How to check app version
- What version numbers mean
- Update process explanation

## Future Enhancements

### Phase 5 (Future)
1. **Changelog Generation**: Auto-generate from git commits
2. **Version History**: Track version changes over time
3. **Beta/Alpha Channels**: Separate versioning for pre-release
4. **Version Analytics**: Track app versions in use
5. **Auto-Update Prompts**: Smart update notifications

## Migration Checklist

- [ ] Create `version.json` file
- [ ] Update `app.config.js` to read from version file
- [ ] Create version management scripts
- [ ] Add version display in app UI
- [ ] Create API version endpoint
- [ ] Add version headers to API responses
- [ ] Implement client-side version checking
- [ ] Update CI/CD for version management
- [ ] Document versioning workflow
- [ ] Test version management scripts
- [ ] Test version display in app
- [ ] Test API versioning

## Notes

- Keep version files in sync automatically
- Use git tags for release tracking
- Consider using conventional commits for changelog generation
- Build numbers should always increment (never decrease)
- Version strings should be human-readable
