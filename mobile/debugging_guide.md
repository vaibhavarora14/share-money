# Debugging Guide for ShareMoney App

## 1. View Android Logs (logcat)

The easiest way to see what's crashing is to view Android logs in real-time.

### Connect your device via USB and run:

```bash
# Make sure your device is connected
adb devices

# View all logs (filtered for React Native and your app)
adb logcat | grep -E "ReactNative|ShareMoney|com.sharemoney|ERROR|FATAL"

# Or view all logs and save to file
adb logcat > app-logs.txt

# View only errors
adb logcat *:E

# View logs for your specific app package
adb logcat | grep "com.sharemoney.app"
```

### Filter for specific tags:

```bash
# React Native JS errors
adb logcat | grep "ReactNativeJS"

# Native crashes
adb logcat | grep -E "FATAL|AndroidRuntime"

# Expo/ExpoModules errors
adb logcat | grep -E "ExpoModules|Expo"
```

## 2. Enable Remote Debugging

### Option A: Using Expo Dev Client (if you have a development build)

1. Shake your device or press `Cmd+M` (Mac) / `Ctrl+M` (Windows/Linux)
2. Select "Debug Remote JS"
3. Open Chrome DevTools at `http://localhost:19000/debugger-ui`

### Option B: Using React Native Debugger

```bash
# Install React Native Debugger
brew install --cask react-native-debugger

# Then enable remote debugging in the app
```

## 3. Check Console Logs

The app has console.log statements at key points:
- App initialization
- Font loading
- Error boundaries

These will appear in:
- `adb logcat` (Android)
- Metro bundler console (if running)
- React Native Debugger

## 4. View Crash Reports

### Android Studio Logcat:
1. Open Android Studio
2. Connect your device
3. Go to View → Tool Windows → Logcat
4. Filter by package: `com.sharemoney.app`

### Check for native crashes:
```bash
# View crash logs
adb logcat -b crash

# View all system logs
adb logcat -d > full-logs.txt
```

## 5. Common Issues to Check

### Environment Variables Missing:
```bash
# Check if env vars are set
adb logcat | grep "EXPO_PUBLIC"
```

### Network Issues:
```bash
# Check network requests
adb logcat | grep -E "fetch|network|API"
```

## 6. Quick Debug Commands

```bash
# Clear logs and start fresh
adb logcat -c

# Monitor logs in real-time with filtering
adb logcat | grep -E "ReactNativeJS|ERROR|FATAL|Exception"

# Install APK
adb install -r path/to/app.apk

# Uninstall app
adb uninstall com.sharemoney.app

# Clear app data
adb shell pm clear com.sharemoney.app
```

