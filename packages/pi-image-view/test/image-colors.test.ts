import { describe, expect, it } from 'vitest';
import { IMAGE_COLOR_TOKENS, imageColorToken } from '../extensions/image-view/image-colors.ts';
import { colorizeMarkerLine, imageMarkerNumber } from '../extensions/image-view/marker.ts';

describe('stable image colors', () => {
  it('maps positive marker numbers to a stable cycling theme palette', () => {
    expect(imageColorToken(1)).toBe(IMAGE_COLOR_TOKENS[0]);
    expect(imageColorToken(2)).toBe(IMAGE_COLOR_TOKENS[1]);
    expect(imageColorToken(IMAGE_COLOR_TOKENS.length + 1)).toBe(IMAGE_COLOR_TOKENS[0]);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'falls back to the first color for invalid marker number %s',
    (markerNumber) => {
      expect(imageColorToken(markerNumber)).toBe(IMAGE_COLOR_TOKENS[0]);
    },
  );

  it('reads the stable number from a complete image marker', () => {
    expect(imageMarkerNumber('[🖼️ #12]')).toBe(12);
    expect(imageMarkerNumber('🖼️ #12')).toBeUndefined();
    expect(imageMarkerNumber('prefix [🖼️ #12] suffix')).toBeUndefined();
  });

  it('colorizes each complete marker, including brackets, with its marker number', () => {
    const line = '[🖼️ #1] and [🖼️ #2]';
    const rendered = colorizeMarkerLine(
      line,
      (text, markerNumber) => `<color-${markerNumber}>${text}</color-${markerNumber}>`,
    );

    expect(rendered).toBe('<color-1>[🖼️ #1]</color-1> and <color-2>[🖼️ #2]</color-2>');
  });
});
