import { useState } from "react";
import { FAQ } from "./components/FAQ";
import { Footer } from "./components/landing/Footer";
import { GroupPulse } from "./components/landing/GroupPulse";
import { Header } from "./components/landing/Header";
import { Hero } from "./components/landing/Hero";
import { InstallSection } from "./components/landing/InstallSection";
import { ProductChapters } from "./components/landing/ProductChapters";
import { TrustSection } from "./components/landing/TrustSection";
import { UseCases } from "./components/landing/UseCases";
import { WorkflowSection } from "./components/landing/WorkflowSection";
import { useTheme } from "./contexts/ThemeContext";
import {
  getPrimaryDestination,
  getSecondaryDestinations,
} from "./landingContent";
import { detectDevice } from "./utils/deviceDetection";

function App() {
  const { isDark } = useTheme();
  const [device] = useState(detectDevice);
  const primaryDestination = getPrimaryDestination(device);
  const secondaryDestinations = getSecondaryDestinations(
    primaryDestination.platform,
  );

  return (
    <div className="landing-page">
      <Header primaryDestination={primaryDestination} />

      <main id="main-content">
        <Hero
          isDark={isDark}
          primaryDestination={primaryDestination}
          secondaryDestinations={secondaryDestinations}
        />
        <GroupPulse />
        <UseCases />
        <WorkflowSection />
        <ProductChapters />
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
