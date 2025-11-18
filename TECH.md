# Technical Documentation

## Tech Stack

- **Frontend**: React Native (Expo), TypeScript, React Native Paper
- **Backend**: Netlify Functions (Node.js/TypeScript)
- **Database**: Supabase (PostgreSQL)
- **Auth**: Supabase Auth (Email/Password + Google OAuth)

## Project Structure

```
ShareMoney/
├── netlify/              # Netlify Functions backend
│   ├── functions/        # Netlify Functions
├── supabase/             # Supabase migrations
│   └── migrations/       # Database migrations
├── scripts/              # Utility scripts
└── mobile/               # React Native Expo app
```

## Prerequisites

- Node.js (v18+)
- npm/yarn
- Supabase account
- Netlify account
- Expo CLI (via npx or global)
- Docker (for local Supabase development)
- Supabase CLI (for local development)

## Development Setup

### 1. Clone and Install

This project uses **npm workspaces** for monorepo management. Install all dependencies from the root:

```bash
# Install all dependencies (root, mobile, and netlify)
npm install
```

This will automatically install dependencies for:
- Root workspace
- `mobile/` workspace
- `netlify/` workspace

**Note:** All dependencies are installed in a single `node_modules` at the root, with workspace-specific dependencies hoisted appropriately.

### 2. Local Supabase Setup

#### Start Local Supabase

```bash
# Start local Supabase (requires Docker)
supabase start

# Check status
supabase status
```

**Connection Details:**
- API URL: `http://127.0.0.1:54321`
- Database URL: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`
- Studio URL: `http://127.0.0.1:54323` (Supabase Dashboard)
- Mailpit URL: `http://127.0.0.1:54324` (Email testing)

**Local Keys:**
- Publishable key: `sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH`
- Secret key: `sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz`

#### Database Management

```bash
# Reset database (drops everything, re-applies all migrations)
supabase db reset

# Apply new migrations
supabase db push

# Create new migration
supabase migration new migration_name

# View migration status
supabase migration list
```

#### Access Supabase Studio

Open in browser: **http://127.0.0.1:54323**

- View tables, data, and run SQL queries
- Test authentication
- View logs and metrics

### 3. Environment Variables

#### Root `.env` (for Netlify Functions)

Create `.env` in the root directory:

```env
# For Local Development
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH
SUPABASE_SERVICE_ROLE_KEY=sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz

# For Production (update with your cloud Supabase credentials)
# SUPABASE_URL=https://your-project.supabase.co
# SUPABASE_ANON_KEY=your_anon_key
# SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

#### Mobile `.env`

Create `mobile/.env` (must use `EXPO_PUBLIC_` prefix):

```env
# For iOS Simulator
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH
EXPO_PUBLIC_API_URL=http://localhost:8888/api

# For Android Emulator (uncomment and comment iOS settings above)
# EXPO_PUBLIC_SUPABASE_URL=http://10.0.2.2:54321
# EXPO_PUBLIC_API_URL=http://10.0.2.2:8888/api

# For Physical Device (uncomment and update IP)
# EXPO_PUBLIC_SUPABASE_URL=http://YOUR_LOCAL_IP:54321
# EXPO_PUBLIC_API_URL=http://YOUR_LOCAL_IP:8888/api

# For Production
# EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
# EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
# EXPO_PUBLIC_API_URL=https://sharemoney-app.netlify.app/api
```

**Get your local IP:**
```bash
# macOS
ipconfig getifaddr en0

# Linux
ip addr show | grep "inet "
```

### 4. Run Locally

**Option 1: Run from root (using workspaces):**
```bash
# Terminal 1 - Backend
npm run dev:server

# Terminal 2 - Mobile
npm run dev:mobile
```

**Option 2: Run from individual directories:**
```bash
# Terminal 1 - Backend
cd netlify
npm run dev
# Available at http://localhost:8888/api

# Terminal 2 - Mobile
cd mobile
npm start
# Press 'i' for iOS, 'a' for Android, or scan QR code
```

### 5. Expo Go vs Development Builds

#### Using Expo Go (Quick Development)

1. Start the dev server:
   ```bash
   cd mobile
   npm start
   ```

2. Open Expo Go app on your device and scan the QR code

3. That's it! No build required. Perfect for quick iterations.

**Note:** Expo Go doesn't support the new React Native architecture, so some features might behave slightly differently.

#### Using Development Builds (Full Features)

1. Build the development client:
   ```bash
   cd mobile
   npm run build:android    # For Android
   # or
   npm run build:ios        # For iOS
   ```

2. Install the built app on your device/emulator

3. Start the dev server:
   ```bash
   npm start
   ```

4. Open the development build app - it will automatically connect to the dev server

**Benefits:**
- Full access to new React Native architecture
- Custom native modules support
- Production-like environment

## Deployment

### Netlify (Backend)

1. Set environment variables in Netlify dashboard:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`

2. Deploy:
   ```bash
   cd netlify
   netlify deploy --prod
   ```

### Mobile (Expo)

See `mobile/EXPO_PUBLISH.md` for detailed EAS build and OTA update instructions.

**Quick commands:**
```bash
cd mobile

# OTA Updates
eas update --branch production --message "Your update message"

# Production Builds
eas build --platform ios
eas build --platform android
```

### GitHub Actions (CI/CD)

Automatic Supabase migrations are configured via GitHub Actions. When code is merged to the `main` branch, any new migration files in `supabase/migrations/` are automatically applied to the production database.

#### Setup Instructions

1. **Get Database Connection String:**
   - Go to your Supabase project dashboard
   - Navigate to Settings > Database
   - Under "Connection string" section, select "URI" format
   - Copy the connection string (it will look like: `postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres`)
   - **Important**: For migrations, use the **Direct connection** (port 5432) instead of pooler (port 6543)
   - Replace `[PASSWORD]` with your actual database password
   - **CRITICAL**: If your password contains special characters, you must URL-encode them:
     - `#` → `%23`
     - `@` → `%40`
     - `:` → `%3A`
     - `/` → `%2F`
     - `?` → `%3F`
     - `&` → `%26`
     - `=` → `%3D`
   - Format: `postgresql://postgres:[URL-ENCODED-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres`
   - Example: If password is `my#pass@word`, use `my%23pass%40word`

2. **Configure GitHub Secrets:**
   - Go to your GitHub repository
   - Navigate to Settings > Environments > Production (or create a new environment)
   - Click "Add secret"
   - Add the following secret:
     - `SUPABASE_DATABASE_URL` - Your database connection string (direct connection, port 5432)

3. **Test the workflow:**
   - Push a new migration file to `supabase/migrations/`
   - Create a PR or merge to `main` branch
   - Check the Actions tab to see the migration workflow run

#### How It Works

The workflow (`.github/workflows/supabase-migrations.yml`) automatically:

1. **Triggers** on push to `main` branch or PRs when migration files change
2. **Validates** that the `SUPABASE_DATABASE_URL` secret is configured
3. **Installs** PostgreSQL client (`psql`)
4. **On PRs**: Validates migration files (dry-run, no changes applied)
5. **On main branch**: Applies all migration files in order using `psql`
6. **Reports** success or failure status

#### Manual Triggering

You can also manually trigger the workflow:
- Go to Actions tab in GitHub
- Select "Apply Supabase Migrations" workflow
- Click "Run workflow"

#### Failure Handling

- If migrations fail, the workflow will:
  - Exit with an error code
  - Display error messages in the Actions log
  - Prevent further deployment steps (if configured)
- Always check the workflow logs if a migration fails
- Fix any issues in the migration SQL and push again

#### Security Notes

- Never commit secrets to the repository
- Rotate access tokens periodically
- Use least-privilege access tokens when possible
- Review migration files before merging to `main`

## Architecture

- **Database**: Supabase PostgreSQL with Row Level Security (RLS)
- **Auth**: Supabase Auth (JWT tokens, AsyncStorage persistence)
- **API**: Netlify Functions with CORS and auth validation
- **Mobile**: Expo with React Native Paper UI

## Key Implementation Details

### Authentication Flow

1. User signs in via Supabase Auth (email/password or Google OAuth)
2. JWT token stored in AsyncStorage
3. Token sent in `Authorization: Bearer <token>` header to API
4. Netlify Function validates token with Supabase
5. RLS policies filter data by `user_id`

### Google OAuth Setup

1. Create OAuth credentials in Google Cloud Console (Web application type)
2. Add redirect URI: `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`
3. Configure in Supabase Dashboard > Authentication > Providers
4. Add mobile redirect URL: `com.sharemoney.app://auth/callback` (in Supabase URL Configuration)

### Environment Variables

- **Expo requirement**: All mobile env vars must use `EXPO_PUBLIC_` prefix
- **Netlify**: Loads from root `.env` automatically in dev
- **Mobile**: Loads from `mobile/.env` (Expo SDK 49+ native support)

## Debugging

### View Android Logs

```bash
# Connect device via USB
adb devices

# View filtered logs
adb logcat | grep -E "ReactNative|ShareMoney|com.sharemoney|ERROR|FATAL"

# View only errors
adb logcat *:E

# View logs for specific app
adb logcat | grep "com.sharemoney.app"
```

### Enable Remote Debugging

1. Shake device or press `Cmd+M` (Mac) / `Ctrl+M` (Windows/Linux)
2. Select "Debug Remote JS"
3. Open Chrome DevTools at `http://localhost:19000/debugger-ui`

### Common Debug Commands

```bash
# Clear logs
adb logcat -c

# Monitor logs in real-time
adb logcat | grep -E "ReactNativeJS|ERROR|FATAL|Exception"

# Clear app data
adb shell pm clear com.sharemoney.app
```

## E2E Testing

The mobile app uses [Maestro](https://maestro.mobile.dev/) for end-to-end testing on Android.

### Prerequisites

1. **Install Maestro CLI:**
   ```bash
   # macOS/Linux
   curl -Ls "https://get.maestro.mobile.dev" | bash
   
   # Or using Homebrew (macOS)
   brew tap mobile-dev-inc/tap
   brew install maestro
   
   # Verify installation
   maestro --version
   ```

2. **Android Emulator or Device:**
   - Start an Android emulator, or
   - Connect a physical Android device via USB with USB debugging enabled

3. **App Running:**
   - **For Development Builds:** The app must be built and installed (`npm run build:dev`)
   - **For Expo Go:** 
     - Install Expo Go from Google Play Store on your emulator/device
     - Verify it's installed: `adb shell pm list packages | grep expo`
     - Start Expo dev server: `npm start`
     - Manually open Expo Go and load your project
     - Then run the tests (Maestro will interact with the already-running app)

### Running Tests

From the `mobile/` directory:

```bash
# Run all E2E tests (uses default appId from test files)
npm run test:e2e
```

Or using Maestro directly:

```bash
# Run all tests in e2e/flows directory
maestro test e2e/flows

# Run specific test file
maestro test e2e/flows/[test_file_name].yaml
```

### Test Structure

Tests are located in `mobile/e2e/flows/`:

**Development Build Tests** (appId: `com.sharemoney.app`):
- **login-success.yaml** - Tests successful email/password login flow
- **login-errors.yaml** - Tests error cases (empty fields, invalid credentials)

**Expo Go Tests** (appId: `host.exp.Exponent`):
- **login-success-expo-go.yaml** - Tests successful login flow for Expo Go
- **login-errors-expo-go.yaml** - Tests error cases for Expo Go

**Note:** Expo Go uses a different app package name (`host.exp.Exponent`), so separate test files are provided. 

**Important for Expo Go:**
1. Expo Go must be installed on your emulator/device
2. Start your Expo dev server: `npm start`
3. Manually open Expo Go and load your project
4. Then run the tests - Maestro will interact with the already-running app

### Test User Credentials

The tests use the seeded test user from the database:

- **Email:** `alice@test.com`
- **Password:** `testpassword123`

Make sure your local Supabase instance is running and seeded:

```bash
npx supabase db reset --local
```

### Writing New Tests

Maestro tests are written in YAML format. Key commands:

- `launchApp` - Launches the app
- `tapOn: { id: "test-id" }` - Taps an element by testID
- `inputText: "text"` - Types text into an input field
- `assertVisible: "text"` - Asserts that text is visible on screen

For more Maestro documentation, see: https://maestro.mobile.dev/

### Troubleshooting

**Test fails to find elements:**
- Ensure testID props are added to components
- Verify the app is running and visible on the emulator/device
- Check that the app package name matches `com.sharemoney.app`

**App not launching (Expo Go):**
- **Expo Go must be installed:** Check with `adb shell pm list packages | grep expo`
- If not installed, install from Google Play Store on your emulator/device
- **Expo Go must be running:** Manually open Expo Go and load your project before running tests
- Start Expo dev server first: `npm start`
- Then open Expo Go app, scan QR code or enter URL to load your project
- Finally run: `npm run test:e2e:expo-go`
- Verify Android emulator is running: `adb devices`

**App not launching (Development Build):**
- Ensure the app is built and installed: `npm run build:dev`
- Use `npm run test:e2e:login` or the regular test files
- Verify Android emulator is running: `adb devices`
- Check that the appId in the test file matches: `com.sharemoney.app`

**Tests timing out:**
- Increase wait times in test files if needed
- Ensure network connectivity for API calls
- Check that Supabase backend is running locally