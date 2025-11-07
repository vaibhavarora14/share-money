# ShareMoney

React Native Expo mobile app with Netlify Functions backend and Supabase database.

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

- Node.js (v18+)
- npm/yarn
- Supabase account
- Netlify account
- Expo CLI (via npx or global)

## Development Setup

### 1. Clone and Install

```bash
# Install root dependencies (if any)
npm install

# Install backend dependencies
cd netlify && npm install

# Install mobile dependencies
cd ../mobile && npm install
```

### 2. Environment Variables

**Root `.env`** (for Netlify):
```env
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
```

**`mobile/.env`** (must use `EXPO_PUBLIC_` prefix):
```env
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
EXPO_PUBLIC_API_URL=http://YOUR_LOCAL_IP:8888/api  # Optional, defaults based on __DEV__
```

### 3. Database Setup

```bash
# Using Supabase CLI
supabase link --project-ref YOUR_PROJECT_REF
supabase db push

# Or manually run migrations in Supabase SQL Editor:
# - supabase/migrations/20240101000000_create_transactions.sql
# - supabase/migrations/20240102000000_add_user_authentication.sql
```

### 4. Run Locally

**Terminal 1 - Backend:**
```bash
cd netlify
netlify dev
# Available at http://localhost:8888/api/transactions
```

**Terminal 2 - Mobile:**
```bash
cd mobile
npm start
# Press 'i' for iOS, 'a' for Android, or scan QR code
```

**Note**: For physical devices, use your local IP instead of `localhost` in `EXPO_PUBLIC_API_URL`.

## Deployment

### Netlify

1. Set environment variables in Netlify dashboard:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`

2. Deploy:
   ```bash
   cd netlify
   netlify deploy --prod
   ```

### Mobile (Expo)

See `mobile/EXPO_PUBLISH.md` for EAS build and OTA update instructions.

## API

**Endpoint**: `GET /api/transactions`

- **Auth**: Bearer token required
- **Response**: JSON array of transactions (filtered by user via RLS)

**Implementation**: `netlify/functions/transactions.ts`

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
5. RLS policies filter transactions by `user_id`

### Google OAuth Setup

1. Create OAuth credentials in Google Cloud Console (Web application type)
2. Add redirect URI: `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`
3. Configure in Supabase Dashboard > Authentication > Providers
4. Add mobile redirect URL: `com.sharemoney.app://auth/callback` (in Supabase URL Configuration)

### Environment Variables

- **Expo requirement**: All mobile env vars must use `EXPO_PUBLIC_` prefix
- **Netlify**: Loads from root `.env` automatically in dev
- **Mobile**: Loads from `mobile/.env` (Expo SDK 49+ native support)

## Troubleshooting

- **Port 8888 in use**: Change port or kill process
- **Physical device can't connect**: Use local IP in `EXPO_PUBLIC_API_URL`, not `localhost`
- **Auth errors**: Verify env vars have correct prefix, check Supabase dashboard config
- **RLS issues**: Ensure migrations ran, verify policies in Supabase dashboard

## Development

### Testing API

```bash
curl http://localhost:8888/api/transactions
```

### Code Structure

- `mobile/App.tsx` - Main app component, transaction list
- `mobile/screens/AuthScreen.tsx` - Login/signup UI
- `mobile/contexts/AuthContext.tsx` - Auth state management
- `mobile/supabase.ts` - Supabase client configuration
- `netlify/functions/transactions.ts` - API endpoint handler

## Scripts

- `./scripts/seed-db.sh` - Seed database with sample data
- `./scripts/seed-db.ts` - TypeScript version of seed script

## Resources

- Expo publishing: `mobile/EXPO_PUBLISH.md`
- Supabase migrations: `supabase/migrations/`

