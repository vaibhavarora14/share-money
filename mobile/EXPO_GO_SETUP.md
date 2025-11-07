# Expo Go and Development Builds Setup

This project now supports **both Expo Go and Development Builds**!

## How It Works

The project uses a dynamic `app.config.js` that automatically detects the build context:
- **Expo Go**: New architecture is disabled, `expo-dev-client` plugin is excluded
- **Development Builds**: New architecture is enabled, `expo-dev-client` plugin is included

## Using Expo Go (Quick Development)

1. **Start the dev server:**
   ```bash
   cd mobile
   npm start
   # or explicitly: npm run start:go
   ```

2. **Open Expo Go app** on your device and scan the QR code

3. **That's it!** No build required. Perfect for quick iterations.

**Note:** Expo Go doesn't support the new React Native architecture, so some features might behave slightly differently.

## Using Development Builds (Full Features)

1. **Build the development client:**
   ```bash
   cd mobile
   npm run build:android    # For Android
   # or
   npm run build:ios        # For iOS
   ```

2. **Install the built app** on your device/emulator

3. **Start the dev server:**
   ```bash
   npm start
   ```

4. **Open the development build app** - it will automatically connect to the dev server

**Benefits:**
- Full access to new React Native architecture
- Custom native modules support
- Production-like environment

## Configuration Details

- `app.config.js`: Dynamic configuration that adapts based on build context
- `eas.json`: EAS build profiles with environment variables
- `expo-dev-client`: Kept as a dependency but only used in development builds

## Troubleshooting

**Error: "No development build installed"**
- You're trying to use a development build but haven't built/installed it yet
- Solution: Either build a development build OR use Expo Go by running `npm start` and scanning the QR code

**Want to force Expo Go mode?**
- Run: `npm run start:go` or `expo start --go`

**Want to ensure development build mode?**
- Make sure you've built and installed a development build first
- The app will automatically detect it's a development build

