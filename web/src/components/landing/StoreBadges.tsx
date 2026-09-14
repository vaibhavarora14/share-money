import { trackCtaClick } from "../../analytics";
import { platformDestinations } from "../../landingContent";

const androidDestination = platformDestinations.find(
  (destination) => destination.platform === "android",
)!;
const iosDestination = platformDestinations.find(
  (destination) => destination.platform === "ios",
)!;

export function StoreBadges({ placement }: { placement: string }) {
  return (
    <div className="store-badges" aria-label="Mobile app availability">
      <a
        className="store-badge-play"
        href={androidDestination.href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={androidDestination.ariaLabel}
        onClick={() => trackCtaClick(androidDestination, placement)}
      >
        <img
          src="/badges/google-play-badge.png"
          alt="Get it on Google Play"
          width="646"
          height="250"
          loading="lazy"
          decoding="async"
        />
      </a>
      <a
        className="store-badge-ios"
        href={iosDestination.href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={iosDestination.ariaLabel}
        onClick={() => trackCtaClick(iosDestination, `${placement}_ios_note`)}
      >
        iOS: App Store listing pending review
      </a>
    </div>
  );
}
