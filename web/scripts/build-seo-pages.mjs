import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, "../dist");
const indexPath = path.join(distDir, "index.html");
const siteUrl = "https://sharedmoney.app";
const appUrl = `${siteUrl}/app`;
const ogImage = `${siteUrl}/og-sharedmoney.png`;

const pages = [
  {
    path: "/",
    title: "SharedMoney - Split Bills and Track Group Expenses",
    description:
      "SharedMoney helps friends, roommates, and travel groups split bills, track shared expenses, and see who owes who without handling payments.",
    keywords:
      "split bills, group expense tracker, shared expense tracker, who owes who, split expenses app",
    eyebrow: "Shared expenses",
    heading: "SharedMoney",
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

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function pageUrl(pagePath) {
  return `${siteUrl}${pagePath === "/" ? "" : pagePath}`;
}

function fallbackMarkup(page) {
  const proofItems = page.proof
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");

  return `<main id="main-content"><section><p>${escapeHtml(page.eyebrow)}</p><h1>${escapeHtml(
    page.heading,
  )}</h1><p>${escapeHtml(page.body)}</p><ul>${proofItems}</ul><p><a href="${appUrl}">Open the SharedMoney web app</a></p><nav aria-label="SharedMoney legal links"><a href="/privacy">Privacy Policy</a><a href="/delete-account">Delete Account</a><a href="mailto:support@sharedmoney.app">Contact support</a></nav></section></main>`;
}

function jsonLd(page) {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "SharedMoney",
    url: siteUrl,
    applicationCategory: "FinanceApplication",
    operatingSystem: "Android, iOS (TestFlight), Web",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    description: page.description,
  });
}

function renderPage(template, page) {
  const canonical = pageUrl(page.path);
  let html = template
    .replace(/<title>.*?<\/title>/s, `<title>${escapeHtml(page.title)}</title>`)
    .replace(/<meta name="title" content=".*?" \/>/s, `<meta name="title" content="${escapeHtml(page.title)}" />`)
    .replace(/<meta\s+name="description"\s+content=".*?"\s+\/>/s, `<meta name="description" content="${escapeHtml(page.description)}" />`)
    .replace(/<meta\s+name="keywords"\s+content=".*?"\s+\/>/s, `<meta name="keywords" content="${escapeHtml(page.keywords)}" />`)
    .replace(/<link rel="canonical" href=".*?" \/>/s, `<link rel="canonical" href="${canonical}" />`)
    .replace(/<meta property="og:url" content=".*?" \/>/s, `<meta property="og:url" content="${canonical}" />`)
    .replace(/<meta property="og:title" content=".*?" \/>/s, `<meta property="og:title" content="${escapeHtml(page.title)}" />`)
    .replace(/<meta\s+property="og:description"\s+content=".*?"\s+\/>/s, `<meta property="og:description" content="${escapeHtml(page.description)}" />`)
    .replace(/<meta property="og:image" content=".*?" \/>/s, `<meta property="og:image" content="${ogImage}" />`)
    .replace(/<meta property="og:image:alt" content=".*?" \/>/s, `<meta property="og:image:alt" content="SharedMoney group balances and shared expense ledger." />`)
    .replace(/<meta property="twitter:url" content=".*?" \/>/s, `<meta property="twitter:url" content="${canonical}" />`)
    .replace(/<meta property="twitter:title" content=".*?" \/>/s, `<meta property="twitter:title" content="${escapeHtml(page.title)}" />`)
    .replace(/<meta\s+property="twitter:description"\s+content=".*?"\s+\/>/s, `<meta property="twitter:description" content="${escapeHtml(page.description)}" />`)
    .replace(/<meta property="twitter:image" content=".*?" \/>/s, `<meta property="twitter:image" content="${ogImage}" />`)
    .replace(/<meta property="twitter:image:alt" content=".*?" \/>/s, `<meta property="twitter:image:alt" content="SharedMoney group balances and shared expense ledger." />`)
    .replace(/<script type="application\/ld\+json">.*?<\/script>/s, `<script type="application/ld+json">${jsonLd(page)}</script>`)
    .replace('<div id="root"></div>', `<div id="root">${fallbackMarkup(page)}</div>`);

  if (!html.includes('rel="canonical"')) {
    html = html.replace("</head>", `    <link rel="canonical" href="${canonical}" />\n  </head>`);
  }

  return html;
}

const template = await readFile(indexPath, "utf8");

for (const page of pages) {
  const html = renderPage(template, page);
  const targetDir = page.path === "/" ? distDir : path.join(distDir, page.path);
  await mkdir(targetDir, { recursive: true });
  await writeFile(path.join(targetDir, "index.html"), html);
}

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages
  .map((page) => `  <url><loc>${pageUrl(page.path)}</loc></url>`)
  .join("\n")}\n</urlset>\n`;

await writeFile(path.join(distDir, "sitemap.xml"), sitemap);
