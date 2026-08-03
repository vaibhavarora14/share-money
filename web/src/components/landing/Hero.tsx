import type { PlatformDestination } from "../../landingContent";
import { PlatformCta } from "./PlatformCta";

export function Hero({
  primaryDestination,
  secondaryDestinations,
}: {
  primaryDestination: PlatformDestination;
  secondaryDestinations: PlatformDestination[];
}) {
  return (
    <section id="product" className="hero">
      <div className="container hero-shell">
        <div className="hero-intro">
          <div className="hero-title-block">
            <p className="kicker">Shared expenses</p>
            <h1>Split the trip. Settle up.</h1>
            <p className="hero-lead">One shared record for group money.</p>
            <div className="hero-actions">
              <PlatformCta
                destination={primaryDestination}
                placement="hero_primary"
                appearance="primary"
              />
              <div className="hero-secondary-actions">
                {secondaryDestinations.map((destination) => (
                  <PlatformCta
                    key={destination.platform}
                    destination={destination}
                    placement="hero_secondary"
                    appearance="text"
                  />
                ))}
              </div>
            </div>
            <div className="hero-trust-row" aria-label="Product boundaries">
              <span>No bank link</span>
              <span>No payments</span>
              <span>Web + mobile</span>
            </div>
          </div>
        </div>

        <figure className="hero-product-shot">
          <img
            src="/app-group-current.png"
            alt="ShareMoney group screen showing balances, summary cards, and transactions"
            width="1080"
            height="2400"
            loading="eager"
            fetchPriority="high"
          />
        </figure>

        <div className="hero-proof-strip" aria-label="How ShareMoney works">
          <div><strong>Add</strong><span>Expense</span></div>
          <div><strong>See</strong><span>Balance</span></div>
          <div><strong>Settle</strong><span>Clearly</span></div>
        </div>
      </div>
    </section>
  );
}
