# SharedMoney acquisition runbook

SharedMoney’s first 90-day organic message is: **move a Splitwise group without
leaving its expense history behind.** The database is the source of truth for
activation; PostHog is used for anonymous funnel and campaign analysis only.

## Success definition

| Metric | Definition | Day-90 monthly target |
| --- | --- | ---: |
| Qualified visit | An organic, community, referral, or store visit to a tracked landing page | 300 |
| Activated group | A group whose `activated_at` was set for the first Splitwise import or manual expense | 30 |
| Completed Splitwise import | A `splitwise_imports` record with `status = 'completed'` | 10 |
| CTA click rate | `acquisition cta clicked / acquisition landing viewed` | at least 8% |
| Signup completion | `signup completed / signup started` | at least 50% |
| Activation rate | Activated groups / completed signups | at least 30% |
| Migration completion | `migration completed / migration started` | at least 60% |

Use the group ID only inside the product database when reconciling these
figures. Do not send it, member details, CSV contents, amounts, currencies,
expense descriptions, names, or email addresses to PostHog.

## Week-one baseline

An owner with Search Console access should record a snapshot before the first
SEO deployment and every Monday afterwards. For each 28-day and 7-day range,
export:

- clicks, impressions, CTR, and average position by page, query, country, and
  device;
- index coverage and canonical selection for the homepage, India alternative
  page, global alternative page, and import guide;
- whether every query is branded (contains “sharedmoney”) or non-branded.

Put the current baseline at the top of the opportunity backlog: **9
impressions, 0 clicks, average position 28.7; homepage only**. The sitemap was
new at the time of that baseline, so it is not yet a channel verdict.

## Opportunity backlog

Keep one row per opportunity and update it after every weekly review.

| Query or idea | Intent | Target page | Competing result / user evidence | Status | Impressions | Clicks | CTA rate | Activated groups |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: |
| splitwise alternative india | Commercial migration | `/in/splitwise-alternative` | First-page audit + interviews | Live |  |  |  |  |
| import splitwise csv | How-to migration | `/guides/import-from-splitwise` | First-page audit + importer support issues | Live |  |  |  |  |
| splitwise alternative for trips | Use-case migration | `/trip-expense-splitter` | Search Console demand only | Watch |  |  |  |  |
| splitwise alternative for roommates | Use-case migration | `/roommate-expense-tracker` | Search Console demand only | Watch |  |  |  |  |

Audit these searches manually in India before publishing another page:
`splitwise alternative india`, `free splitwise alternative`, `apps like
splitwise`, `import splitwise csv`, `switch from splitwise`, `splitwise
alternative for trips`, and `splitwise alternative for roommates`. Capture
the searcher intent, page format, title, proof, screenshots, and missing
information—not copied competitor wording.

## Interview script

Run ten 20-minute conversations in weeks 1–2: five active Splitwise users,
three recent switchers, and two SharedMoney users. Ask:

1. What triggered the search for another expense app?
2. What type of group was involved: trip, roommates, couple, dinner, or other?
3. What history must survive a switch?
4. What would make a CSV import feel unsafe or incomplete?
5. Which group members are hardest to bring along?
6. What caused the group to adopt or reject the alternative?

Record only consented, summarized notes. Add the finding—not the person’s name
or contact details—to the backlog.

## Claims register

Publish only claims in the first table. The second table is deliberately
blocked until the product owner validates a durable policy or capability.

| Claim | Status | Evidence / safe wording |
| --- | --- | --- |
| Splitwise group CSV import | Approved | “Import a Splitwise group CSV and review the result.” |
| CSV is parsed locally before review | Approved | The guided importer parses the selected file locally; only the confirmed normalized import is sent. |
| Payments happen outside SharedMoney | Approved | “Track the ledger; settle using the payment method your group prefers.” |
| INR tracking and UPI settlement outside the app | Approved | “Track INR expenses; settle through the UPI app your group already uses.” |
| Currencies are separate | Approved | “SharedMoney does not automatically convert currencies.” |
| Free | Approved | Current product documentation supports “free.” |
| No limits | Blocked | Do not publish without a durable product policy. |
| No ads | Blocked | Do not publish without a durable product policy. |
| Automatic currency conversion | Blocked / false | Do not imply it; currencies remain separate. |
| Native iOS app | Blocked / false | Describe iOS access as web access unless a native release exists. |

Use “Splitwise” descriptively and show “SharedMoney is not affiliated with or
endorsed by Splitwise” on comparison and migration pages.

## Funnel instrumentation

The web and app use the same PostHog project. Keep autocapture, touch capture,
and session replay disabled. Only these named events are permitted:

- `acquisition landing viewed`
- `acquisition cta clicked`
- `signup started`, `signup completed`
- `migration started`, `splitwise csv parsed`,
  `migration mapping completed`, `migration completed`
- `group activated`
- `invite link created`, `member joined`
- `group day 7 active`

First-touch context contains only source, medium, campaign, optional content,
landing path, optional referrer host, intent, and capture time. It expires
after 30 days in the app and is persisted with the group for reconciliation.

`group activated` is emitted only when the database changes a group from
unactivated to activated. Imports do this on a completed import; manual
expenses do it only on the first qualifying expense. For day-7 retention,
create a weekly warehouse/PostHog cohort job after deployment: select groups
activated 7 days earlier that have a later expense, settlement, member join,
or group visit according to the agreed product definition, then emit one
`group day 7 active` event per qualifying group. This job needs the owner’s
PostHog credentials and is intentionally not embedded in the client.

## Weekly operating loop

1. Reconcile database activation/import totals with PostHog by campaign.
2. Review 28-day versus 7-day Search Console data and update the backlog.
3. Improve pages ranked 8–30 with clearer examples, screenshots, and internal
   links.
4. Test title and description when a page ranks at most 10 with CTR below 2%.
5. Pause new content and fix onboarding if activation is below 20%.
6. Prioritize importer errors and mapping friction if migration completion is
   below 50%.
7. Reassess intent, rather than creating variants, when an indexed page has no
   impressions after 28 days.

At days 30, 60, and 90, keep only pages and channels producing activated groups
or a clear leading indicator.

## Distribution cadence

- Publish one research-backed guide or substantial refresh every two weeks.
- Post two useful, transparent responses per week in allowed India, travel,
  roommate, or personal-finance communities. Lead with an import walkthrough
  or calculator and disclose the founder relationship.
- Publish one consented, first-hand migration case study each month: group
  type, how long it took, what imported, and what was skipped.
- Contact three college clubs, group-trip organizers, co-living communities,
  or finance creators weekly. Offer a migration walkthrough, not paid
  promotion.
- Keep alternative-directory listings and screenshots consistent with the
  verified claims register.

Do not mass-produce location or keyword pages, incentivize reviews, or put
names or amounts into a calculator’s shared URL.

## Deployment and account-owner checklist

Before distribution:

1. Apply the growth migration and deploy the groups, transactions, and
   import-splitwise edge functions.
2. Deploy web and mobile builds; a native rebuild is required after adding the
   Expo PostHog-related packages.
3. Configure `VITE_POSTHOG_KEY` for the web and
   `EXPO_PUBLIC_POSTHOG_KEY` for the mobile app. Without these keys, named
   analytics events stay safely disabled.
4. Request indexing in Search Console for `/in/splitwise-alternative`,
   `/splitwise-alternative`, and `/guides/import-from-splitwise`.
5. Verify rendered HTML, canonical selection, sitemap discovery, and live
   named events. Confirm that test analytics payloads contain no CSV data,
   financial values, names, emails, or descriptions.
6. Update the Google Play listing with truthful emphasis on “split expenses,”
   “group expense tracker,” trips, roommates, and Splitwise CSV migration.
   Use screenshots showing import, balances, INR, and invite sharing.
7. Ask for a Play Store review only after a successful import or repeated
   successful use; never offer an incentive.

After deployment, run Lighthouse on the three cornerstone pages. The release
gate is performance at least 90 and accessibility and SEO at least 95, without
canonical or redirect regressions.
