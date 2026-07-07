/**
 * Deterministic avatar colors: hashing a stable id to a small palette gives
 * each group/person a recognizable hue instead of one monotone tint.
 * Pairs are chosen for WCAG-friendly contrast in each scheme and drawn from
 * the brand family (indigo/violet/teal) plus a few friendly accents.
 */

interface AvatarColorPair {
  background: string;
  foreground: string;
}

const LIGHT_PALETTE: AvatarColorPair[] = [
  { background: "#e0e7ff", foreground: "#3730a3" }, // indigo
  { background: "#ede9fe", foreground: "#5b21b6" }, // violet
  { background: "#ccfbf1", foreground: "#115e59" }, // teal
  { background: "#fce7f3", foreground: "#9d174d" }, // pink
  { background: "#ffedd5", foreground: "#9a3412" }, // orange
  { background: "#dcfce7", foreground: "#166534" }, // green
  { background: "#e0f2fe", foreground: "#075985" }, // sky
  { background: "#fef9c3", foreground: "#854d0e" }, // yellow
];

const DARK_PALETTE: AvatarColorPair[] = [
  { background: "#3730a3", foreground: "#e0e7ff" },
  { background: "#5b21b6", foreground: "#ede9fe" },
  { background: "#115e59", foreground: "#ccfbf1" },
  { background: "#9d174d", foreground: "#fce7f3" },
  { background: "#9a3412", foreground: "#ffedd5" },
  { background: "#166534", foreground: "#dcfce7" },
  { background: "#075985", foreground: "#e0f2fe" },
  { background: "#854d0e", foreground: "#fef9c3" },
];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/**
 * Returns a stable background/foreground pair for the given seed.
 * @param seed - Any stable identifier (group id, user id, name)
 * @param dark - Whether the dark palette should be used
 */
export function getAvatarColors(seed: string, dark: boolean): AvatarColorPair {
  const palette = dark ? DARK_PALETTE : LIGHT_PALETTE;
  return palette[hashString(seed) % palette.length];
}
