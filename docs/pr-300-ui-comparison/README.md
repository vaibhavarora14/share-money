# SharedMoney UI comparison gallery

## PR #300: compact settled status

The only product change in #300 is the settled-status presentation. Before: a full-width card. After: approved option A, a slim left-aligned check and text above the summaries. Financial logic and amounts are unchanged.

![Before light, after light, after dark](settled-before-after.png)

| Before — native iOS | After — native iOS | After — dark iOS |
|---|---|---|
| ![Full-width settled card](before-settled-light.png) | ![Compact inline status](after-settled-light.png) | ![Compact status in dark mode](after-settled-dark.png) |

The before and after captures show the same populated QA group and summary amounts. Capture times, relative dates and scroll visibility differ. There is no historical dark-mode baseline here. The existing notification error overlay remains visible in some captures; it is not fixed by this PR. Images are not retouched to hide it.

## Previously implemented UI: PR #299

These images document earlier work already merged in #299, not additional product changes in #300.

### Settlement participant controls

| Earlier record form | Later edit form with participant chips |
|---|---|
| ![Earlier record-settlement form](before-settlement-form.png) | ![Edit settlement with From and To chips](settlement-chips.png) |

**Different modes and records:** the earlier image is obligation recording; the later image is editing. This is a UI evolution illustration, not an equivalent-state regression comparison. Fixed-party creation restrictions remain intentional; edit-only controls must not be inferred to appear in every creation mode.

### Navigation

| Earlier currency header — no visible back arrow | Currency header with explicit arrow | Add Expense with explicit arrow |
|---|---|---|
| ![Earlier currency screen](before-currency.png) | ![Currency back arrow](currency-arrow.png) | ![Expense back arrow](expense-arrow.png) |

The expense capture intentionally includes its keyboard and does not show the entire form. Currency settings content is otherwise unchanged in this comparison.

### Inline expense splitting — historical native iOS captures

| Equal — all | Equal — subset |
|---|---|
| ![Equal all participants](../pr-299-walkthrough/mobile-equal-all.png) | ![Equal participant subset](../pr-299-walkthrough/mobile-equal-subset.png) |

| Amounts | Shares |
|---|---|
| ![Always-visible amount fields](../pr-299-walkthrough/mobile-amounts.png) | ![Always-visible share fields](../pr-299-walkthrough/mobile-shares.png) |

These show the shared inline split editor. Equal captures use Edit Expense, not Add Expense. They predate #300 and do not establish new save/persistence testing.

| Earlier populated group home | Group balances |
|---|---|
| ![Earlier native group home](../pr-299-walkthrough/mobile-group-home.png) | ![Native balances overview](../pr-299-walkthrough/mobile-group-balances.png) |

## Design reference — not native evidence

Owner selected **A** from this option board. The board's original recommendation badge on B is not the selected design.

![Settled layout options A B C](design-options.png)

## Original web previews — historical, superseded

These are the earlier Expo web proposals, **not screenshots of the old production app** and not mobile acceptance evidence. Use them to understand the evolution, not as equivalent-state before shots.

| Empty home | Populated home |
|---|---|
| ![Historical web empty home](../pr-299-walkthrough/01-empty-home.png) | ![Historical web populated home](../pr-299-walkthrough/02-populated-home.png) |

| Add expense | Balances | Settle |
|---|---|---|
| ![Historical web expense](../pr-299-walkthrough/03-add-expense.png) | ![Historical web balances](../pr-299-walkthrough/04-balances.png) | ![Historical web settle](../pr-299-walkthrough/05-settle.png) |

## Scope and provenance

- 20 original screenshots/design images are linked here: nine newly uploaded and eleven already in the repository; one additional assembled before/after board.
- New images were copied losslessly from the local QA/design evidence. The board only resizes and labels three original screenshots.
- Synthetic local-QA participants and data; no credentials, auth screens, device home screens or failed capture attempts included.
- Historical debug/accessibility experiment captures and duplicates are excluded from this product gallery. No full accessibility or new Android certification is claimed.
- Current local checks: 89 Node tests, TypeScript and diff checks pass. Independent source review found no blockers. Native light and dark settled-state appearances were inspected.
- This documentation upload does not merge the PR or resume the paused release.
