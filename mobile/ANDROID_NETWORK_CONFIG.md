# Android Network Security Configuration

## Why This Exists

Release builds in Android block cleartext (HTTP) traffic by default for security. Since we use local Supabase and Netlify dev server with HTTP (`http://10.0.2.2:54321` and `http://10.0.2.2:8888`), we need to allow HTTP for localhost/emulator addresses.

## Files Created

1. **`android/app/src/main/res/xml/network_security_config.xml`**
   - Allows HTTP traffic for localhost, 127.0.0.1, and 10.0.2.2
   - Only affects local development - production HTTPS remains secure

2. **`android/app/src/main/AndroidManifest.xml`**
   - Added: `android:networkSecurityConfig="@xml/network_security_config"`
   - This references the network security config file

## Will These Files Be Removed?

### ✅ **They will be preserved** when:
- Running `expo run:android` (uses existing android folder)
- Running `npm run android:release:local` (uses existing android folder)
- Building with EAS (uses existing android folder if present)

### ⚠️ **They might be removed** when:
- Running `expo prebuild --clean` (regenerates android folder from scratch)
- Deleting the `android/` folder manually
- Running `npx expo prebuild` with `--clean` flag

### 📝 **Note:**
The `android/` folder is in `.gitignore`, so these files are **not committed to git**. If you:
- Clone the repo on a new machine
- Delete the android folder
- Run `expo prebuild --clean`

You'll need to recreate these files.

## How to Recreate (If Needed)

If the files are removed, recreate them:

### 1. Create network_security_config.xml:
```bash
mkdir -p mobile/android/app/src/main/res/xml
```

Create `mobile/android/app/src/main/res/xml/network_security_config.xml`:
```xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="true">localhost</domain>
        <domain includeSubdomains="true">127.0.0.1</domain>
        <domain includeSubdomains="true">10.0.2.2</domain>
    </domain-config>
</network-security-config>
```

### 2. Update AndroidManifest.xml:
Add to the `<application>` tag:
```xml
android:networkSecurityConfig="@xml/network_security_config"
```

## Making It Permanent (Optional)

If you want to ensure these files are always created, you can:

1. **Create an Expo config plugin** (advanced)
2. **Document it in your setup guide** (current approach)
3. **Commit the android folder** (not recommended - large, changes frequently)

## For Production Builds

When building for production with HTTPS URLs, you can:
- Remove the network security config (HTTPS works by default)
- Or keep it (it only allows HTTP for localhost, not production domains)

The config is safe to keep - it only affects localhost/emulator addresses.

