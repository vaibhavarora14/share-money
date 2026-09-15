/** Reserve space for the currency symbol beside the hero amount on web. */
export const HERO_AMOUNT_SYMBOL_RESERVE = 64;

/** Approximate glyph width for the hero amount at fontSize 45 / letterSpacing -2. */
export const HERO_AMOUNT_WEB_CHAR_WIDTH = 28;

/**
 * Compute web-only width for the hero amount TextInput.
 * Caps content-sized width so the default browser ~20ch input sizing cannot overflow.
 */
export function getWebHeroAmountInputWidth(
  amountLength: number,
  containerWidth: number
): { width: number; maxWidth: number | "100%" } {
  const maxWidth =
    containerWidth > 0
      ? Math.max(containerWidth - HERO_AMOUNT_SYMBOL_RESERVE, 40)
      : ("100%" as const);

  const contentWidth = Math.max((amountLength || 1) * HERO_AMOUNT_WEB_CHAR_WIDTH, 40);
  const width =
    typeof maxWidth === "number"
      ? Math.min(contentWidth, maxWidth)
      : contentWidth;

  return { width, maxWidth };
}
