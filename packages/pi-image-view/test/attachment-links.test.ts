import { describe, expect, it } from 'vitest';
import {
  createImageMarkerLink,
  renderImageMarkerLinks,
  sanitizeModelMessages,
  stripImageMarkerLinks,
} from '../extensions/image-view/attachment-links.ts';

describe('attachment links', () => {
  const ref = `image-view://sha256/${'a'.repeat(64)}.png`;
  const fileRef = `file:///tmp/image-view/blobs/${'a'.repeat(64)}.png`;

  it('stores an internal reference while rendering a clickable file link', () => {
    const stored = createImageMarkerLink('[🖼️ #1]', ref);
    expect(stored).toBe(`[[🖼️ #1]](${ref})`);
    expect(renderImageMarkerLinks(stored, () => '/tmp/blob.png')).toBe('[[🖼️ #1]](file:///tmp/blob.png)');
  });

  it('keeps direct file targets clickable while hiding them from model context', () => {
    const stored = createImageMarkerLink('[🖼️ #1]', fileRef);
    expect(stored).toBe(`[[🖼️ #1]](${fileRef})`);
    expect(renderImageMarkerLinks(stored, () => undefined)).toBe(stored);
    expect(stripImageMarkerLinks(stored)).toBe('[🖼️ #1]');
  });

  it('removes internal targets from model-facing text', () => {
    expect(stripImageMarkerLinks(`Compare [🖼️ #1](${ref}) now`)).toBe('Compare [🖼️ #1] now');
  });

  it('sanitizes string and structured text without changing image blocks', () => {
    const image = { type: 'image', data: 'RAW', mimeType: 'image/png' };
    const messages = sanitizeModelMessages([
      { role: 'user', content: `[🖼️ #1](${ref})` },
      { role: 'user', content: [{ type: 'text', text: `See [🖼️ #1](${ref})` }, image] },
    ]);
    expect(messages).toEqual([
      { role: 'user', content: '[🖼️ #1]' },
      { role: 'user', content: [{ type: 'text', text: 'See [🖼️ #1]' }, image] },
    ]);
  });

  it('keeps legacy [Image #N] markers from older sessions readable and clickable', () => {
    const legacy = `[[Image #2]](${fileRef})`;
    expect(stripImageMarkerLinks(legacy)).toBe('[Image #2]');
    // Direct file targets stay clickable; only the label migrates to the icon format.
    expect(renderImageMarkerLinks(legacy, () => undefined)).toBe(`[[🖼️ #2]](${fileRef})`);
    // Internal references resolve to clickable file links for display.
    expect(renderImageMarkerLinks(`[[Image #2]](${ref})`, () => '/tmp/legacy.png')).toBe(
      '[[🖼️ #2]](file:///tmp/legacy.png)',
    );
    expect(stripImageMarkerLinks(`Plain [Image #3](${ref}) tail`)).toBe('Plain [Image #3] tail');
  });

  it('ignores markdown links that do not carry a marker label', () => {
    const foreign = `[a screenshot](file:///tmp/image-view/blobs/${'a'.repeat(64)}.png)`;
    expect(stripImageMarkerLinks(foreign)).toBe(foreign);
  });
});
