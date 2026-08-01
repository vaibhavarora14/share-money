import { type LucideProps, Database, Globe, Lock, ShieldCheck } from "lucide-react";
import type { ComponentType } from "react";

type TrustBadge = {
  icon: ComponentType<LucideProps>;
  text: string;
};

export function TrustBadges() {
  const badges: TrustBadge[] = [
    {
      icon: Lock,
      text: "Data encryption for transport and storage",
    },
    {
      icon: ShieldCheck,
      text: "No payment instruments stored",
    },
    {
      icon: Database,
      text: "Cloud sync with group history",
    },
    {
      icon: Globe,
      text: "Multi-currency aware groups",
    },
  ];

  return (
    <div className="trust-badges" aria-label="Trust highlights">
      {badges.map((badge) => (
        <div className="trust-badge" key={badge.text}>
          <span className="trust-badge-icon" aria-hidden>
            <badge.icon size={20} />
          </span>
          <span>{badge.text}</span>
        </div>
      ))}
    </div>
  );
}
