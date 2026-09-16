# PR #299 — Today refined Phase 1 walkthrough

## Mobile screenshots — BLOCKED on this Cloud Agent VM

Required: portrait **iOS Simulator / Android emulator / Expo Go** shots of group transaction scenarios.

This Cursor environment cannot capture them:

| Requirement | Status on this VM |
|-------------|-------------------|
| iOS Simulator (Xcode / `simctl`) | **Missing** — Linux host, no Xcode |
| Android emulator (`adb` / SDK / AVD) | **Missing** — no `ANDROID_HOME`, no SDK |
| Expo Go on a physical device | **Unavailable** — no device bridge from this agent |

Do **not** treat the earlier Expo web PNGs as founder review evidence. Product owner: mobile only.

### Needed mobile shots (when a Mac/Android agent or local device can run the app)

| File (proposed) | Surface |
|-----------------|--------|
| `mobile-01-home.png` | Multi-member group home: expenses + payment row; non-zero My spending / Group summary |
| `mobile-02-ledger.png` | Transactions ledger (expense + payment, filters) |
| `mobile-03-expense-detail.png` | Existing shared expense edit (who paid, equal split) |
| `mobile-04-balances.png` | Balances after activity (no settle CTAs on rows) |
| `mobile-05-settle.png` | Settle form and/or ledger after recorded settlement |

## Craft fixes landed (code)

- Solo empty: single primary **Add people** via FAB; card keeps ghost **Add expense anyway** only
- Populated preview data: `groupStats` totals aligned with listed expenses (fixes $0 spending in preview)

Legacy web preview PNGs below (if present) are **not** acceptable for visual sign-off.
