import { describe, expect, it } from 'vitest';
import { imageMarkerText } from '../extensions/image-view/marker.ts';
import { imageMarkerSpans, markerSpanAt, segmentAtomicImageMarkers } from '../extensions/image-view/marker-spans.ts';

describe('atomic image markers', () => {
  it('segments a marker as one editor token', () => {
    const marker = imageMarkerText(12);
    const text = `before ${marker} after`;
    const start = text.indexOf(marker);
    expect(imageMarkerSpans(text)).toEqual([{ start, end: start + marker.length, text: marker }]);
    expect(segmentAtomicImageMarkers(text).map((part) => part.segment)).toContain(marker);
    const words = segmentAtomicImageMarkers(text, new Intl.Segmenter('en', { granularity: 'word' }));
    expect(words.map((part) => part.segment)).toEqual(expect.arrayContaining(['before', marker, 'after']));
  });

  it('matches movement and deletion across the whole marker', () => {
    const marker = imageMarkerText(1);
    const text = `x${marker}y`;
    const span = { start: 1, end: 1 + marker.length };
    expect(markerSpanAt(text, 5, 'left')).toMatchObject(span);
    expect(markerSpanAt(text, 5, 'right')).toMatchObject(span);
    expect(markerSpanAt(text, span.end, 'backspace')).toMatchObject(span);
    expect(markerSpanAt(text, span.start, 'delete')).toMatchObject(span);
    expect(markerSpanAt(text, 0, 'delete')).toBeUndefined();
  });
});
