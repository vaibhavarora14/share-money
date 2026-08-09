# Mobile store submission policy

Android builds always go to **Google Play Internal testing first**.

- `eas submit --profile production` is intentionally mapped to the `internal`
  Play track, because EAS selects `production` by default when it exists.
- `eas submit --profile internal` also targets Internal testing.
- Only `eas submit --profile store` targets the public Play Production track.
  Use it only after an Internal testing release has been reviewed.

For iOS, both `production` and `internal` submit profiles upload the build to
App Store Connect/TestFlight; the Android track distinction does not apply.
