# PR #296 walkthrough — force profile details after signup (#273)

Captured on Expo web (`localhost:8081` → production API) with `alice@test.com`, using the `__DEV__`-only `?qaProfileGate=` hook so product can review the gate without creating a throwaway incomplete account.

| Shot | File | What it shows |
|------|------|----------------|
| Required gate | `01_profile_gate_required.png` | Post-auth **Complete profile** screen: name required, phone optional, **Continue** only (no skip) |
| Skippable gate | `02_profile_gate_skippable.png` | Same gate for returning incomplete profiles with **Skip for now** |
| Edit profile | `03_edit_profile_completed.png` | Profile tab after completion — name persists (`Alice`) |

Also mirrored under `web/public/walkthrough/pr-296/` for static hosting when marketing web is deployed.

### Public HTTPS (Litterbox, ~72h)
- Required: https://litter.catbox.moe/ew1fmc.png
- Skippable: https://litter.catbox.moe/4yywfb.png
- Edit profile: https://litter.catbox.moe/lhje68.png
