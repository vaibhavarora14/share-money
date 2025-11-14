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

## Documentation

- **[TECH.md](./TECH.md)** - Complete technical documentation, setup, deployment, and troubleshooting
- **[mobile/EXPO_PUBLISH.md](./mobile/EXPO_PUBLISH.md)** - Expo publishing and EAS build guide

## Resources

- Supabase migrations: `supabase/migrations/`
- GitHub Actions: `.github/workflows/`

