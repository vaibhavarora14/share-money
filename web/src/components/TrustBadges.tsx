/**
 * Trust Badges Component
 * Displays security, privacy, and reliability indicators
 */
export function TrustBadges() {
  const badges = [
    { icon: "🔒", text: "Secure Data Storage" },
    { icon: "🛡️", text: "Privacy First" },
    { icon: "⚡", text: "Real-Time Sync" },
    { icon: "🌍", text: "Multi-Currency" }
  ];

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      gap: '2rem',
      flexWrap: 'wrap',
      padding: '2rem 0',
      borderTop: '1px solid var(--color-border)',
      borderBottom: '1px solid var(--color-border)'
    }}>
      {badges.map((badge, index) => (
        <div
          key={index}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            color: 'var(--color-text-secondary)',
            fontSize: '0.875rem',
            fontWeight: 500
          }}
        >
          <span style={{ fontSize: '1.5rem' }}>{badge.icon}</span>
          <span>{badge.text}</span>
        </div>
      ))}
    </div>
  );
}

