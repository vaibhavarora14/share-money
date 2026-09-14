# PR #289 visual evidence — payments in Transactions ledger

Captured on Expo web (`localhost:8081` → production API) with `alice@test.com` in **Summer Vacation 2024**.

| File | What it shows |
|------|----------------|
| `01_transactions_mixed_expense_payment.png` | Transactions tab, All filter, mixed Expense + Payment rows with type chrome; My Spending ₹26,375.25 / Group summary ₹105,501.00 |
| `02_transactions_payments_filter.png` | Payments filter — settlement-only list |
| `03_payment_tap_to_edit.png` | Tap payment → Edit Settlement form |
| `04_transactions_expenses_filter.png` | Expenses filter |

## Spend totals ignore payments

Backend `group_stats` for this group (expenses only):

- `my_share.INR` = **26375.25** (matches My Spending card)
- `group_total.INR` = **105501** (matches Group summary card)

Settlements in the same group sum to **₹379,191.75 + $250** and are **not** included in those spend cards (Tricount pattern). Balances / settle-up still reflect settlements.
