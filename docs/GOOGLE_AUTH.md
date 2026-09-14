# Google Auth Setup (SharedMoney)

This runbook covers:

1. **Native Android Google Sign-In** (Credential Manager account drawer) — issue #269
2. **OAuth consent branding** (avoid sketchy `*.supabase.co` as the visible app name) — issue #270

In-repo code can implement the Android native path and keep the marketing home page
branded as `SharedMoney`. Google Cloud Console and Supabase Dashboard steps still
require an owner with access to those consoles.

## Current app behavior

| Surface | Google sign-in |
| --- | --- |
| Android development / Play builds | Native Credential Manager sheet → Supabase `signInWithIdToken` |
| iOS | Browser OAuth via Supabase (Apple Sign In stays native) |
| Web | Browser OAuth via Supabase |
| Expo Go | Browser OAuth (custom native modules are unavailable) |

Email/password auth is unchanged on all platforms.

Required mobile env (already documented in `mobile/.env.example`):

```env
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<Web OAuth client ID>.apps.googleusercontent.com
```

Use the **Web** client ID (the same one configured in Supabase Auth → Google), not
the Android client ID. Optional for a future native-iOS Google path:

```env
EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME=com.googleusercontent.apps.<ios-client-id>
```

---

## #269 — Native Android Google Sign-In (owner console steps)

### 1. Google Cloud project

Use project `sharedmoney-504507` (`SharedMoney`).

### 2. Ensure a Web OAuth client exists

This client is already used by Supabase for browser OAuth:

- Type: **Web application**
- Authorized redirect URI must include:
  - `https://xesuklogveedeppxbbit.supabase.co/auth/v1/callback`
  - local: `http://127.0.0.1:54321/auth/v1/callback`
- Copy the **Client ID** into:
  - Supabase Dashboard → Authentication → Providers → Google
  - `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (EAS secrets + local `.env`)
  - local Supabase: `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` / `_SECRET`

### 3. Create an Android OAuth client

In Google Auth Platform / Cloud Console → Clients → Create credentials → **Android**:

- Package name: `com.vaibhavarora.sharemoney`
- SHA-1 fingerprints (add **all** that you ship with):
  - EAS / upload key SHA-1 (Play Console → App integrity → Upload key certificate)
  - Play App Signing key SHA-1 (Play Console → App integrity → App signing key certificate)
  - Local debug keystore SHA-1 when testing `expo run:android`

You do **not** put the Android client ID into the app. Creating it registers the
package + SHA-1 pair so Credential Manager can issue ID tokens for the Web client.

### 4. Supabase Google provider

Dashboard → Authentication → Providers → Google:

- Enable Google
- Client ID / secret = Web OAuth client
- Client IDs list may also include the Android client ID (comma-separated) if the
  dashboard asks for additional client IDs
- Keep nonce verification enabled when possible. This app hashes a nonce with
  `expo-crypto` and passes the digest to Google + the raw nonce to
  `signInWithIdToken`. Local CLI already sets `skip_nonce_check = true` under
  `[auth.external.google]` for emulator convenience; production should prefer
  nonce validation unless a provider limitation forces Skip nonce check.

### 5. Rebuild the Android binary

Native Google Sign-In requires a development or store build (not Expo Go):

```bash
cd mobile
npx expo prebuild --platform android
npx expo run:android
# or EAS: eas build --platform android --profile preview|production
```

### 6. Verify on device

1. Open Auth → Continue with Google
2. Confirm the **system account drawer / Credential Manager sheet** appears (not a browser tab)
3. Complete sign-in and confirm a Supabase session is created
4. Confirm Apple (iOS) and email/password still work

---

## #270 — OAuth branding (visible app name)

### What users see today

`npm run verify:google-branding` (with `SKIP_MARKETING_CHECK=1` if the deployed
marketing HTML is briefly stale) currently reports:

- Google OAuth **visible app name**: `SharedMoney`
- Google OAuth **redirect_uri host**: `xesuklogveedeppxbbit.supabase.co`

So brand verification for the consent heading is working. The remaining sketchy
signal is the Supabase callback host on the OAuth request, which Google still
shows in some UI chrome even when the app name is `SharedMoney`.

### In-repo requirements (this repo)

1. Marketing home page first viewport H1 must be exactly `SharedMoney`
   (`web/src/seo-content.json`, enforced by `npm run verify:google-branding` and
   `web` SEO tests). Deploy the web workspace after changing it.
2. Keep Google Auth Platform branding name = `SharedMoney`
3. Application home page = `https://sharedmoney.app`
4. Privacy policy = `https://sharedmoney.app/privacy`
5. Domain `sharedmoney.app` verified in Search Console / Auth Platform authorized domains
6. Branding submitted, **verified**, and **published** in Google Auth Platform
   (unverified brands fall back to the project / callback host)

### Owner-only optional hardening (custom auth domain)

To stop showing `*.supabase.co` on the OAuth redirect host:

1. Supabase Pro / custom domain add-on for project `xesuklogveedeppxbbit`
2. DNS:
   - `auth.sharedmoney.app` CNAME → `xesuklogveedeppxbbit.supabase.co.`
   - `_acme-challenge.auth.sharedmoney.app` TXT → value from `supabase domains create`
3. `supabase domains create|reverify|activate`
4. Add `https://auth.sharedmoney.app/auth/v1/callback` to the Web OAuth client
5. Point the app at `EXPO_PUBLIC_SUPABASE_URL=https://auth.sharedmoney.app` and redeploy
6. Re-run:

```bash
EXPECTED_SUPABASE_AUTH_HOST=auth.sharedmoney.app npm run verify:google-branding
```

### Verification commands

```bash
# Full check (marketing H1 + Google visible brand)
npm run verify:google-branding

# Compare against Statements AI (known-good branded consent screen)
SHAREDMONEY_APP_URL=https://statements-ai.app \
SHAREDMONEY_MARKETING_URL=https://statements-ai.app \
EXPECTED_GOOGLE_BRAND="Statements AI" \
SKIP_MARKETING_CHECK=1 \
npm run verify:google-branding
```

---

## Related docs

- `TECH.md` → Google OAuth Setup
- `web/DESIGN.md` → Google OAuth branding note
- `docs/APPLE_APP_REVIEW.md` → Apple Sign In (unchanged by this work)
