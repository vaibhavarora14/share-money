# PR #282 visual evidence — summary cards vs pagination

Captured on the PR branch (Expo web → production API) with `alice@test.com` in **Summer Vacation 2024**.

Transaction page size was temporarily set to `3` only for this capture so “Load more” could be exercised on a 7-expense group; production page size remains `30`.

| File | What it shows |
|------|----------------|
| `01_dashboard_my_spending_group_summary_before_pagination.png` | Group dashboard with **My Spending** ₹26,375.25 and **Group summary** ₹105,501.00 (backend `group_stats`) |
| `02_dashboard_same_totals_after_load_more.png` | Same cards after loading more transactions — totals unchanged |
| `03_group_summary_stats_detail.png` | Group Summary detail screen (same group total) |

Also mirrored under `web/public/walkthrough/pr-282/` for GitHub contents API / static hosting.
