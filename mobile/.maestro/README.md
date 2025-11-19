# Maestro E2E Tests

This directory contains end-to-end tests for the ShareMoney mobile app using [Maestro](https://maestro.mobile.dev/).

## Prerequisites

1. Install Maestro CLI:
   ```bash
   curl -Ls "https://get.maestro.mobile.dev" | bash
   ```

2. Ensure the app is running on an emulator:
   For android emulator release build - 
   ```bash
   npm run android:release:local
   ```
   

## Running Tests

### Run all tests:
```bash
npm run test:e2e
```

### Run with Maestro CLI directly:
```bash
maestro test .maestro/sign-in-success.yaml
maestro test .maestro/group-details.yaml
```

## Test Data

Tests use the seed data from `supabase/seed.sql`:
- **Test User**: alice@test.com
- **Password**: testpassword123

Make sure your database is seeded before running tests:
```bash
npx supabase db reset --local
```
