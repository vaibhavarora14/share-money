# Mobile store-note audit

`mobile-store-history.json` records the exact Google Play release notes and
TestFlight **What to Test** text observed for SharedMoney releases.

`testflight-pointer-plan.json` records the exact, approved-shape TestFlight
text prepared before the historical cleanup Save actions. It is intentionally
iOS-only; Android and iOS release-note scratch text must stay in separate files.

For every store-note change:

1. Draft separate Play and TestFlight bullet text.
2. Use 2–5 short customer-benefit `• ` bullets for Play.
3. Use 2–6 short imperative testing `• ` bullets for TestFlight.
4. Save the text on the exact track/build.
5. Start a fresh store read and compare the persisted text exactly.
6. Mark a record `verified` only after that read succeeds.

Historical releases that the store no longer allows editing stay in the ledger
as `unavailable`, with the observed text and a factual blocker. Never attach
their text to a newer editable release or claim that it was changed.

Run the audit validation with:

```bash
node --test scripts/release-notes/mobile-store-history.test.mjs
```
