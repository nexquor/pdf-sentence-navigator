/**
 * layoutBoundaries.ts
 *
 * Detects paragraph / bullet-line boundaries in PDF text using layout
 * signals (baseline Y jump, left-edge X dedent) — signals a punctuation-only
 * tokenizer (regex or Intl.Segmenter) can never see, since slide bullets and
 * list items routinely end with no terminal punctuation at all.
 */

export interface LinePos {
  x: number;      // transform[4] — left edge of this text item, in viewport space
  y: number;      // transform[5] — baseline of this text item, in viewport space
  height: number; // approx font height for this item (see fontHeight calc in viewer.ts)
}

export interface LayoutBreakOptions {
  /** Vertical gap beyond this multiple of the previous line's height counts as a paragraph/bullet break. */
  yGapMultiplier?: number;
  /** How far (in px) the left edge must dedent to count as a new list item, relative to the recent min-x. */
  xDedentPx?: number;
}

const DEFAULTS: Required<LayoutBreakOptions> = {
  yGapMultiplier: 1.4,
  xDedentPx: 6,
};

/**
 * Returns true if `curr` should start a new paragraph/bullet relative to `prev`.
 * `minRecentX` is the smallest left-edge x seen on the current paragraph so far —
 * track it in your render loop and reset it whenever a break is detected.
 */
export function isLayoutBreak(
  prev: LinePos | null,
  curr: LinePos,
  minRecentX: number,
  opts: LayoutBreakOptions = {}
): boolean {
  if (!prev) return false;
  const { yGapMultiplier, xDedentPx } = { ...DEFAULTS, ...opts };

  const yGap = curr.y - prev.y; // positive = moved down the page
  const lineHeight = prev.height || curr.height || 1;

  // Signal 1: extra vertical spacing beyond a normal line-wrap gap.
  if (yGap > lineHeight * yGapMultiplier) return true;

  // Signal 2: same line height / gap, but the line dedents left of the
  // paragraph's established margin — catches bullets stacked with tight
  // leading, which the Y-gap check alone would miss.
  if (yGap > lineHeight * 0.5 && curr.x < minRecentX - xDedentPx) return true;

  return false;
}

/**
 * Merge Intl.Segmenter sentence-end offsets with layout-break offsets into
 * one sorted, deduplicated list of forced sentence boundaries.
 */
export function mergeBoundaries(
  segmenterOffsets: number[],
  layoutOffsets: number[]
): number[] {
  return Array.from(new Set([...segmenterOffsets, ...layoutOffsets])).sort(
    (a, b) => a - b
  );
}
