# Maestro E2E Tests

This directory contains end-to-end tests for the ShareMoney mobile app using [Maestro](https://maestro.mobile.dev/).

## Prerequisites

1. Install Maestro CLI:
   ```bash
   curl -Ls "https://get.maestro.mobile.dev" | bash
   ```

2. Ensure the app is running on an emulator/device:
   ```bash
   npm run android  # or npm run ios
   ```

## Running Tests

### Run all tests:
```bash
npm run test:e2e
```

### Run individual tests:
```bash
# Sign in test
npm run test:e2e:signin

# Group details test
npm run test:e2e:group-details
```

### Run with Maestro CLI directly:
```bash
maestro test .maestro/sign-in-success.yaml
maestro test .maestro/group-details.yaml
```

## Test Files

### `sign-in-success.yaml`
Tests the sign-in flow:
- Verifies the sign-in screen is displayed
- Enters test credentials (alice@test.com / testpassword123)
- Verifies successful navigation to groups screen

### `group-details.yaml`
Tests viewing group details:
- Signs in if not already authenticated
- Navigates to groups list
- Taps on a group card
- Verifies group details screen elements (Members, Transactions, Balances)
- Navigates back to groups list

## Test Data

Tests use the seed data from `supabase/seed.sql`:
- **Test User**: alice@test.com
- **Password**: testpassword123

Make sure your database is seeded before running tests:
```bash
npx supabase db reset --local
```

## Development Build Auto-Connect

The tests are configured to automatically connect to the development server **without showing the popup** by launching the app with a deep link URL that includes the Metro bundler connection.

### How It Works

Tests launch the app with a deep link:
```
exp+share-money://expo-development-client/?url=http://YOUR_IP:8081
```

This tells the development client to immediately connect to the dev server, bypassing the connection popup.

### Updating Your IP Address

If your local IP address changes, update it in the test files:

1. **Find your IP:**
   ```bash
   # macOS
   ipconfig getifaddr en0
   
   # Linux
   ip addr show | grep "inet "
   ```

2. **Update the test files:**
   - Edit `.maestro/sign-in-success.yaml`
   - Edit `.maestro/group-details.yaml`
   - Replace `192.168.0.216` with your actual IP address

### Alternative: Use Environment Variable

You can also set the IP as an environment variable when running tests:
```bash
DEV_SERVER_IP=192.168.0.216 maestro test .maestro/
```

**Note:** Make sure your development server is running (`npm run start:dev`) before running Maestro tests.

## Notes

- Tests are designed to work with the Android emulator by default
- For iOS, you may need to adjust selectors or add iOS-specific configurations
- Tests include `optional: true` flags for some assertions to handle UI variations gracefully
- Tests automatically handle the Expo development build connection popup

