# Simplified Versioning Plan - App Versioning Only

## Why No API Versioning?

Since we control both the mobile app and backend API:
- ✅ We can update both together
- ✅ No external API consumers
- ✅ No need for backward compatibility layers
- ✅ Simpler codebase

**API versioning is only needed when:**
- Multiple clients use the API (web, mobile, third-party)
- You can't control all clients
- You need to support old clients while deploying breaking changes

**We don't have these constraints**, so API versioning adds unnecessary complexity.

## What We Actually Need

### 1. App Versioning (Required)
- **For App Stores**: iOS and Android require version numbers
- **For Updates**: Expo Updates uses version for runtime versioning
- **For Tracking**: Know which app versions users have
- **For Support**: Help users with version-specific issues

### 2. Build Numbers (Required)
- **For App Stores**: Each submission needs a unique build number
- **For Testing**: Track which build is being tested
- **For Debugging**: Identify specific builds with issues

### 3. Version Display (Nice to Have)
- **For Users**: Show version in Settings/About screen
- **For Support**: Users can report their version
- **For Debugging**: Quick access to version info

## Simplified Implementation

### Step 1: Centralized Version File

Create `mobile/version.json`:
```json
{
  "version": "1.0.0",
  "buildNumber": 1
}
```

### Step 2: Update app.config.js

Read version from `version.json`:
```javascript
const versionConfig = require('./version.json');

module.exports = ({ config }) => {
  return {
    ...config,
    expo: {
      ...config.expo,
      version: versionConfig.version,
      ios: {
        ...config.expo.ios,
        buildNumber: versionConfig.buildNumber.toString(),
      },
      android: {
        ...config.expo.android,
        versionCode: versionConfig.buildNumber,
      },
    },
  };
};
```

### Step 3: Version Management Scripts

Add to `mobile/package.json`:
```json
{
  "scripts": {
    "version:patch": "node scripts/version.js patch",
    "version:minor": "node scripts/version.js minor",
    "version:major": "node scripts/version.js major",
    "version:show": "node scripts/version.js show"
  }
}
```

### Step 4: Version Display (Optional)

Add to Settings/About screen:
```typescript
import Constants from 'expo-constants';

const AppVersion = () => {
  return (
    <Text>
      Version {Constants.expoConfig?.version} 
      (Build {Constants.expoConfig?.ios?.buildNumber || Constants.expoConfig?.android?.versionCode})
    </Text>
  );
};
```

## When Would We Need API Versioning?

Consider API versioning if:
1. **Web app added**: Different client with different update cycle
2. **Public API**: Third-party developers use your API
3. **Mobile apps split**: Separate iOS and Android teams with different release cycles
4. **Breaking changes needed**: Can't update all clients simultaneously

Until then, keep it simple! 🎯
