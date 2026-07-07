# ShareMoney — UI/UX Audit

Audit of the mobile app (`mobile/`) from a UI/UX perspective, grounded in the current code.
Every finding references the file(s) where it lives so it can be actioned directly.

**Status note:** All findings below have been addressed on this branch. The table records
what was found and how each item was resolved; the detail sections describe the original
problem for context.

---

## Summary (prioritized)

| # | Severity | Area | Finding | Status |
|---|----------|------|---------|--------|
| A1 | High | Auth | No Sign in with Apple — App Store Guideline 4.8 requires it when Google login is offered | Fixed — native flow on iOS, OAuth on web (see "Apple Sign-In Setup" in `TECH.md`) |
| A2 | High | Auth | No "Forgot password?" flow — users who forget their password are permanently locked out | Fixed — reset-link flow on `AuthScreen` + `UpdatePasswordScreen` for recovery links |
| G1 | High | Feedback | `Alert.alert` is a no-op on web — all validation/error feedback silently disappears in the web build | Fixed — `showAlert` wrapper (`utils/alert.ts`) renders a Paper Dialog on web via `AlertHost`; all call sites migrated |
| P1 | High | Privacy/trust | Sentry mobile replay captures unmasked text/images in a finance app | Fixed — `maskAllText`/`maskAllImages` now `true` |
| A4 | Medium | Auth | Sign-up shows no "check your email" guidance if email confirmation is enabled in production | Fixed — `signUp` reports `needsEmailConfirmation`; inline notice on the auth screen |
| A3 | Medium | Auth | Cancelling the Google OAuth sheet shows a "Sign In Failed" error alert | Fixed — cancellations return a typed `cancelled` result and are ignored |
| N1 | Medium | Layout | `BottomNavBar` doesn't respect the bottom safe-area inset (home-indicator iPhones, edge-to-edge Android) | Fixed — `useSafeAreaInsets().bottom` padding on the bar |
| G2 | Medium | Feedback | No pull-to-refresh on the groups list or group details | Fixed — `RefreshControl` on both screens, awaiting all data sources |
| X1 | Medium | Accessibility | Almost no accessibility labels/roles across the app; icon-only controls are unlabeled | Fixed — tab roles/state on bottom nav, labels on logout, password toggles, NEW badge; inline `HelperText` form errors |
| A5 | Medium | Auth/legal | No Terms/Privacy links at account creation, even though `docs/privacy.html` is shipped | Fixed — privacy-policy link on the auth screen (`constants/links.ts`) |
| O1 | Medium | Onboarding | Profile setup is never prompted after sign-up; `profile_completed` is tracked but unused | Fixed — once-per-session tappable banner on Groups until the profile is completed |
| N2 | Low/Med | Navigation | Logout is a single tap on an icon with no confirmation | Fixed — confirmation dialog (web-safe) |
| V1 | Low | Visual | Splash/adaptive-icon background (`#14B8A6` teal) clashes with the brand indigo/blue artwork | Fixed — background now `#322e8c`, matching the artwork's edge gradient |
| A6 | Low | Auth | Sign-up password field doesn't use `new-password` autofill hints; email has no format validation | Fixed — mode-aware `autoComplete`/`textContentType`, inline email/password validation |
| V2 | Low | Visual | "No description" filler text on group rows adds noise | Fixed — description line omitted when empty |
| C1 | Low | Code hygiene | `BottomNavBar` accepts `onLogoutPress` but never renders a logout item | Fixed — prop removed everywhere |

---

## What already works well

Worth calling out so it doesn't get regressed:

- **Consistent design system.** React Native Paper (MD3) is used everywhere with a coherent
  Google-flavored palette and `roundness: 16` (`mobile/theme.ts`). Typography uses Paper variants
  consistently rather than ad-hoc font sizes.
- **Dark mode** follows the system preference (`userInterfaceStyle: "automatic"`,
  `useColorScheme()` in `App.tsx`) and both palettes are fully specified.
- **Android hardware back is handled** on the nested screens (`TransactionFormScreen`,
  `GroupDetailsScreen`, `GroupStatsScreen`) despite the custom router — a common gap that this
  app avoids.
- **Empty states** are designed, not accidental (e.g. "No groups yet" with icon + CTA in
  `GroupsListScreen`).
- **Resilience UX:** auth session fetch has a 10s timeout with fallback sign-out, a 15s
  stuck-loading detector reports to Sentry, there is a global error boundary with a retry
  button, and a force-update modal for unsupported app versions.
- **Non-blocking feedback** for invite-link redemption via `InAppBanner` instead of dialogs.
- **Web build polish:** content is centered at `WEB_MAX_WIDTH` with a decorative background on
  wide screens; the app reads as intentional on desktop rather than a stretched phone app.
- **E2E coverage** (Maestro) exists for the auth and core money flows.

---

## Findings in detail

### Auth & onboarding

**A1 — No Sign in with Apple (High).**
`AuthScreen` offers email/password and Google only. Apple's App Store Review Guideline 4.8
requires an equivalent privacy-preserving login option (in practice, Sign in with Apple) in any
iOS app that offers third-party social login. This is a rejection risk on submission, and iOS
users increasingly expect the one-tap Face ID flow.
*Addressed in this PR:* native Apple sign-in on iOS (`expo-apple-authentication` +
`supabase.auth.signInWithIdToken`), OAuth fallback on web.

**A2 — No password recovery (High).**
There is no "Forgot password?" affordance anywhere, and `supabase.auth.resetPasswordForEmail`
is never called. A user who forgets their password has no path back into their account — in an
app that holds their shared-expense history, that is effectively data loss from their
perspective. Supabase supports this out of the box; the work is one screen plus a deep link for
the recovery redirect.

**A3 — Cancelling Google OAuth shows an error (Medium).**
`signInWithGoogle` in `mobile/contexts/AuthContext.tsx` returns
`new Error("Authentication was cancelled")` when the user dismisses the browser sheet, and
`AuthScreen.handleGoogleSignIn` surfaces that as a "Google Sign In Failed" alert. Backing out of
an auth sheet is a deliberate user action, not a failure; punishing it with a modal error is
hostile. *Addressed in this PR:* cancellations are now returned as a typed `cancelled` result
and the screen ignores them (for both Google and Apple).

**A4 — Silent sign-up when email confirmation is on (Medium).**
`handleSubmit` in `AuthScreen` treats a successful `signUp` as "nothing to do": no navigation,
no message. Locally `enable_confirmations = false` (`supabase/config.toml`), so a session
appears immediately — but if the hosted project enables email confirmation, tapping "Sign Up"
appears to do nothing at all (no session, no feedback), and the user is stranded on the form.
The screen should detect the no-session case and show a "Check your email to confirm your
account" state.

**A5 — No Terms/Privacy links at account creation (Medium).**
A privacy policy exists (`docs/privacy.html`, linked from the marketing site) but the sign-up
screen never references it. Both app stores expect a privacy policy to be reachable at the point
of account creation; a small "By continuing you agree to…" line under the buttons resolves this.

**A6 — Autofill hints and validation (Low).**
The password field uses `autoComplete="password"` in both modes; in sign-up mode it should use
`autoComplete="new-password"` (and `textContentType="newPassword"` on iOS) so password managers
offer to generate a strong password. Email is only checked for non-emptiness — a malformed email
currently round-trips to the server for rejection.

**O1 — Profile setup is never prompted (Medium).**
The DB tracks `profiles.profile_completed` (set by a trigger, flipped in `ProfileSetupScreen`),
but routing in `App.tsx` never uses it. A new user lands directly on Groups with no name set, so
they show up to other group members without a display name, and the avatar renders "?" until
they happen to discover the Profile tab. Either prompt once post-signup (skippable) or surface a
gentle banner on Groups until a name exists. Note: with Apple sign-in, the name is only provided
on *first* authorization — this PR captures it into user metadata automatically, which softens
this for Apple users.

### Feedback & state communication

**G1 — `Alert.alert` does nothing on web (High).**
There are ~24 `Alert.alert` call sites across 7 files (`AuthScreen`, `GroupDetailsScreen`,
`SettlementFormScreen`, `AddMemberScreen`, `TransactionFormScreen`, `CreateGroupScreen`,
`utils/errorHandling.ts`). React Native Web implements `Alert.alert` as a no-op, so on the web
build every validation message and error (including "Sign In Failed") vanishes silently —
the user taps a button and nothing visibly happens. The codebase already has the right
primitives for a fix: Paper's `Portal`+`Dialog` (already used elsewhere for confirmations) or
the existing `InAppBanner`. A single `showAlert` wrapper that delegates to `Alert.alert` on
native and a Dialog/Snackbar on web would fix all call sites at once.

**G2 — No pull-to-refresh (Medium).**
`RefreshControl` is not used anywhere. The groups list and group details refresh on navigation
triggers only; users on stale data (e.g. waiting for a friend's expense to appear) have no
standard gesture to refresh. React Query's `refetch` is already wired into these screens, so
attaching a `RefreshControl` is low-effort.

**P1 — Unmasked session replay in a finance app (High, privacy/trust).**
`Sentry.mobileReplayIntegration({ maskAllText: false, maskAllImages: false })` in
`mobile/App.tsx` ships amounts, emails, names, and phone numbers into Sentry replays. The code
comment acknowledges this is temporary, but it's a trust/compliance issue for production, and
replays sample 10% of *all* sessions, not just errored ones. Flip to masked-by-default before
broader rollout.

### Navigation & layout

**N1 — Bottom nav ignores the bottom safe-area inset (Medium).**
`BottomNavBar` uses a fixed `height: 80` with `paddingBottom: 0`, and it is rendered outside the
screens' `SafeAreaView`s. On home-indicator iPhones and on Android with `edgeToEdgeEnabled: true`
(set in `app.config.js`), the tab labels sit in/near the system gesture area. Use
`useSafeAreaInsets().bottom` as extra padding.

**N2 — One-tap logout with no confirmation (Low/Medium).**
Logout is a single tap on the error-colored icon in the Profile app bar
(`ProfileSetupScreen`). It sits next to the screen title where accidental taps happen, and there
is no confirmation. A simple confirm dialog (Paper `Dialog`, web-safe) is enough.

### Accessibility

**X1 — Accessibility support is minimal (Medium).**
A grep across `mobile/` finds ~12 `accessibility*` props, mostly in `VersionDisplay`.
Notable gaps:
- Icon-only controls with no labels: the logout `Appbar.Action`, the password show/hide eye
  toggle, the group-options menu trigger.
- `BottomNavBar` tabs are `TouchableRipple`s with no `accessibilityRole="tab"` /
  `accessibilityState={{ selected }}`, so screen readers announce them as plain text.
- The "NEW" group badge is purely visual; screen-reader users don't hear it.
- Form errors are alert-based (invisible to web users, see G1) rather than associated with
  fields via `HelperText`, which Paper supports.
Color contrast is broadly fine (MD3 pairings are used correctly in both themes).

### Visual consistency

**V1 — Splash color doesn't match the brand (Low).**
`app.config.js` sets the splash and Android adaptive-icon background to `#14B8A6` (teal), while
the app brand color is `#1a73e8` (blue). Cold start flashes teal → blue-themed UI, which reads
as unpolished.

**V2 — "No description" filler (Low).**
`GroupsListScreen` renders the literal string "No description" for groups without one. Omitting
the line (or showing member count instead) is cleaner than filler text.

**C1 — Dead `onLogoutPress` prop (Low, code hygiene).**
`BottomNavBar` declares and receives `onLogoutPress` from every call site in `App.tsx` but never
renders a logout item. Either remove the prop or add the item; today it's misleading to readers.

---

## Follow-ups worth considering (beyond this audit's scope)

All audit findings are resolved; these adjacent improvements surfaced during the work and
could be picked up later:

- Replace the custom state-based router with React Navigation or Expo Router for state
  restoration, typed routes, and web URLs per screen.
- Skeleton loaders instead of spinners on the groups list and group details.
- Haptic feedback (`expo-haptics`) on primary actions (settle up, create expense).
- A full VoiceOver/TalkBack QA pass on device — the label/role sweep here fixed the known
  gaps, but only a device pass proves the flows read sensibly end to end.
