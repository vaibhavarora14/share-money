# ShareMoney

ShareMoney (also known as Split Money) is an app to track balances for money used for shared purposes like Splitwise. It helps you split bills, track shared expenses, and manage balances between friends, roommates, or any group sharing costs.

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```
   This project uses npm workspaces, so a single `npm install` installs dependencies for all workspaces (root, mobile, and netlify).

2. **Set up environment variables:**
   - Create `.env` in root (see [TECH.md](./TECH.md) for details)
   - Create `mobile/.env` (see [TECH.md](./TECH.md) for details)

3. **Start local Supabase:**
   ```bash
   supabase start
   ```

4. **Run the app:**
   ```bash
   # Terminal 1 - Backend
   npm run dev:server
   
   # Terminal 2 - Mobile
   npm run dev:mobile
   ```

## Test Database Seed

The `supabase/seed.sql` file automatically runs when you reset your database:

```bash
npx supabase db reset --local
```

This creates:
- **4 test users** (alice@test.com, bob@test.com, charlie@test.com, diana@test.com)
  - Password for all: `testpassword123`
- **2 test groups** with members
- **5 transactions** with expense splits
- **2 settlements** between users

**Note:** You may see a 502 error at the end - this is harmless. The seed data is inserted successfully. The error is a timing issue with container health checks during restart.

The seed can be run repeatedly - it uses `ON CONFLICT DO NOTHING` to safely re-run without duplicates.

## Documentation

- **[TECH.md](./TECH.md)** - Complete technical documentation, setup, deployment, and troubleshooting
- **[mobile/EXPO_PUBLISH.md](./mobile/EXPO_PUBLISH.md)** - Expo publishing and EAS build guide

## Resources

- Supabase migrations: `supabase/migrations/`
- GitHub Actions: `.github/workflows/`

