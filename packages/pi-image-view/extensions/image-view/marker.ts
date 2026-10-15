/**
 * Single source of truth for the image marker format.
 *
 * Markers render as `[🖼️ #N]` in the editor. The icon is U+1F5BC (frame with
 * picture) followed by U+FE0F (variation selector-16) so terminals use emoji
 * presentation and pi-tui's width helpers count it as a stable 2 columns,
 * matching mainstream terminal rendering.
 *
 * Legacy `[Image #N]` markers written by older sessions stay readable:
 * attachment-links keeps legacy-only patterns for stripping and rendering.
 */

export const IMAGE_MARKER_ICON = '\u{1F5BC}\u{FE0F}';

const MARKER_NUMBER_SOURCE = String.raw`#(\d+)`;

/** Inner marker content without brackets, e.g. `🖼️ #(\d+)` — composable into link regexes. */
export function markerInnerPattern(): string {
  return `${IMAGE_MARKER_ICON} ${MARKER_NUMBER_SOURCE}`;
}

/** Matches a bare icon marker like `[🖼️ #12]`. */
export const IMAGE_MARKER_RE = new RegExp(String.raw`\[${markerInnerPattern()}\]`, 'gu');
const EXACT_IMAGE_MARKER_RE = new RegExp(`^${IMAGE_MARKER_RE.source}$`, 'u');

export function imageMarkerText(number: number): string {
  return `[${IMAGE_MARKER_ICON} #${number}]`;
}

export function isImageMarkerLabel(label: string): boolean {
  return imageMarkerNumber(label) !== undefined;
}

/** Read the one-based number from one complete icon marker. */
export function imageMarkerNumber(marker: string): number | undefined {
  const value = Number(EXACT_IMAGE_MARKER_RE.exec(marker)?.[1]);
  return Number.isSafeInteger(value) && value >= 1 ? value : undefined;
}

/**
 * Colorize every complete image marker in one rendered editor line. Lines whose
 * markers are broken up by embedded ANSI (a fake cursor resting on the marker)
 * are left untouched.
 */
export function colorizeMarkerLine(line: string, colorize: (text: string, markerNumber: number) => string): string {
  if (!line.includes(IMAGE_MARKER_ICON)) return line;
  return line.replace(IMAGE_MARKER_RE, (match, markerNumber: string) => colorize(match, Number(markerNumber)));
}
