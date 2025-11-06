# Local Development Guide

## Quick Start

### 1. Start Backend (Netlify Dev)
```bash
cd /Users/vaibhavarora/ShareMoney
netlify dev
```

The backend will be available at: `http://localhost:8888/api/transactions`

### 2. Start Mobile App
```bash
cd /Users/vaibhavarora/ShareMoney/mobile
npm start
```

Then:
- Press `i` for iOS simulator
- Press `a` for Android emulator
- Scan QR code with Expo Go app on physical device

## Important Notes

### For Physical Devices
If you're testing on a physical device (not simulator/emulator), you need to update the API URL in `mobile/App.tsx`:

1. Find your computer's local IP address:
   ```bash
   # macOS/Linux
   ifconfig | grep "inet " | grep -v 127.0.0.1
   
   # Or
   ipconfig getifaddr en0
   ```

2. Update `mobile/App.tsx`:
   ```typescript
   const API_URL = __DEV__ 
     ? 'http://YOUR_LOCAL_IP:8888/api/transactions'  // e.g., http://192.168.1.100:8888/api/transactions
     : 'https://sharemoney-app.netlify.app/api/transactions';
   ```

### Database Setup
Make sure you've run the SQL seed script in Supabase:
1. Go to https://supabase.com/dashboard
2. Open SQL Editor
3. Run the SQL from `netlify/supabase-seed.sql`

### Environment Variables
The `.env` file in the root directory contains:
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_ANON_KEY` - Your Supabase anon key

Netlify dev automatically loads these from `.env` file.

## Troubleshooting

### Backend not starting
- Check if port 8888 is already in use
- Verify `.env` file exists in root directory
- Check Netlify CLI is installed: `netlify --version`

### Mobile app can't connect
- **Simulator/Emulator**: Should work with `localhost:8888`
- **Physical Device**: Must use your computer's IP address (not localhost)
- Make sure both devices are on the same network
- Check firewall isn't blocking port 8888

### Database errors
- Verify Supabase credentials in `.env` file
- Check that `transactions` table exists in Supabase
- Ensure seed data has been inserted

## Testing the API

Test the backend directly:
```bash
curl http://localhost:8888/api/transactions
```

You should see a JSON array of transactions.

