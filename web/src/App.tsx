/**
 * ShareMoney Landing Page
 *
 * NOTE: This is a LANDING PAGE ONLY - a marketing/onboarding site.
 * The actual ShareMoney web application is located elsewhere.
 *
 * This landing page serves to:
 * - Introduce ShareMoney to new users
 * - Provide download links for iOS/Android apps
 * - Link to the web beta application
 * - Display features, FAQs, and trust indicators
 */
import { track } from "@vercel/analytics";
import { Analytics } from "@vercel/analytics/react";
import { FAQ } from "./components/FAQ";
import { ChartIcon, GlobeIcon, MoneyIcon, SyncIcon } from "./components/Icons";
import { TrustBadges } from "./components/TrustBadges";
import { useTheme } from "./contexts/ThemeContext";
import { useScrollAnimation } from "./hooks/useScrollAnimation";
import { detectDevice } from "./utils/deviceDetection";

function App() {
  const { isDark, toggleTheme } = useTheme();
  const heroAnimation = useScrollAnimation();
  const featuresAnimation = useScrollAnimation();
  const trustAnimation = useScrollAnimation();
  const faqAnimation = useScrollAnimation();

  // Extract visibility states to avoid linter false positives
  const heroVisible = heroAnimation.isVisible;
  const featuresVisible = featuresAnimation.isVisible;
  const trustVisible = trustAnimation.isVisible;
  const faqVisible = faqAnimation.isVisible;

  return (
    <>
      <div className="app" id="main-content">
        {/* Navigation */}
        <nav
          style={{
            position: "sticky",
            top: 0,
            zIndex: 50,
            backdropFilter: "blur(12px)",
            backgroundColor: "var(--gradient-nav)",
            borderBottom: "1px solid var(--color-border)",
          }}
        >
          <div className="container nav-container">
            <div className="nav-brand">
              <img
                src="/icon.png"
                alt="ShareMoney - Split expenses and simplify group finances"
                width="48"
                height="48"
                className="nav-logo"
              />
              <span className="nav-title">ShareMoney</span>
            </div>
            <button
              onClick={toggleTheme}
              className="theme-toggle"
              aria-label={
                isDark ? "Switch to light mode" : "Switch to dark mode"
              }
            >
              {isDark ? (
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              ) : (
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </button>
          </div>
        </nav>

        {/* Hero Section */}
        <section
          className="section hero-section"
          ref={heroAnimation.ref as React.RefObject<HTMLElement>}
        >
          <div
            className={`container scroll-fade ${heroVisible ? "visible" : ""}`}
          >
            <style>
              {`
              @keyframes float {
                0% { transform: translateY(0px); }
                50% { transform: translateY(-20px); }
                100% { transform: translateY(0px); }
              }
              .float-animation {
                animation: float 6s ease-in-out infinite;
              }
              .hero-gradient-text {
                background: var(--gradient-primary);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
              }
            `}
            </style>
            <h1 className="hero-headline">
              Split Expenses. <br />
              <span className="hero-gradient-text">Simplify Life.</span>
            </h1>
            <p className="hero-description">
              The easiest way to track shared expenses, settle up with friends,
              and manage group finances without the headache.
            </p>

            {/* All Platform CTAs - Hero Section */}
            <div
              className="hero-cta-container"
              style={{
                display: "flex",
                gap: "0.75rem",
                justifyContent: "center",
                flexWrap: "wrap",
                marginBottom: "3rem",
                position: "relative",
                zIndex: 10,
                width: "100%",
                maxWidth: "100%",
                boxSizing: "border-box",
                padding: "0",
              }}
            >
              {/* iOS Button */}
              <a
                href="https://testflight.apple.com/join/j23pnEmX"
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-ios"
                aria-label="Download ShareMoney iOS beta app via TestFlight"
                onClick={() =>
                  track("iOS Beta Click", { location: "hero", device: detectDevice() })
                }
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  style={{ flexShrink: 0 }}
                >
                  <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C1.79 15.25 4.96 6.39 12.05 6.39c2.25 0 3.86.88 5.18 1.56-1.19 1.65-1.7 3.75-1.35 5.95.43 2.73 1.95 4.08 3.86 4.88-.3.85-.68 1.67-1.24 2.4zM12.03.01c-.83 0-1.87.5-2.5 1.17-.65.68-1.2 1.76-1.05 2.8.9.05 1.93-.4 2.58-1.05.65-.68 1.2-1.77 1.05-2.8-.05-.05-.05-.1-.08-.12z" />
                </svg>
                <span style={{ whiteSpace: "nowrap" }}>Try iOS Beta</span>
              </a>

              {/* Android Button */}
              <a
                href="mailto:varora1406@gmail.com?subject=ShareMoney Android Beta Access Request&body=Hi! I'd like to request access to the ShareMoney Android beta app. Thank you!"
                className="btn btn-android"
                aria-label="Request access to ShareMoney Android beta app via email"
                onClick={() =>
                  track("Android Beta Request", { location: "hero", device: detectDevice() })
                }
                title="Android beta requires email request"
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    style={{ flexShrink: 0 }}
                  >
                    <path d="M17.523 15.3414c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.5511 0 .9993.4482.9993.9993s-.4482.9997-.9993.9997m-11.046 0c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.551 0 .9993.4482.9993.9993s-.4483.9997-.9993.9997m11.4045-6.02l1.9973-3.4592a.416.416 0 00-.1521-.5676.416.416 0 00-.5676.1521l-2.0223 3.503C15.5902 8.2439 13.8533 7.8508 12 7.8508s-3.5902.3931-5.1349 1.1357L4.8429 5.4834a.4161.4161 0 00-.5676-.1521.4157.4157 0 00-.1521.5676l1.9973 3.4592C2.6889 11.186.8535 12.3074.8535 13.8508c0 2.6998 4.9702 4.1495 11.1465 4.1495 6.1763 0 11.1465-1.4492 11.1465-4.1495 0-1.5434-1.8354-2.6648-4.523-3.5294" />
                  </svg>
                  <span style={{ whiteSpace: "nowrap" }}>Request Android</span>
                </div>
                <span
                  style={{
                    fontSize: "0.7rem",
                    opacity: 0.7,
                    fontWeight: "500",
                    color: "var(--color-text-secondary)",
                    whiteSpace: "nowrap",
                  }}
                >
                  (On Request)
                </span>
              </a>

              {/* Web Button */}
              <a
                href="https://share-money.expo.app"
                className="btn btn-web"
                aria-label="Try ShareMoney web app beta"
                onClick={() =>
                  track("Web Beta Click", { location: "hero", device: detectDevice() })
                }
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  style={{ flexShrink: 0 }}
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
                <span style={{ whiteSpace: "nowrap" }}>Try Web Beta</span>
              </a>
            </div>

            <div className="float-animation hero-image-container">
              <img
                src={
                  isDark ? "/hero-screenshot-dark.png" : "/hero-screenshot.png"
                }
                alt="ShareMoney app dashboard showing expense tracking, group management, and smart settlement features"
                loading="lazy"
                width="1200"
                height="800"
                style={{ width: "100%", height: "auto", display: "block" }}
              />
            </div>
          </div>
        </section>

        {/* How it Works - Timeline */}
        <section
          className="section"
          style={{ backgroundColor: "var(--color-surface)" }}
        >
          <div className="container">
            <div className="section-title" style={{ marginBottom: "3rem" }}>
              <h2 style={{ marginBottom: "1rem" }}>How it Works</h2>
              <p className="section-subtitle">
                Three steps to financial peace of mind.
              </p>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: "2rem",
                maxWidth: "1000px",
                margin: "0 auto",
                position: "relative",
              }}
            >
              {/* Connector Line (Desktop only) */}
              <div
                className="timeline-connector"
                style={{
                  position: "absolute",
                  top: "24px",
                  left: "16%",
                  right: "16%",
                  height: "2px",
                  backgroundColor: "var(--color-border)",
                  zIndex: 0,
                  display: "none", // Hidden by default, shown in media query via style tag below
                }}
              ></div>
              <style>{`@media (min-width: 768px) { .timeline-connector { display: block !important; } }`}</style>

              <TimelineItem
                step="1"
                title="Create a Group"
                description="Start a group for your trip, house, or project. Invite friends instantly."
              />
              <TimelineItem
                step="2"
                title="Add Expenses"
                description="Log costs as they happen. We handle the math for you."
              />
              <TimelineItem
                step="3"
                title="Settle Up"
                description="Our smart algorithm minimizes transactions so everyone gets paid back fast."
              />
            </div>
          </div>
        </section>

        {/* Bento Grid Features */}
        <section
          className="section"
          ref={featuresAnimation.ref as React.RefObject<HTMLElement>}
        >
          <div
            className={`container scroll-fade ${
              featuresVisible ? "visible" : ""
            }`}
          >
            <div className="section-title" style={{ marginBottom: "4rem" }}>
              <h2 style={{ marginBottom: "1rem" }}>Everything you need</h2>
              <p className="section-subtitle">
                Powerful features packed into a simple design.
              </p>
            </div>

            {/* Responsive Bento Grid */}
            <style>
              {`
              .bento-grid {
                display: grid;
                grid-template-columns: 1fr;
                gap: 1.5rem;
                max-width: 1000px;
                margin: 0 auto;
              }
              
              /* Small screens - all cards full width */
              .bento-card-large,
              .bento-card-tall {
                grid-column: 1;
                grid-row: auto;
              }
              
              /* Tablet & Up */
              @media (min-width: 768px) {
                .bento-grid {
                  grid-template-columns: repeat(2, 1fr);
                }
              }

              /* Desktop & Up */
              @media (min-width: 1024px) {
                .bento-grid {
                  grid-template-columns: repeat(3, 1fr);
                  grid-template-rows: repeat(2, auto);
                }
                .bento-card-large { 
                  grid-column: span 2; 
                  grid-row: auto;
                }
                .bento-card-tall { 
                  grid-row: span 2;
                  grid-column: auto;
                }
              }
            `}
            </style>

            <div className="bento-grid">
              {/* Large Card: Smart Settlements */}
              <div className="bento-card bento-card-large">
                <div className="bento-icon bento-icon-large">
                  <MoneyIcon size={48} />
                </div>
                <h3 className="bento-title">Smart Settlements</h3>
                <p className="bento-text">
                  Our proprietary algorithm calculates the most efficient way to
                  pay everyone back, minimizing the number of transactions by up
                  to 70%.
                </p>
              </div>

              {/* Tall Card: Real-time Sync */}
              <div
                className="bento-card bento-card-tall"
                style={{
                  backgroundColor: "var(--color-primary)",
                  color: "white",
                }}
              >
                <div
                  className="bento-icon bento-icon-large"
                  style={{ color: "white" }}
                >
                  <SyncIcon size={48} />
                </div>
                <h3 className="bento-title" style={{ color: "white" }}>
                  Real-time Sync
                </h3>
                <p
                  className="bento-text"
                  style={{ opacity: 0.9, color: "white" }}
                >
                  Changes update instantly across all your devices. Never wonder
                  if you're looking at old data.
                </p>
              </div>

              {/* Small Card: Multi-Currency */}
              <div className="bento-card bento-card-small">
                <div className="bento-icon bento-icon-small">
                  <GlobeIcon size={40} />
                </div>
                <h3 className="bento-title-small">Multi-Currency</h3>
                <p>Add expenses in any currency.</p>
              </div>

              {/* Small Card: Stats */}
              <div className="bento-card bento-card-small">
                <div className="bento-icon bento-icon-small">
                  <ChartIcon size={40} />
                </div>
                <h3 className="bento-title-small">Spending Stats</h3>
                <p>Visualize where your money goes.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Trust Badges */}
        <section
          className="section"
          style={{ backgroundColor: "var(--color-surface)", padding: "2rem 0" }}
          ref={trustAnimation.ref as React.RefObject<HTMLElement>}
        >
          <div
            className={`container scroll-fade ${trustVisible ? "visible" : ""}`}
          >
            <TrustBadges />
          </div>
        </section>

        {/* FAQ Section */}
        <div ref={faqAnimation.ref as React.RefObject<HTMLDivElement>}>
          <div className={`scroll-fade ${faqVisible ? "visible" : ""}`}>
            <FAQ />
          </div>
        </div>

        {/* Download Section */}
        <section
          id="download"
          className="section"
          style={{ textAlign: "center" }}
        >
          <div className="container">
            <div
              style={{
                backgroundColor: "var(--color-primary)",
                borderRadius: "24px",
                padding: "4rem 2rem",
                color: "white",
                backgroundImage: "var(--gradient-primary)",
              }}
            >
              <h2 style={{ marginBottom: "1rem", color: "white" }}>
                Start Sharing Today
              </h2>
              <p
                style={{
                  fontSize: "1.25rem",
                  marginBottom: "2.5rem",
                  opacity: 0.9,
                  color: "white",
                }}
              >
                All platforms in beta testing: iOS (open), Android (on request),
                and Web
              </p>

              <div
                style={{
                  display: "flex",
                  gap: "1rem",
                  justifyContent: "center",
                  flexWrap: "wrap",
                  alignItems: "stretch",
                  maxWidth: "900px",
                  margin: "0 auto",
                }}
              >
                {/* iOS Button */}
                <a
                  href="https://testflight.apple.com/join/j23pnEmX"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-ios-download"
                  onClick={() =>
                    track("iOS Beta Click", { location: "download", device: detectDevice() })
                  }
                >
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    style={{ flexShrink: 0 }}
                  >
                    <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C1.79 15.25 4.96 6.39 12.05 6.39c2.25 0 3.86.88 5.18 1.56-1.19 1.65-1.7 3.75-1.35 5.95.43 2.73 1.95 4.08 3.86 4.88-.3.85-.68 1.67-1.24 2.4zM12.03.01c-.83 0-1.87.5-2.5 1.17-.65.68-1.2 1.76-1.05 2.8.9.05 1.93-.4 2.58-1.05.65-.68 1.2-1.77 1.05-2.8-.05-.05-.05-.1-.08-.12z" />
                  </svg>
                  <span>Try iOS Beta</span>
                </a>

                {/* Android Button */}
                <a
                  href="mailto:varora1406@gmail.com?subject=ShareMoney Android Beta Access Request&body=Hi! I'd like to request access to the ShareMoney Android beta app. Thank you!"
                  className="btn btn-android-download"
                  onClick={() =>
                    track("Android Beta Request", {
                      location: "download",
                      device: detectDevice(),
                    })
                  }
                  title="Android beta requires email request"
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem",
                    }}
                  >
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      style={{ flexShrink: 0 }}
                    >
                      <path d="M17.523 15.3414c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.5511 0 .9993.4482.9993.9993s-.4482.9997-.9993.9997m-11.046 0c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.551 0 .9993.4482.9993.9993s-.4483.9997-.9993.9997m11.4045-6.02l1.9973-3.4592a.416.416 0 00-.1521-.5676.416.416 0 00-.5676.1521l-2.0223 3.503C15.5902 8.2439 13.8533 7.8508 12 7.8508s-3.5902.3931-5.1349 1.1357L4.8429 5.4834a.4161.4161 0 00-.5676-.1521.4157.4157 0 00-.1521.5676l1.9973 3.4592C2.6889 11.186.8535 12.3074.8535 13.8508c0 2.6998 4.9702 4.1495 11.1465 4.1495 6.1763 0 11.1465-1.4492 11.1465-4.1495 0-1.5434-1.8354-2.6648-4.523-3.5294" />
                    </svg>
                    <span>Request Android</span>
                  </div>
                  <span
                    style={{
                      fontSize: "0.75rem",
                      opacity: 0.7,
                      fontWeight: "500",
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    (On Request)
                  </span>
                </a>

                {/* Web Button */}
                <a
                  href="https://share-money.expo.app"
                  className="btn btn-web-download"
                  onClick={() =>
                    track("Web Beta Click", { location: "download", device: detectDevice() })
                  }
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    style={{ flexShrink: 0 }}
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="2" y1="12" x2="22" y2="12" />
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                  <span>Try Web Beta</span>
                </a>
              </div>

              <div
                style={{
                  marginTop: "2rem",
                  fontSize: "0.875rem",
                  opacity: 0.85,
                  color: "white",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.75rem",
                  alignItems: "center",
                  maxWidth: "600px",
                  margin: "2rem auto 0",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    flexWrap: "wrap",
                    justifyContent: "center",
                  }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    style={{ opacity: 0.8 }}
                  >
                    <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C1.79 15.25 4.96 6.39 12.05 6.39c2.25 0 3.86.88 5.18 1.56-1.19 1.65-1.7 3.75-1.35 5.95.43 2.73 1.95 4.08 3.86 4.88-.3.85-.68 1.67-1.24 2.4zM12.03.01c-.83 0-1.87.5-2.5 1.17-.65.68-1.2 1.76-1.05 2.8.9.05 1.93-.4 2.58-1.05.65-.68 1.2-1.77 1.05-2.8-.05-.05-.05-.1-.08-.12z" />
                  </svg>
                  <span>
                    iOS: Requires TestFlight app (free from App Store)
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    flexWrap: "wrap",
                    justifyContent: "center",
                  }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    style={{ opacity: 0.8 }}
                  >
                    <path d="M17.523 15.3414c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.5511 0 .9993.4482.9993.9993s-.4482.9997-.9993.9997m-11.046 0c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.551 0 .9993.4482.9993.9993s-.4483.9997-.9993.9997m11.4045-6.02l1.9973-3.4592a.416.416 0 00-.1521-.5676.416.416 0 00-.5676.1521l-2.0223 3.503C15.5902 8.2439 13.8533 7.8508 12 7.8508s-3.5902.3931-5.1349 1.1357L4.8429 5.4834a.4161.4161 0 00-.5676-.1521.4157.4157 0 00-.1521.5676l1.9973 3.4592C2.6889 11.186.8535 12.3074.8535 13.8508c0 2.6998 4.9702 4.1495 11.1465 4.1495 6.1763 0 11.1465-1.4492 11.1465-4.1495 0-1.5434-1.8354-2.6648-4.523-3.5294" />
                  </svg>
                  <span>Android: Available upon request via email</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer
          style={{
            padding: "4rem 0",
            borderTop: "1px solid var(--color-border)",
            backgroundColor: "var(--color-background)",
          }}
        >
          <div className="container" style={{ textAlign: "center" }}>
            <div
              style={{
                marginBottom: "2rem",
                fontWeight: 700,
                fontSize: "1.5rem",
                color: "var(--color-primary)",
              }}
            >
              ShareMoney
            </div>
            <div
              style={{
                display: "flex",
                gap: "2rem",
                justifyContent: "center",
                marginBottom: "2rem",
              }}
            >
              <a
                href="mailto:varora1406@gmail.com"
                style={{
                  color: "var(--color-text-main)",
                  textDecoration: "none",
                  fontWeight: 500,
                }}
              >
                Contact Support
              </a>
            </div>
            <p
              style={{
                fontSize: "0.875rem",
                color: "var(--color-text-secondary)",
              }}
            >
              © {new Date().getFullYear()} ShareMoney. All rights reserved.
            </p>
          </div>
        </footer>
      </div>
      <Analytics />
    </>
  );
}

function TimelineItem({
  step,
  title,
  description,
}: {
  step: string;
  title: string;
  description: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        position: "relative",
        zIndex: 1,
      }}
    >
      <div
        style={{
          width: "48px",
          height: "48px",
          borderRadius: "50%",
          backgroundColor: "var(--color-primary)",
          color: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: "bold",
          fontSize: "1.25rem",
          marginBottom: "1rem",
          boxShadow: "0 0 0 8px white", // Creates space around the line
        }}
      >
        {step}
      </div>
      <div>
        <h3 style={{ marginBottom: "0.5rem", fontSize: "1.25rem" }}>{title}</h3>
        <p
          style={{
            fontSize: "1rem",
            color: "var(--color-text-secondary)",
            lineHeight: "1.5",
          }}
        >
          {description}
        </p>
      </div>
    </div>
  );
}

export default App;
