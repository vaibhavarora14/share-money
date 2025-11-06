# ShareMoney - Transactions App

A React Native Expo mobile app with Netlify Edge Functions backend, integrated with Supabase database to display transactions.

## Project Structure

```
ShareMoney/
├── netlify/              # Netlify Edge Functions backend
│   ├── edge-functions/   # Edge Functions
│   │   └── transactions.ts
│   └── package.json      # Backend dependencies
├── supabase/             # Supabase migrations
│   └── migrations/       # Database migrations
│       └── 20240101000000_create_transactions.sql
├── scripts/              # Utility scripts
│   ├── seed-db.sh        # Database seeding script
│   └── seed-db.ts        # Database seeding TypeScript
└── mobile/               # React Native Expo app
    ├── App.tsx           # Main app component (TypeScript)
    ├── types.ts          # TypeScript type definitions
    ├── tsconfig.json     # TypeScript configuration
    └── package.json      # Mobile app dependencies
```

## Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Expo CLI (installed globally or via npx)
- Supabase account (free tier works)
- Netlify account (free tier works)

## Setup Instructions

### 1. Supabase Database Setup

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to **Project Settings > API** and copy:
   - **Project URL** (your `SUPABASE_URL`)
   - **anon public** key (your `SUPABASE_ANON_KEY`)
3. Set up the database using Supabase CLI:
   ```bash
   # Install Supabase CLI
   brew install supabase/tap/supabase
   
   # Login to Supabase
   supabase login
   
   # Link your project (replace with your project ref)
   supabase link --project-ref YOUR_PROJECT_REF
   
   # Push migrations to create table and seed data
   supabase db push
   ```
   
   Alternatively, you can run the migration SQL manually in the Supabase SQL Editor:
   - First run: `supabase/migrations/20240101000000_create_transactions.sql`
   - Then run: `supabase/migrations/20240102000000_add_user_authentication.sql`
   
   **Important**: The authentication migration adds Row Level Security (RLS) policies, so users can only access their own transactions.

### 2. Netlify Backend Setup

1. Install dependencies:
   ```bash
   cd netlify
   npm install
   ```

2. Set up environment variables in Netlify:
   - Go to your Netlify site dashboard
   - Navigate to **Site settings > Environment variables**
   - Add the following:
     - `SUPABASE_URL` = your Supabase project URL
     - `SUPABASE_ANON_KEY` = your Supabase anon key

3. For local development, create a `.env` file in the root directory:
   ```
   SUPABASE_URL=your_supabase_url
   SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. Deploy to Netlify:
   
   **Option A: Deploy from the netlify directory**
   ```bash
   # Install Netlify CLI if not already installed
   npm install -g netlify-cli
   
   # Login to Netlify
   netlify login
   
   # Navigate to netlify directory and deploy
   cd netlify
   netlify deploy --prod
   ```
   
   **Option B: Deploy from root (move netlify.toml to root)**
   - Move `netlify/netlify.toml` to the project root
   - Update paths in `netlify.toml` to point to `netlify/edge-functions`
   - Deploy from root: `netlify deploy --prod`

5. Note your Netlify site URL (e.g., `https://your-site.netlify.app`)

### 3. Mobile App Setup

1. Navigate to the mobile directory:
   ```bash
   cd mobile
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure Supabase credentials:
   - Create a `.env` file in the `mobile` directory (or use environment variables)
   - Add your Supabase credentials:
     ```
     EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
     EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
     ```
   - Alternatively, update `mobile/supabase.ts` directly with your credentials

4. Update the API URL in `App.tsx`:
   - Open `mobile/App.tsx`
   - Find the `API_URL` constant near the top
   - Replace `https://your-site.netlify.app/api/transactions` with your actual Netlify URL

5. For local development (if running Netlify dev locally):
   - Change `API_URL` to `http://YOUR_LOCAL_IP:8888/api/transactions`
   - Make sure your mobile device/emulator can access localhost (use your computer's IP for physical devices)

6. Start the Expo development server:
   ```bash
   npm start
   ```

7. Run on your preferred platform:
   - Press `i` for iOS simulator
   - Press `a` for Android emulator
   - Scan QR code with Expo Go app on your physical device

## Running the Project

### Backend (Netlify)

For local development:
```bash
cd netlify
netlify dev
```

The Edge Function will be available at `http://localhost:8888/api/transactions`

### Mobile App

```bash
cd mobile
npm start
```

Then choose your platform (iOS, Android, or Web).

## API Endpoint

- **Endpoint**: `/api/transactions`
- **Method**: GET
- **Authentication**: Required (Bearer token in Authorization header)
- **Response**: JSON array of transactions (filtered by authenticated user)

Example response:
```json
[
  {
    "id": 1,
    "amount": 150.00,
    "description": "Grocery shopping at Whole Foods",
    "date": "2024-01-15",
    "type": "expense",
    "category": "Food"
  },
  ...
]
```

## Features

- ✅ Netlify Edge Functions backend (TypeScript)
- ✅ Supabase PostgreSQL database integration
- ✅ **User authentication** with Supabase Auth (Email/Password + Google OAuth)
- ✅ **Row Level Security (RLS)** - users can only see their own transactions
- ✅ React Native Expo mobile app (TypeScript)
- ✅ Beautiful transaction list UI with login/signup screens
- ✅ Loading and error states
- ✅ Transaction categorization (income/expense)
- ✅ Formatted dates and amounts
- ✅ Full TypeScript support with type safety

## Troubleshooting

### Mobile app can't connect to API

- Verify the `API_URL` in `App.js` is correct
- For physical devices, use your computer's local IP instead of `localhost`
- Check that Netlify Edge Function is deployed and accessible
- Verify CORS headers are set correctly in the Edge Function

### Authentication errors

- **"Unauthorized: Missing authorization header"**: Make sure you're signed in. The app should show the login screen if not authenticated.
- **"Unauthorized: Invalid or expired token"**: Your session may have expired. Try signing out and signing back in.
- **Can't sign up/sign in**: 
  - Verify your Supabase credentials are correct in `mobile/supabase.ts` or `.env` file
  - Check that Supabase Auth is enabled in your Supabase project settings
  - Ensure email confirmation is disabled for testing (or check your email for confirmation link)
- **Google sign-in not working**:
  - Verify Google OAuth is configured in Supabase Dashboard (Authentication > Providers)
  - Check that redirect URLs are configured correctly in Supabase (Authentication > URL Configuration)
  - Ensure the redirect URL matches the scheme in `mobile/app.json` (`com.sharemoney.app://auth/callback`)
  - Make sure Google OAuth credentials (Client ID and Secret) are correctly entered in Supabase
- **"Users can only see their own transactions"**: This is expected behavior due to Row Level Security. Each user only sees their own data.

### Database connection errors

- Verify Supabase environment variables are set correctly in Netlify
- Check that the `transactions` table exists in Supabase
- Run migrations: `supabase db push`
- Or use the seed script: `./scripts/seed-db.sh`

### Netlify deployment issues

- Make sure `netlify.toml` is in the correct location
- Verify Edge Function file is in `netlify/edge-functions/` directory
- Check Netlify build logs for errors

## Authentication

The app now includes full user authentication with multiple sign-in options:

1. **Email/Password Sign Up**: New users can create an account with email and password
2. **Email/Password Sign In**: Existing users can sign in with their credentials
3. **Google Sign In**: Users can sign in with their Google account (OAuth)
4. **Session Management**: Authentication state is persisted using AsyncStorage
5. **Protected API**: All API calls require a valid authentication token
6. **User Isolation**: Each user can only see their own transactions (enforced by RLS)

### Setting Up Google OAuth

To enable Google sign-in, you need to configure Google OAuth in your Supabase project:

1. **Create Google OAuth Credentials**:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select an existing one
   - Navigate to **APIs & Services > Credentials**
   - Click **Create Credentials > OAuth client ID**
   - Choose **Web application** as the application type
   - Add authorized redirect URIs:
     - `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`
     - Replace `YOUR_PROJECT_REF` with your Supabase project reference
   - Copy the **Client ID** and **Client Secret**

2. **Configure in Supabase**:
   - Go to your Supabase Dashboard
   - Navigate to **Authentication > Providers**
   - Enable **Google** provider
   - Enter your Google **Client ID** and **Client Secret**
   - Save the configuration

3. **Configure Redirect URLs** (for mobile):
   - In Supabase Dashboard, go to **Authentication > URL Configuration**
   - Add your app's redirect URL to **Redirect URLs**:
     - For development: `com.sharemoney.app://auth/callback`
     - For production: Add your production redirect URL
   - The redirect URL format is: `{scheme}://auth/callback`
   - The scheme is defined in `mobile/app.json` (currently `com.sharemoney.app`)

### Testing Authentication

1. Start the app and you'll see the login screen
2. **Email/Password**: 
   - Tap "Don't have an account? Sign Up" to create a new account
   - Or sign in with existing credentials
3. **Google Sign In**:
   - Tap "Continue with Google" button
   - A browser will open for Google authentication
   - After successful authentication, you'll be redirected back to the app
4. After signing up/signing in, you'll see the transactions screen
5. Use the "Sign Out" button in the header to log out

## Next Steps

- ✅ Add authentication
- Implement transaction creation/editing
- Add filtering and sorting
- Implement pull-to-refresh
- Add transaction details screen

