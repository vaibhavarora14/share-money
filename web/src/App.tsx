import { useState } from "react";
import { FAQ } from "./components/FAQ";
import { Footer } from "./components/landing/Footer";
import { Header } from "./components/landing/Header";
import { Hero } from "./components/landing/Hero";
import { InstallSection } from "./components/landing/InstallSection";
import { TrustSection } from "./components/landing/TrustSection";
import { WorkflowSection } from "./components/landing/WorkflowSection";
import {
  getPrimaryDestination,
  getSecondaryDestinations,
} from "./landingContent";
import { pageByPath, normalizeSeoPath, type SeoPage } from "./seoPages";
import { detectDevice } from "./utils/deviceDetection";

function RouteIntro({ page }: { page: SeoPage }) {
  return (
    <section className="route-intro" aria-labelledby="route-intro-title">
      <div className="container route-intro-shell">
        <div>
          <p className="kicker">{page.eyebrow}</p>
          <h2 id="route-intro-title">{page.heading}</h2>
          <p>{page.body}</p>
        </div>
        <ul aria-label="OweWho highlights">
          {page.proof.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function App() {
  const [device] = useState(detectDevice);
  const [seoPath] = useState(() =>
    typeof window === "undefined" ? "/" : normalizeSeoPath(window.location.pathname),
  );
  const primaryDestination = getPrimaryDestination(device);
  const secondaryDestinations = getSecondaryDestinations(
    primaryDestination.platform,
  );
  const seoPage = pageByPath.get(seoPath) ?? pageByPath.get("/");

  return (
    <div className="landing-page">
      <Header primaryDestination={primaryDestination} />

      <main id="main-content">
        <Hero
          primaryDestination={primaryDestination}
          secondaryDestinations={secondaryDestinations}
        />
        {seoPage ? <RouteIntro page={seoPage} /> : null}
        <WorkflowSection />
        <TrustSection />
        <section id="faq" className="section faq-section">
          <FAQ />
        </section>
        <InstallSection
          primaryDestination={primaryDestination}
          secondaryDestinations={secondaryDestinations}
        />
      </main>

      <Footer />
    </div>
  );
}

export default App;
