# PR #299 — native UI walkthrough

## Current split editor

Native iPhone 17 Pro captures from the local PR bundle and QA group (not Expo web):

| Capture | Verified behavior |
| --- | --- |
| [Equal — everyone](mobile-equal-all.png) | People chips directly on the form; Equal dropdown; no None or unnecessary bulk action. |
| [Equal — subset](mobile-equal-subset.png) | Deselecting a person reveals Select all; each-person amount recalculates. Selecting all restores everyone and hides the action. |
| [Amounts](mobile-amounts.png) | Every available person has a field, even after an empty Equal selection; no selection chips. |
| [Shares](mobile-shares.png) | Native mode switch shows all five available split rows with share controls and ₹2,500 total; no split-selection chips. The chips above belong to Who paid. |
| [Group home](mobile-group-home.png) | Populated viewer-relative debt card, My spending and Group summary; no People header chip. |
| [Group balances](mobile-group-balances.png) | Populated per-person group balances and paid/share breakdown; no settlement action on person rows. |

The Equal captures are from Edit Expense. The shared editor also renders in Add Expense. No transaction was saved during these native interaction checks.

## Product behavior

- Solo empty: Add people FAB is primary; Add expense anyway is one quiet text control.
- People lives in the group overflow, not alongside the group title.
- First expense defaults to you paid and equal split among active people. Existing remembered split defaults are preserved.
- Split method dropdown: Equal / Amounts / Shares, directly on the form. No Adjust split or Hide options.
- Only Equal has inclusion chips. Select all is shown only for a partial/empty selection. Empty Equal selection gets immediate “Select at least one person” feedback.
- Amounts and Shares always show every available person. Equal selection and other-mode drafts survive switching modes.
- New Amounts expenses require positive amounts for everyone. When editing an older unequal subset, blank previously excluded people remain visible as “Not included”; entering positive amounts adds them. Original participants cannot be silently removed by blank/zero/invalid amounts. Saved IDs match positive split rows. Shares remains 1–99 per person with positive rounded allocations.
- Home debt labels use viewer-involved settlement edges, not raw group net balances. Balance summaries aggregate separately per currency; currencies are never added without conversion.
- Balance person rows have no settlement action. Settlement remains on the Settle surface with outside-app payment copy.

## Verification

From the repository root:

```sh
node --test mobile/components/SplitAmongEditor.test.cjs mobile/components/Balances.test.cjs mobile/config/*.test.cjs
deno test --no-lock --allow-env --allow-read mobile/utils mobile/constants mobile/hooks/activityQuery.test.ts
deno test --no-lock --allow-env --allow-read supabase/functions/_shared/splits.test.ts
npx tsc --noEmit -p mobile/tsconfig.json
git diff --check
```

Latest local run: 46 Node tests passed; 186 mobile Deno tests and 6 backend split tests passed; TypeScript and diff check passed. Deno reports the existing workspace `overrides` warning.

The editor/form suite uses shallow native/Paper boundaries and real form handlers/calculation helpers. It covers all modes, mode switching, disabled controls, empty Equal selection, draft preservation, rounding, validation and save payloads. It does not replace native UI checks. Native Shares stepper interaction, Android, and full accessibility/device-size coverage are not claimed by these screenshots.

## Earlier evidence

The numbered `01-…05-…` PNGs are historical Expo web previews, not mobile sign-off evidence. They predate the final inline split changes.

No version bump, OTA, store submission, or production change belongs to this PR preparation.
