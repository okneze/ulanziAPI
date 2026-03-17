import { config } from '../config/index.js';

/**
 * Estimates the rendered pixel width of a text string on the LED display.
 * Uses a simple heuristic:
 *  - digits and spaces: charWidthPx - 1
 *  - other characters:  charWidthPx
 *  - plus charSpacingPx between every character
 */
export function estimateTextWidth(
  text: string,
  charWidthPx = config.charWidthPx,
  charSpacingPx = config.charSpacingPx
): number {
  if (text.length === 0) return 0;

  let totalWidth = 0;
  for (const ch of text) {
    if (/[\d ]/.test(ch)) {
      totalWidth += charWidthPx - 1;
    } else {
      totalWidth += charWidthPx;
    }
  }
  // Add spacing between characters (n-1 gaps)
  totalWidth += charSpacingPx * (text.length - 1);
  return totalWidth;
}
