export type SeoPage = {
  path: string;
  title: string;
  description: string;
  keywords: string;
  eyebrow: string;
  heading: string;
  body: string;
  proof: string[];
};

export const siteUrl = "https://sharedmoney.app";
export const appUrl = `${siteUrl}/app`;
export const brandName = "SharedMoney";
export const tagline = "SharedMoney";

export const seoPages: SeoPage[] = [
  {
    path: "/",
    title: "SharedMoney - Split Bills and Track Group Expenses",
    description:
      "SharedMoney helps friends, roommates, and travel groups split bills, track shared expenses, and see who owes who without handling payments.",
    keywords:
      "split bills, group expense tracker, shared expense tracker, who owes who, split expenses app",
    eyebrow: "Shared expenses",
    heading: tagline,
    body:
      "SharedMoney helps groups split bills, track shared expenses, and know who owes who. Keep one shared ledger for trips, roommates, dinner groups, and everyday shared costs while payments stay in your preferred payment app.",
    proof: ["Trip and roommate ledgers", "Currency-specific balances", "No bank link or payment handling"],
  },
  {
    path: "/split-bills",
    title: "Split Bills Online with Friends | SharedMoney",
    description:
      "Split bills with friends and keep every expense, payer, participant, and balance visible in one shared ledger.",
    keywords:
      "split bills, split bills with friends, bill splitting app, split expenses online",
    eyebrow: "Split bills",
    heading: "Split bills without losing the thread.",
    body:
      "Add the payer, choose who joined, adjust the split, and keep the final balance readable for everyone in the group.",
    proof: ["Equal and uneven splits", "Clear payer history", "Simple settlement records"],
  },
  {
    path: "/group-expense-tracker",
    title: "Group Expense Tracker for Friends and Families | SharedMoney",
    description:
      "Track group expenses for shared plans, homes, meals, and recurring costs with clear balances for every member.",
    keywords:
      "group expense tracker, shared expense tracker, group spending tracker, shared ledger app",
    eyebrow: "Group expense tracker",
    heading: "One group ledger everyone can read.",
    body:
      "SharedMoney keeps group costs organized by member, currency, and activity so every person can see what changed and what remains open.",
    proof: ["Member balances", "Expense activity", "Shared group history"],
  },
  {
    path: "/trip-expense-splitter",
    title: "Trip Expense Splitter for Travel Groups | SharedMoney",
    description:
      "Split hotels, rides, food, tickets, and travel costs with a trip expense splitter built for changing payers and mixed currencies.",
    keywords:
      "trip expense splitter, travel expense splitter, vacation expense tracker, split travel costs",
    eyebrow: "Trip expense splitter",
    heading: "Split the trip while the trip keeps moving.",
    body:
      "Hotels, rides, meals, tickets, and local purchases stay in one travel ledger, even when different people pay across the trip.",
    proof: ["Travel group balances", "Multiple currencies shown separately", "Fewer end-of-trip arguments"],
  },
  {
    path: "/roommate-expense-tracker",
    title: "Roommate Expense Tracker for Rent and Utilities | SharedMoney",
    description:
      "Track rent, utilities, groceries, subscriptions, and shared household costs with roommate balances that stay easy to review.",
    keywords:
      "roommate expense tracker, split rent app, split utilities, household expense tracker",
    eyebrow: "Roommate expenses",
    heading: "Roommate costs, kept calm.",
    body:
      "Rent, electricity, groceries, and household supplies can be tracked as they happen, so no one has to reconstruct the month later.",
    proof: ["Monthly shared costs", "Household member balances", "Settlement history"],
  },
  {
    path: "/splitwise-alternative",
    title: "Splitwise Alternative for Shared Expenses | SharedMoney",
    description:
      "Looking for a Splitwise alternative? SharedMoney gives groups a simple shared ledger, clear balances, and payment-free settlement tracking.",
    keywords:
      "Splitwise alternative, free Splitwise alternative, shared expense app, expense splitting app",
    eyebrow: "Splitwise alternative",
    heading: "A simple Splitwise alternative for clear group balances.",
    body:
      "SharedMoney focuses on the shared record: who paid, who joined, what remains open, and when a balance was settled outside the app.",
    proof: ["Splitwise CSV import", "No payment instruments stored", "Free shared expense tracking"],
  },
  {
    path: "/in/splitwise-alternative",
    title: "Splitwise Alternative India for Friends and Trips | SharedMoney",
    description:
      "SharedMoney is a Splitwise alternative for India-focused groups that track trip, roommate, and dinner expenses while settling outside the app.",
    keywords:
      "Splitwise alternative India, split expenses India, split bills India, group expense tracker India",
    eyebrow: "India groups",
    heading: "Split expenses in India, then settle your way.",
    body:
      "Track INR group expenses for trips, roommates, and dinner plans. When the balance is clear, settle in your preferred payment app and record it in SharedMoney.",
    proof: ["INR-friendly examples", "UPI can happen outside the app", "Trip and roommate use cases"],
  },
];

export const pageByPath = new Map(seoPages.map((page) => [page.path, page]));

export function normalizeSeoPath(pathname: string): string {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  return pageByPath.has(normalized) ? normalized : "/";
}
