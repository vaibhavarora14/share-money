# Mobile store submission policy

Android builds always go to **Google Play Internal testing first**.

- `eas submit --profile production` is intentionally mapped to the `internal`
  Play track, because EAS selects `production` by default when it exists.
- `eas submit --profile internal` also targets Internal testing.
- Only `eas submit --profile store` targets the public Play Production track.
  Use it only after an Internal testing release has been reviewed.

For iOS, both `production` and `internal` submit profiles upload the build to
App Store Connect/TestFlight; the Android track distinction does not apply.

## Transaction notification release gate

Remote push must be verified in an Expo development, internal, or production
build; Expo Go is not an eligible test runtime. Before submitting either store
build, confirm all of the following outside source control:

- EAS has a valid FCM V1 service account for Android and APNs key/certificate
  for iOS (`eas credentials`).
- Supabase Edge Function secrets include `NOTIFICATION_WORKER_SECRET` and, when
  enhanced Expo push security is enabled, `EXPO_ACCESS_TOKEN`.
- Supabase Vault contains `notification_worker_function_url` (the deployed
  `/functions/v1/notification-worker` URL) and `notification_worker_secret`
  matching `NOTIFICATION_WORKER_SECRET`.
- The `notifications` and `notification-worker` functions are deployed after
  the notification migrations. Immediate pg_net wake-up and the minute cron
  fallback should both appear in Supabase logs without exposing secret values.

On one physical iOS device and one Google Play-capable Android device, verify:

1. The primer does not trigger the OS prompt until **Turn on notifications**.
2. One unread event shows actor/group/impact detail and opens its inbox detail.
3. A second event replaces the tray entry with the total unread count and opens
   the inbox.
4. Foreground, background, terminated, denial/settings recovery, logout, token
   rotation, and `DeviceNotRegistered` cleanup behave as documented.
5. The durable inbox remains correct when push is disabled or delivery fails.

Record the build numbers, device/OS versions, Expo ticket/receipt outcome, and
screenshots for light/dark inbox, detail, permission, and group indicators in
the release evidence. Browser push is intentionally outside this release.
