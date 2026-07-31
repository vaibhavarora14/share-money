# Technical Documentation

## Tech Stack

- **Frontend**: React Native (Expo), TypeScript, React Native Paper
- **Backend**: Supabase Edge Functions (Deno/TypeScript)
- **Database**: Supabase (PostgreSQL)
- **Auth**: Supabase Auth (Email/Password + Google OAuth)

## Project Structure

```
ShareMoney/
├── supabase/             # Supabase configuration
│   ├── functions/        # Supabase Edge Functions
│   └── migrations/       # Database migrations
├── scripts/              # Utility scripts
└── mobile/               # React Native Expo app
```

## Prerequisites

- Node.js (v18+)
- npm/yarn
- Supabase account
- Expo CLI (via npx or global)
- Docker (for local Supabase development)
- Supabase CLI (for local development and deployment)

## Development Setup

### 1. Clone and Install

This project uses **npm workspaces** for monorepo management. Install all dependencies from the root:

```bash
# Install all dependencies (root and mobile workspaces)
npm install
```

This will automatically install dependencies for:
- Root workspace
- `mobile/` workspace

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

#### Root `.env` (for local development)

Create `.env` in the root directory (optional, mainly for scripts):

```env
# For Local Development
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH
SUPABASE_SERVICE_ROLE_KEY=sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz

# CORS Configuration for Edge Functions (required)
# For local development with Expo dev server
ALLOWED_ORIGIN=http://localhost:19000

# For Production (update with your cloud Supabase credentials)
# SUPABASE_URL=https://your-project.supabase.co
# SUPABASE_ANON_KEY=your_anon_key
# SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
# ALLOWED_ORIGIN=https://your-app-domain.com
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

**Run from root (using workspaces):**
```bash
# Terminal 1 - Mobile
npm run dev:mobile

# Terminal 2 - Local Supabase (if needed)
supabase start
```

**Run from individual directories:**
```bash
# Terminal 1 - Mobile
cd mobile
npm start
# Press 'i' for iOS, 'a' for Android, or scan QR code

# Terminal 2 - Local Supabase (if needed)
supabase start
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

### Supabase Edge Functions

Edge Functions are automatically deployed via GitHub Actions when code is pushed to `main`. See `.github/workflows/deploy-edge-functions.yml` for details.

**Manual deployment:**
```bash
# Link to your project (first time only)
supabase link --project-ref your-project-id

# Deploy all functions
supabase functions deploy

# Deploy specific function
supabase functions deploy function-name
```

**Required secrets:**
- `SUPABASE_ACCESS_TOKEN` - Get from https://supabase.com/dashboard/account/tokens
- `SUPABASE_PROJECT_ID` - Your project reference ID from Settings > General

**Monthly reminder Edge Function secrets:**

Set these in Supabase Dashboard > Project Settings > Edge Functions > Environment Variables:

- `APP_URL` - App URL used for links in reminder emails
- `REMINDER_CRON_SECRET` - Random shared secret required to invoke `monthly-reminders`
- `RESEND_API_KEY` - Resend API key
- `REMINDER_FROM_EMAIL` - Verified Resend sender, e.g. `ShareMoney <reminders@example.com>`

Set these in Supabase Vault before the monthly Cron job runs:

- `monthly_reminders_function_url` - Full deployed function URL, e.g. `https://<project-ref>.supabase.co/functions/v1/monthly-reminders`
- `monthly_reminders_cron_secret` - Same value as `REMINDER_CRON_SECRET`

### GitHub Actions (CI/CD)

#### Database Migrations (manual)

Database migrations are **not** automated. The old `supabase-migrations.yml` workflow
was removed; new migration files in `supabase/migrations/` must be applied manually
with the Supabase CLI:

```bash
# Link to your project (first time only)
supabase link --project-ref your-project-id

# Apply pending migrations to production
supabase db push
```

Run `supabase db push` before (or together with) merging PRs whose edge functions
depend on new database objects, so the deployed functions never reference missing
tables/functions.

**Security notes:**

- Never commit secrets to the repository
- Rotate access tokens periodically
- Review migration files before merging to `main`

#### What deploys automatically on merge to `main`

| Target | Mechanism | Trigger |
|---|---|---|
| Edge functions | `.github/workflows/deploy-edge-functions.yml` | Push to `main` (any path) + manual dispatch |
| Web app (Expo web, share-money.expo.app) | `.github/workflows/deploy-web.yml` (`expo export` + `eas deploy --prod`) | Push to `main` (any path) + manual dispatch |
| Marketing site (`web/`, share-money-web.vercel.app) | Vercel Git integration (not GitHub Actions); `deploy-marketing.yml` is only a build check | Every push |
| Database migrations | Manual `supabase db push` | — |
| Android / iOS binaries & OTA updates | Manual (`mobile/build-release*.sh`, `eas submit`, `eas update`) | — |

**Note:** until July 2026, the version bot's commit message contained `[skip ci]`.
Squash merges inherit that marker into the merge commit message, which made GitHub
skip ALL push-triggered deploy workflows for any squash-merged PR the bot had
touched — deploys silently only happened via manual `workflow_dispatch`. The marker
has been removed from `pr-version-bump.yml`; merge-to-main deploys now run as
described above. Avoid putting `[skip ci]` in PR titles or commit messages unless
you intend to suppress the deploy workflows.

#### Edge Functions Deployment

Automatic Edge Functions deployment is configured via GitHub Actions. On every push to `main` (no path filter), all Edge Functions are deployed to production.

**Setup Instructions:**

1. **Get Supabase Access Token:**
   - Go to https://supabase.com/dashboard/account/tokens
   - Click "Generate new token"
   - Copy the token (save it securely - you won't see it again!)

2. **Get Project ID:**
   - Go to your Supabase project dashboard
   - Navigate to Settings > General
   - Copy your "Reference ID" (this is your Project ID)

3. **Configure GitHub Secrets:**
   - Go to your GitHub repository
   - Navigate to Settings > Secrets and variables > Actions
   - Click "New repository secret"
   - Add the following secrets:
     - `SUPABASE_ACCESS_TOKEN` - Your Supabase access token
     - `SUPABASE_PROJECT_ID` - Your Supabase project reference ID

**How It Works:**

The workflow (`.github/workflows/deploy-edge-functions.yml`) automatically:

1. **Triggers** on any push to `main` branch (and via manual dispatch)
2. **Installs** Supabase CLI
3. **Links** to your Supabase project
4. **Deploys** all Edge Functions using `supabase functions deploy`
5. **Reports** deployment status and summary

**Manual Triggering:**

- Go to Actions tab in GitHub
- Select "Deploy Supabase Edge Functions" workflow
- Click "Run workflow"

**Free Tier Limits:**

- Up to 25 Edge Functions per project
- 500,000 invocations per month
- Functions are deployed globally via Supabase's CDN

## Architecture

- **Database**: Supabase PostgreSQL with Row Level Security (RLS)
- **Auth**: Supabase Auth (JWT tokens, AsyncStorage persistence)
- **API**: Supabase Edge Functions with CORS and auth validation
- **Mobile**: Expo with React Native Paper UI

## Key Implementation Details

### Authentication Flow

1. User signs in via Supabase Auth (email/password or Google OAuth)
2. JWT token stored in AsyncStorage
3. Token sent in `Authorization: Bearer <token>` header to API
4. Supabase Edge Function validates token with Supabase
5. RLS policies filter data by `user_id`

### Google OAuth Setup

1. Create OAuth credentials in Google Cloud Console (Web application type)
2. Add redirect URI: `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`
3. Configure in Supabase Dashboard > Authentication > Providers
4. Add mobile redirect URL: `com.vaibhavarora.sharemoney://auth/callback` (in Supabase URL Configuration)

### Environment Variables

- **Expo requirement**: All mobile env vars must use `EXPO_PUBLIC_` prefix
- **Supabase Edge Functions**: Environment variables are set in Supabase Dashboard > Edge Functions > Settings
- **Mobile**: Loads from `mobile/.env` (Expo SDK 49+ native support)

## Debugging

### View Android Logs

```bash
# Connect device via USB
adb devices

# View filtered logs
adb logcat | grep -E "ReactNative|ShareMoney|com.vaibhavarora.sharemoney|ERROR|FATAL"

# View only errors
adb logcat *:E

# View logs for specific app
adb logcat | grep "com.vaibhavarora.sharemoney"
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
adb shell pm clear com.vaibhavarora.sharemoney
```
