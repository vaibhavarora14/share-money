# Apple App Store Review & Approval Guide for SharedMoney

This guide contains everything required to submit **SharedMoney** to the Apple App Store, pass App Review without rejection, and configure App Store Connect accurately.

---

## 1. App Review Information (App Store Connect)

When submitting an app update or new version in **App Store Connect -> iOS App -> App Review Information**, configure the following fields:

### Sign-In Required
- **Checkbox**: Checked (`Yes`)
- **Username**: `charlie@test.com`
- **Password**: `testpassword123`

> [!IMPORTANT]
> **Pre-populate the Demo Account with Sample Data!**
> Do not provide an empty demo account. Apple reviewers test within 3–5 minutes. If they see an empty dashboard with 0 groups and 0 expenses, they may flag the app under **Guideline 2.1 (App Completeness)**.
> Before submitting, log into this demo account once and create:
> 1. A group named **"Tahoe Weekend Trip"** with 3 members.
> 2. Two expenses: e.g. "Cabin Rental" ($600, split 3 ways) and "Groceries" ($120, split 3 ways).
> 3. One settlement recorded: e.g. "Alex settled with Reviewer" ($200).
> 4. Ensure balances show non-zero amounts so graphs, tabs, and settlement lists populate immediately.

---

### Notes for Reviewer (Copy & Paste directly into App Store Connect)

```text
Dear Apple App Review Team,

Thank you for reviewing SharedMoney! Below is helpful context to assist in your testing:

1. ABOUT THE APP:
SharedMoney is a shared expense ledger and debt tracking app (similar to Splitwise). Friends, roommates, and travel groups use it to keep track of shared group costs, see who owes who, and agree on balances.

2. FINANCIAL & PAYMENT CLARIFICATION (Guidelines 3.1.1 & 3.1.5):
SharedMoney is strictly a ledger and bookkeeping tool. The app does NOT process financial transactions, transfer money, connect to bank accounts, or store credit card data. All payments and settlements occur in the real world outside the app using the users' own external methods (cash, bank transfers, etc.). When a member settles up in real life, users record the settlement in SharedMoney to update the group ledger. No digital goods, paid unlocks, or digital services requiring In-App Purchase (StoreKit) are offered.

3. HOW TO TEST:
• Log in using the provided demo account credentials.
• You will see existing groups (e.g., "Tahoe Weekend Trip"). Tap into a group to review shared expenses, individual splits, and member balances.
• Tap "+" at the bottom right to add a new shared expense or record a settlement.
• Tap the currency / balance summary to view cross-currency conversions and settlements.

4. USER-GENERATED CONTENT (UGC) & SAFETY CONTROLS (Guideline 1.2):
SharedMoney complies fully with UGC guidelines:
• All users agree to our Community Rules and Terms of Use during onboarding (https://sharedmoney.app/terms), which mandate zero tolerance for objectionable content or harassment.
• Beside every activity feed item and group member, tap the 3-dot menu to access "Report objectionable content" or "Block user".
• Submitting a report immediately flags the item to the moderation queue for review within 24 hours.
• Blocking a user immediately removes their activity and content from the user's feed.

5. ACCOUNT DELETION (Guideline 5.1.1(v)):
Users can delete their account directly within the app at any time:
• Tap the profile avatar in the top right of the Groups screen to open Profile & Settings.
• Scroll to the bottom "Account Actions" section and tap "Delete Account".
• A confirmation alert will appear. Confirming permanently closes the account, anonymizes past ledger records, and signs out.

6. CONTACT:
If you have any questions or need anything further during review, please contact:
Vaibhav Arora — varora1406@gmail.com
```

---

## 2. App Privacy (Nutrition Labels)

In **App Store Connect -> App Privacy**, Apple asks about data collection. Answer the questions as follows:

### "Do you or your third-party partners collect data from this app?"
Select **Yes**.

### Data Types Collected:

| Data Type | Purpose | Linked to User? | Used for Tracking? |
| :--- | :--- | :--- | :--- |
| **Contact Info: Name** | App Functionality (displaying who paid / split) | **Yes** | **No** |
| **Contact Info: Email Address** | App Functionality, Account Management | **Yes** | **No** |
| **Contact Info: Phone Number** | App Functionality (optional, for member identification) | **Yes** | **No** |
| **Financial Info: Other Financial Info** | App Functionality (user-entered expense amounts, balances, settlement records). *Note: NOT payment card or banking credentials.* | **Yes** | **No** |
| **User Content: Other User Content** | App Functionality (group names, expense descriptions, activity notes) | **Yes** | **No** |
| **Identifiers: User ID** | App Functionality (authentication and ledger association) | **Yes** | **No** |
| **Identifiers: Device ID** | App Functionality (push notifications token) | **Yes** | **No** |
| **Diagnostics: Crash Data & Performance Data** | Analytics, Diagnostics (Sentry crash reporting) | **No** | **No** |

### "Do you use any of this data for tracking purposes?"
Select **No** (SharedMoney does not display third-party advertisements or share data with data brokers).

### Privacy Policy URL:
`https://sharedmoney.app/privacy`

---

## 3. Age Rating Questionnaire

In **App Store Connect -> General -> App Information -> Age Rating**:
- **Medical/Treatment Info**: None
- **Gambling & Contests**: None
- **Simulated Gambling**: None
- **Sexual Content or Nudity**: None
- **Alcohol, Tobacco, or Drug Use**: None
- **Violence**: None
- **Profanity or Crude Humor**: None
- **Unrestricted Web Access**: No (embedded links open dedicated URLs)
- **User Interaction / UGC**: **Yes** (users can communicate via shared group expense descriptions and invitations)
- **Content Filtering / Moderation**: **Yes** (Terms of Use, blocking, reporting mechanism, developer moderation)

*Resulting Rating: Typically **4+** or **12+** (due to User Generated Content).*

---

## 4. App Store Metadata Reference

The metadata in `mobile/fastlane/metadata/en-US/` is synced as follows:

- **Name**: `SharedMoney: Split Expenses` (28/30 characters)
- **Subtitle**: `Split bills with groups` (24/30 characters)
- **Primary Category**: `Finance`
- **Secondary Category**: `Lifestyle` or `Utilities`
- **Keywords**: `split bills,expenses,roommates,trips,friends,group costs,settle debts` (70/100 characters)
- **Support URL**: `https://sharedmoney.app/support`
- **Marketing URL**: `https://sharedmoney.app`
- **Privacy Policy URL**: `https://sharedmoney.app/privacy`

---

## 5. Technical Verification & Build Checklist

Before running `eas submit --platform ios`:

- [x] **In-App Account Deletion**: `ProfileSetupScreen.tsx` has "Delete Account" button with destructive confirmation dialog wired to `/delete-account`.
- [x] **Sign in with Apple Ordering**: `AuthScreen.tsx` displays Sign in with Apple first on iOS, fulfilling Guideline 4.8 & HIG prominence.
- [x] **Legal Links**: Terms of Use (`https://sharedmoney.app/terms`) and Privacy Policy (`https://sharedmoney.app/privacy`) are accessible inside Settings.
- [x] **UGC Safety Controls**: EULA terms screen before sign-in, report modal, block user functionality, 24-hour moderation policy published.
- [x] **Encryption Exemption**: `ITSAppUsesNonExemptEncryption: false` configured in `app.config.js` (skips export compliance review).
- [ ] **Apple Developer Capabilities**:
  - `com.vaibhavarora.sharemoney` has **Sign in with Apple** enabled in Apple Developer Portal.
  - `com.vaibhavarora.sharemoney` has **Push Notifications** enabled in Apple Developer Portal.
- [ ] **Supabase Auth Providers**:
  - Apple OAuth provider enabled in Supabase dashboard with Client ID `com.vaibhavarora.sharemoney`.
- [ ] **Physical iOS Device Test**:
  - Verify Apple Sign In completes smoothly.
  - Verify push notifications prompt behaves as expected (primer -> system prompt).
  - Verify Account Deletion prompt works as expected.
