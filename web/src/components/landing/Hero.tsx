import { ShieldCheck } from "lucide-react";
import type { PlatformDestination } from "../../landingContent";
import { PlatformCta } from "./PlatformCta";

const heroMembers = [
  {
    initials: "CH",
    name: "Charlie",
    detail: "owes you",
    amount: "INR 7,000",
    tone: "positive",
  },
  {
    initials: "BO",
    name: "Bob",
    detail: "owes you",
    amount: "INR 1,000",
    tone: "positive",
  },
  {
    initials: "YO",
    name: "You",
    detail: "current position",
    amount: "+INR 8,000",
    tone: "positive",
  },
] as const;

export function Hero({
  isDark,
  primaryDestination,
  secondaryDestinations,
}: {
  isDark: boolean;
  primaryDestination: PlatformDestination;
  secondaryDestinations: PlatformDestination[];
}) {
  return (
    <section id="product" className="hero">
      <div className="container hero-shell">
        <div className="hero-intro">
          <div className="hero-title-block">
            <p className="kicker">Trips / homes / dinner groups</p>
            <h1>Shared expenses, clearly settled.</h1>
          </div>

          <div className="hero-support">
            <p className="hero-lead">
              Track trips, homes, and dinner groups in one place. ShareMoney keeps
              every balance visible and reduces the payments needed to settle up.
            </p>
            <p className="hero-trust">
              <ShieldCheck size={18} aria-hidden />
              <span>No bank connection. No payment handling. Just a clear shared record.</span>
            </p>
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
          </div>
        </div>

        <div className="group-story" aria-label="Weekly Dinner Club ShareMoney example">
          <div className="group-story-context">
            <div className="group-story-heading">
              <p className="group-story-label">Weekly Dinner Club</p>
              <p>Regular dinner outings</p>
            </div>

            <div className="group-story-members" role="list" aria-label="Group balances">
              {heroMembers.map((member) => (
                <div className="group-story-member" role="listitem" key={member.name}>
                  <span className="avatar" aria-hidden>{member.initials}</span>
                  <span className="member-copy">
                    <strong>{member.name}</strong>
                    <span>{member.detail}</span>
                  </span>
                  <strong className={`amount amount-${member.tone}`}>{member.amount}</strong>
                </div>
              ))}
            </div>

            <div className="group-story-note">
              <span>Shared by 4 members</span>
              <strong>Good food. Clear balances.</strong>
            </div>
          </div>

          <figure className="group-story-media">
            <picture>
              <source
                type="image/avif"
                srcSet={`/${isDark ? "group-story-dark" : "group-story"}.avif`}
              />
              <source
                type="image/webp"
                srcSet={`/${isDark ? "group-story-dark" : "group-story"}.webp`}
              />
              <img
                src={`/${isDark ? "group-story-dark" : "group-story"}.png`}
                alt="Weekly Dinner Club balances and expenses in ShareMoney"
                width="900"
                height="1000"
                loading="eager"
                fetchPriority="high"
              />
            </picture>
            <figcaption>A real ShareMoney group view, using sample data.</figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}
