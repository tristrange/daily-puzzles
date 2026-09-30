/**
 * WCAG relative luminance and contrast ratio.
 *
 * Not part of the running app — nothing in the UI needs it. It is here because
 * two palette suites need it (`theme.test.ts` for the page colours,
 * `colours.test.ts` for the piece and the mark), and two copies of the sRGB
 * transfer function is two places for the arithmetic to drift apart and quietly
 * disagree about whether something is readable.
 */

/** Parses `#rgb`, `#rrggbb` or `#rrggbbaa`, ignoring any alpha. */
export function parseHex(hex: string): [number, number, number] {
  const full =
    hex.length === 4
      ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
      : hex.slice(0, 7)
  return [1, 3, 5].map((offset) => Number.parseInt(full.slice(offset, offset + 2), 16)) as [
    number,
    number,
    number,
  ]
}

/** WCAG 2.1 relative luminance, 0 for black and 1 for white. */
export function relativeLuminance(hex: string): number {
  const channels = parseHex(hex).map((channel) => {
    const value = channel / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  const [red, green, blue] = channels as [number, number, number]
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

/** WCAG 2.1 contrast ratio, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const first = relativeLuminance(a)
  const second = relativeLuminance(b)
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
}
