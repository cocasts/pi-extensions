import { describe, expect, it } from 'vitest';

import { frozenThroughput, ttftMs, windowThroughput } from '../extensions/status-line/throughput.ts';

describe('ttftMs', () => {
  it('measures the gap between request and first token', () => {
    expect(ttftMs(1000, 1250)).toBe(250);
  });

  it('reports nothing when either anchor is missing', () => {
    expect(ttftMs(null, 1250)).toBe(null);
    expect(ttftMs(1000, null)).toBe(null);
  });

  it('reports nothing when the first token appears to precede its request', () => {
    expect(ttftMs(1250, 1000)).toBe(null);
    expect(ttftMs(1000, 1000)).toBe(null);
  });
});

describe('frozenThroughput', () => {
  it('computes output over the whole decode window', () => {
    expect(frozenThroughput(2000, 100, 200)).toBe(50);
  });

  it('reports nothing for a burst arrival below the sample floor', () => {
    expect(frozenThroughput(120, 82, 200)).toBe(null);
    expect(frozenThroughput(0, 82, 200)).toBe(null);
  });

  it('keeps a window exactly at the floor', () => {
    expect(frozenThroughput(200, 20, 200)).toBe(100);
  });
});

describe('windowThroughput', () => {
  it('measures the tokens added over the trailing window', () => {
    expect(windowThroughput(1200, 1000, 500)).toBe(400);
  });

  it('never reports a negative rate when a window is re-anchored', () => {
    expect(windowThroughput(900, 1000, 500)).toBe(0);
  });

  it('reports nothing for a zero-length window', () => {
    expect(windowThroughput(1200, 1000, 0)).toBe(null);
  });
});
