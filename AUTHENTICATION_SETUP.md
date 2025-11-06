# Authentication Setup Checklist

## ✅ Completed Features

- [x] Email/Password authentication (Sign Up & Sign In)
- [x] Google OAuth authentication
- [x] Session persistence with AsyncStorage
- [x] Protected API endpoints with JWT tokens
- [x] Row Level Security (RLS) for user data isolation
- [x] Beautiful login/signup UI with Google button
- [x] Error handling and loading states
- [x] Sign out functionality

## 📋 Setup Steps

### 1. Install Dependencies
```bash
cd mobile
npm install
```

### 2. Configure Supabase Credentials
- Update `mobile/supabase.ts` with your Supabase URL and anon key
- Or create `mobile/.env` file:
  ```
  EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
  EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
  ```

### 3. Run Database Migrations
```bash
# Using Supabase CLI
supabase db push

# Or manually run SQL in Supabase Dashboard:
# 1. supabase/migrations/20240101000000_create_transactions.sql
# 2. supabase/migrations/20240102000000_add_user_authentication.sql
```

### 4. Configure Google OAuth (Optional)
1. Create OAuth credentials in Google Cloud Console
2. Enable Google provider in Supabase Dashboard
3. Add redirect URL: `com.sharemoney.app://auth/callback`

### 5. Update API URL
- Update `API_URL` in `mobile/App.tsx` with your Netlify URL

### 6. Start the App
```bash
cd mobile
npm start
```

## 🧪 Testing

1. **Email/Password Flow**:
   - Tap "Sign Up" → Create account → Should see transactions screen
   - Sign out → Sign in with same credentials → Should work

2. **Google OAuth Flow**:
   - Tap "Continue with Google" → Browser opens → Sign in → Redirects back → Should see transactions screen

3. **Session Persistence**:
   - Sign in → Close app → Reopen app → Should still be signed in

4. **Data Isolation**:
   - Create account A → Add transactions → Sign out
   - Create account B → Should see empty transactions list (or only B's data)

## 🔧 Troubleshooting

- **"Missing Supabase credentials"**: Check `mobile/supabase.ts` or `.env` file
- **Google sign-in fails**: Verify redirect URLs in Supabase Dashboard
- **401 Unauthorized**: Check that auth token is being sent in API requests
- **No transactions showing**: Verify RLS policies are enabled and user_id is set

## 📝 Next Steps

- [ ] Add password reset functionality
- [ ] Add email verification
- [ ] Add more OAuth providers (Apple, GitHub, etc.)
- [ ] Add biometric authentication (Face ID / Touch ID)
- [ ] Add "Remember me" option
- [ ] Add user profile screen
