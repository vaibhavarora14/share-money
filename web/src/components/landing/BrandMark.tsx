type BrandMarkProps = {
  variant?: "color" | "mono" | "inverse";
  className?: string;
  title?: string;
};

export function BrandMark({
  variant = "color",
  className = "",
  title,
}: BrandMarkProps) {
  const isDecorative = !title;

  return (
    <svg
      viewBox="0 0 48 48"
      className={`brand-mark brand-mark-${variant} ${className}`.trim()}
      role={isDecorative ? undefined : "img"}
      aria-hidden={isDecorative ? true : undefined}
      aria-label={title}
      focusable="false"
    >
      <path
        className="brand-mark-slip brand-mark-slip-coral"
        d="M10.5 20 14.2 8.2a2.4 2.4 0 0 1 3-1.6l12.2 3.8-3.2 10.8L10.5 20Z"
      />
      <path
        className="brand-mark-slip brand-mark-slip-green"
        d="m23 20.4 4.8-11a2.4 2.4 0 0 1 3.2-1.2l10.4 4.7-3.9 9.5L23 20.4Z"
      />
      <path
        className="brand-mark-pocket"
        d="M5.5 18.2h37v17.5a6.8 6.8 0 0 1-6.8 6.8H12.3a6.8 6.8 0 0 1-6.8-6.8V18.2Z"
      />
      <path
        className="brand-mark-stitch"
        d="M10.2 23.1c8.8 2.3 18.8 2.3 27.6 0"
      />
    </svg>
  );
}

export function BrandLockup({ inverted = false }: { inverted?: boolean }) {
  return (
    <span className={`brand-lockup ${inverted ? "brand-lockup-inverse" : ""}`}>
      <BrandMark variant={inverted ? "inverse" : "color"} />
      <span className="brand-wordmark">OweWho</span>
    </span>
  );
}
