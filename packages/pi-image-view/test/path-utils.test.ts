import { describe, expect, it } from 'vitest';
import { inferMimeType } from '../extensions/image-view/path-utils.ts';

describe('image MIME inference', () => {
  it('recognizes a PNG path as a PNG image', () => {
    expect(inferMimeType('/tmp/example.png')).toBe('image/png');
  });

  it('does not treat a non-image file as an image', () => {
    expect(inferMimeType('/tmp/example.txt')).toBe(null);
  });
});
