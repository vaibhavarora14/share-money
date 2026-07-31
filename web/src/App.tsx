import { useState } from "react";
import type { ComponentType } from "react";
import type { LucideProps } from "lucide-react";
import {
  ArrowRight,
  ArrowRightLeft,
  Apple,
  CheckCircle2,
  ChartNoAxesCombined,
  Globe,
  Menu,
  Moon,
  Sun,
  Monitor,
  Receipt,
  Scale,
  ShieldCheck,
  Smartphone,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { track } from "@vercel/analytics";
import { Analytics } from "@vercel/analytics/react";
import { FAQ } from "./components/FAQ";
import { TrustBadges } from "./components/TrustBadges";
import { useTheme } from "./contexts/ThemeContext";
import { detectDevice } from "./utils/deviceDetection";

type DeviceType = "android" | "ios" | "desktop";
type Platform = "android" | "ios" | "web";

type LucideIcon = ComponentType<LucideProps>;

export type PlatformDestination = {
  platform: Platform;
  label: string;
  status: string;
  href: string;
  ariaLabel: string;
};

type LandingSection = {
  id: string;
  label: string;
};

type ProofCard = {
  title: string;
  subtitle: string;
  rows: {
    label: string;
    value: string;
    tone?: "neutral" | "positive" | "negative";
  }[];
};

type UseCaseKey = "trips" | "roommates" | "dinner";

type UseCaseProfile = {
  title: string;
  summary: string;
  members: string[];
  activity: string[];
  settlement: string[];
};

type WorkflowStep = {
  step: number;
  icon: LucideIcon;
  title: string;
  summary: string;
};

type DemoCard = {
  title: string;
  description: string;
  icon: LucideIcon;
  evidence: string[];
};

const platformDestinations: PlatformDestination[] = [
  {
    platform: "android",
    label: "Get the Android app",
    status: "Android • General availability",
    href: "https://play.google.com/store/apps/details?id=com.vaibhavarora.sharemoney&pcampaignid=web_share",
    ariaLabel: "Download ShareMoney on Android from Google Play Store",
  },
  {
    platform: "ios",
    label: "Join the iOS beta",
    status: "iOS • TestFlight beta",
    href: "https://testflight.apple.com/join/j23pnEmX",
    ariaLabel: "Join ShareMoney iOS beta on TestFlight",
  },
  {
    platform: "web",
    label: "Open web app",
    status: "Web app • Immediate access",
    href: "https://share-money.expo.app",
    ariaLabel: "Open ShareMoney web app",
  },
];

const primaryDestinationByDevice: Record<DeviceType, Platform> = {
  android: "android",
  ios: "ios",
  desktop: "android",
};

const sectionNav: LandingSection[] = [
  { id: "proof", label: "Proof" },
  { id: "examples", label: "Use cases" },
  { id: "workflow", label: "How it works" },
  { id: "features", label: "What it does" },
  { id: "trust", label: "Trust" },
  { id: "faq", label: "FAQ" },
  { id: "download", label: "Install" },
];

const proofCards: ProofCard[] = [
  {
    title: "Current balances",
    subtitle: "Summer Dinner Club · This month",
    rows: [
      { label: "Ari", value: "You are owed $22.40", tone: "positive" },
      { label: "Kai", value: "You owe $48.90", tone: "negative" },
      { label: "Sam", value: "Settled up", tone: "neutral" },
    ],
  },
  {
    title: "Expense history",
    subtitle: "Live timeline with spend details",
    rows: [
      { label: "Thursday", value: "Kai paid $84.20 for groceries" },
      { label: "Saturday", value: "Ari paid $55.60 for dining" },
      { label: "Sunday", value: "Group split: 4 people" },
    ],
  },
  {
    title: "Settlement result",
    subtitle: "Minimized transactions",
    rows: [
      { label: "Open action", value: "Kai pays Ari $48.90" },
      { label: "Close out", value: "No extra transfers required" },
    ],
  },
];

const useCaseProfiles: Record<UseCaseKey, UseCaseProfile> = {
  trips: {
    title: "Trips",
    summary: "Three friends track hotels, rides, and dinner while traveling across cities.",
    members: [
      "Maya · Paid $240 for hostel",
      "Noor · Paid $80 for taxi",
      "You · Paid $60 in snacks",
    ],
    activity: ["6 expenses", "4 participants", "2 settled in 2 payments"],
    settlement: [
      "Group net: +$120 remaining",
      "Suggested transfer: Noor -> Maya ($120)",
      "Suggested transfer: You -> Maya ($40)",
    ],
  },
  roommates: {
    title: "Roommates",
    summary: "Monthly rent and utilities stay easy to split among people with irregular payments.",
    members: ["Rent paid by Rina", "Utilities paid by You", "Groceries paid by Noor"],
    activity: ["8 expenses", "3 participants", "Auto-updated when new bill arrives"],
    settlement: ["Noor owes $18", "Rina owes $0", "You receive $18"],
  },
  dinner: {
    title: "Dinner Groups",
    summary: "Weekly dinner rotation with rotating hosts and group-specific limits.",
    members: [
      "Host A paid for groceries",
      "Host B paid for appetizers",
      "You hosted Friday",
    ],
    activity: ["5 expenses", "4 participants", "Split per person in one tap"],
    settlement: ["1 transaction to clear balances", "No overpayment noise", "Transparent note history"],
  },
};

const workflow: WorkflowStep[] = [
  {
    step: 1,
    icon: Receipt,
    title: "Add expenses",
    summary: "Log a bill, tag participants, and choose how the split works.",
  },
  {
    step: 2,
    icon: Users,
    title: "Split fairly",
    summary: "Adjust shares for unequal splits when one person ordered for more.",
  },
  {
    step: 3,
    icon: Scale,
    title: "Settle clearly",
    summary: "Get the minimum set of transfers needed to clear balances.",
  },
];

const demoCards: DemoCard[] = [
  {
    title: "Minimized settlements",
    description: "ShareMoney suggests the shortest chain of payments so everyone settles with fewer steps.",
    icon: ArrowRightLeft,
    evidence: ["3 participants", "5 balances", "2 transfers only"],
  },
  {
    title: "Multi-currency handling",
    description:
      "Keep one group in mixed currencies and review the normalized total clearly.",
    icon: Globe,
    evidence: ["EUR, USD, and INR examples", "Visible conversion notes", "No hidden fees shown"],
  },
  {
    title: "Synchronized activity",
    description: "As people add items, balances, notes, and summaries update in a single group view.",
    icon: ChartNoAxesCombined,
    evidence: ["Real-time updates", "Change history", "Who updated what"],
  },
  {
    title: "Spending summaries",
    description: "Review monthly totals and snapshots before each settle-up moment.",
    icon: Wallet,
    evidence: ["Personal spend", "Category totals", "Outstanding balances"],
  },
];

function getDevice(): DeviceType {
  return detectDevice();
}

function getPrimaryDestination(device: DeviceType): PlatformDestination {
  const primaryPlatform = primaryDestinationByDevice[device];
  const destination = platformDestinations.find(
    (item) => item.platform === primaryPlatform,
  );

  return destination ?? platformDestinations[0];
}

function getSecondaryDestinations(primaryPlatform: Platform): PlatformDestination[] {
  return platformDestinations.filter((item) => item.platform !== primaryPlatform);
}

function trackCtaClick(destination: PlatformDestination, placement: string) {
  const device = getDevice();
  track("landing_cta_click", {
    platform: destination.platform,
    placement,
    device,
  });
}

function PlatformIcon({
  platform,
  className,
}: {
  platform: Platform;
  className?: string;
}) {
  if (platform === "android") {
    return <Smartphone size={18} className={className} aria-hidden />;
  }

  if (platform === "ios") {
    return <Apple size={18} className={className} aria-hidden />;
  }

  return <Monitor size={18} className={className} aria-hidden />;
}

function CtaButton({
  destination,
  variant,
  placement,
}: {
  destination: PlatformDestination;
  variant: "primary" | "secondary";
  placement: string;
}) {
  return (
    <a
      href={destination.href}
      target="_blank"
      rel="noopener noreferrer"
      className={`cta cta-${variant}`}
      aria-label={destination.ariaLabel}
      onClick={() => trackCtaClick(destination, placement)}
    >
      <PlatformIcon platform={destination.platform} className="cta-icon" />
      <span>{destination.label}</span>
      <span className="cta-status">{destination.status}</span>
    </a>
  );
}

function App() {
  const { isDark, toggleTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeUseCase, setActiveUseCase] = useState<UseCaseKey>("trips");
  const device = getDevice();
  const primaryDestination = getPrimaryDestination(device);
  const secondaryDestinations = getSecondaryDestinations(
    primaryDestination.platform,
  );

  return (
    <div className="landing-page">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      <header className="site-header">
        <div className="container nav-shell">
          <a className="brand" href="#main-content" aria-label="ShareMoney home">
            <picture>
              <source type="image/avif" srcSet="/icon.avif" />
              <source type="image/webp" srcSet="/icon.webp" />
              <img
                src="/icon.png"
                alt="ShareMoney logo"
                className="brand-mark"
                width="40"
                height="40"
              />
            </picture>
            <span className="brand-text">ShareMoney</span>
          </a>

          <button
            className="menu-toggle"
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls="primary-nav"
            aria-label={menuOpen ? "Close navigation" : "Open navigation"}
          >
            {menuOpen ? <X size={22} aria-hidden /> : <Menu size={22} aria-hidden />}
          </button>

          <nav
            id="primary-nav"
            className={`section-nav ${menuOpen ? "is-open" : ""}`}
            aria-label="Main"
          >
            {sectionNav.map((item) => (
              <a href={`#${item.id}`} key={item.id} onClick={() => setMenuOpen(false)}>
                {item.label}
              </a>
            ))}
          </nav>

          <div className="header-actions">
            <CtaButton destination={primaryDestination} variant="primary" placement="header" />
            <button
              className="theme-button"
              type="button"
              onClick={toggleTheme}
              aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDark ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
            </button>
          </div>
        </div>
      </header>

      <main id="main-content">
        <section className="section hero">
          <div className="container hero-grid">
            <div className="hero-copy">
              <p className="eyebrow">Shared expense tracker</p>
              <h1>Shared expenses, clearly settled.</h1>
              <p className="hero-lead">
                Track trips, homes, and dinner groups in one place. ShareMoney
                keeps every balance visible and reduces the payments needed to
                settle up.
              </p>
              <p className="hero-trust">
                No bank connection. No payment handling. Just a clear shared record.
              </p>

              <div className="hero-actions">
                <CtaButton
                  destination={primaryDestination}
                  variant="primary"
                  placement="hero_primary"
                />
                <div className="hero-secondary-actions">
                  {secondaryDestinations.map((destination) => (
                    <CtaButton
                      key={destination.platform}
                      destination={destination}
                      variant="secondary"
                      placement="hero_secondary"
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="hero-media" aria-label="ShareMoney group expense screen">
              <picture>
                <source
                  type="image/avif"
                  srcSet={`/${isDark ? "hero-screenshot-dark" : "hero-screenshot"}.avif`}
                />
                <source
                  type="image/webp"
                  srcSet={`/${isDark ? "hero-screenshot-dark" : "hero-screenshot"}.webp`}
                />
                <img
                  src={`/${isDark ? "hero-screenshot-dark" : "hero-screenshot"}.png`}
                  alt="Group balances and expenses in the ShareMoney app"
                  width={540}
                  height={1200}
                  loading="eager"
                  fetchPriority="high"
                  className="hero-image"
                />
              </picture>
            </div>
          </div>
        </section>

        <section id="proof" className="section section-peek">
          <div className="container">
            <div className="section-head">
              <h2>See it in context</h2>
              <p>Balances, history, and settlement result at a glance.</p>
            </div>
            <div className="proof-grid">
              {proofCards.map((card) => (
                <article className="proof-card" key={card.title}>
                  <h3>{card.title}</h3>
                  <p>{card.subtitle}</p>
                  <ul>
                    {card.rows.map((row) => (
                      <li
                        key={row.label}
                        className={`proof-row proof-row-${row.tone ?? "neutral"}`}
                      >
                        <span>{row.label}</span>
                        <span>{row.value}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="examples" className="section section-muted">
          <div className="container">
            <div className="section-head">
              <h2>How groups use it</h2>
              <p>Pick a scenario and review real-style balances.</p>
            </div>

            <div className="case-tabs" role="tablist" aria-label="Use case examples">
              {(Object.keys(useCaseProfiles) as UseCaseKey[]).map((key) => (
                <button
                  type="button"
                  key={key}
                  role="tab"
                  aria-selected={activeUseCase === key}
                  onClick={() => setActiveUseCase(key)}
                  className={`tab-button ${
                    activeUseCase === key ? "is-active" : ""
                  }`}
                >
                  {useCaseProfiles[key].title}
                </button>
              ))}
            </div>

            <article className="case-panel">
              <div className="case-panel-header">
                <p>{useCaseProfiles[activeUseCase].summary}</p>
              </div>

              <div className="case-panel-grid">
                <div>
                  <h3>Members</h3>
                  <ul>
                    {useCaseProfiles[activeUseCase].members.map((member) => (
                      <li key={member}>{member}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3>Group activity</h3>
                  <ul>
                    {useCaseProfiles[activeUseCase].activity.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3>Settlement hints</h3>
                  <ul>
                    {useCaseProfiles[activeUseCase].settlement.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </article>
          </div>
        </section>

        <section id="workflow" className="section">
          <div className="container">
            <div className="section-head">
              <h2>Three steps to clear group finance</h2>
            </div>

            <div className="workflow-grid">
              {workflow.map((step) => (
                <article className="step-card" key={step.step}>
                  <div className="step-pill">{step.step}</div>
                  <step.icon size={22} aria-hidden />
                  <h3>{step.title}</h3>
                  <p>{step.summary}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="features" className="section section-muted">
          <div className="container">
            <div className="section-head">
              <h2>Product behavior that matters</h2>
            </div>

            <div className="feature-list">
              {demoCards.map((demo, index) => (
                <article
                  className={`feature-row ${index % 2 ? "feature-row-reverse" : ""}`}
                  key={demo.title}
                >
                  <div className="feature-copy">
                    <demo.icon size={24} aria-hidden />
                    <h3>{demo.title}</h3>
                    <p>{demo.description}</p>
                  </div>
                  <ul className="feature-points">
                    {demo.evidence.map((item) => (
                      <li key={item}>
                        <CheckCircle2 size={16} aria-hidden />
                        {item}
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="trust" className="section">
          <div className="container">
            <div className="section-head">
              <h2>Trust and safety</h2>
              <p>
                ShareMoney is a tracker. We store group records, not your payment
                instruments.
              </p>
            </div>

            <TrustBadges />

            <div className="trust-copy">
              <div className="trust-point">
                <ShieldCheck size={18} aria-hidden />
                <p>
                  No bank account linking is required. ShareMoney only tracks who
                  owes what inside each group.
                </p>
              </div>
              <div className="trust-point">
                <Wallet size={18} aria-hidden />
                <p>Actual payment happens in your preferred payment apps.</p>
              </div>
              <div className="trust-point">
                <ArrowRight size={18} aria-hidden />
                <p>
                  Data is encrypted in transit and at rest where platform support
                  applies.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="faq" className="section section-muted">
          <FAQ />
        </section>

        <section id="download" className="section section-download">
          <div className="container">
            <div className="download-copy">
              <h2>Start sharing in a few taps</h2>
              <p>Android is generally available. iOS is currently in TestFlight beta.</p>
            </div>
            <div className="download-actions">
              <CtaButton
                destination={primaryDestination}
                variant="primary"
                placement="download"
              />
              {secondaryDestinations.map((destination) => (
                <CtaButton
                  key={destination.platform}
                  destination={destination}
                  variant="secondary"
                  placement="download_secondary"
                />
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="container footer-inner">
          <div className="footer-brand">ShareMoney</div>
          <div className="footer-links">
            <a href="mailto:varora1406@gmail.com">Contact support</a>
            <a href="/privacy.html" target="_blank" rel="noopener noreferrer">
              Privacy
            </a>
            <a href="/delete-account.html" target="_blank" rel="noopener noreferrer">
              Delete account
            </a>
          </div>
          <p>© {new Date().getFullYear()} ShareMoney. All rights reserved.</p>
        </div>
      </footer>

      <Analytics />
    </div>
  );
}

export default App;
