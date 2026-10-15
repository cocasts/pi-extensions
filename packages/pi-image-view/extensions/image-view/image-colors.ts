/**
 * Theme roles chosen for visual separation while still adapting to the active
 * Pi theme and its terminal color mode.
 */
export const IMAGE_COLOR_TOKENS = [
  'accent',
  'mdLink',
  'syntaxVariable',
  'success',
  'warning',
  'thinkingXhigh',
] as const;

export type ImageColorToken = (typeof IMAGE_COLOR_TOKENS)[number];

/** Return a stable theme role for a one-based image marker number. */
export function imageColorToken(markerNumber: number): ImageColorToken {
  if (!Number.isSafeInteger(markerNumber) || markerNumber < 1) return IMAGE_COLOR_TOKENS[0];
  return IMAGE_COLOR_TOKENS[(markerNumber - 1) % IMAGE_COLOR_TOKENS.length]!;
}
