import { describe, expect, it } from 'vitest';

import {
  formatCost,
  formatCwd,
  formatExact,
  formatLatency,
  formatTokens,
  formatTps,
  modelShortId,
  pathTail,
  percentColor,
  shortenPath,
} from '../extensions/status-line/format.ts';

describe('formatTokens', () => {
  it('stays exact below a thousand tokens', () => {
    expect(formatTokens(0)).toBe('0');
    expect(formatTokens(999)).toBe('999');
  });

  it('uses one decimal in the first ten thousand, whole thousands above it', () => {
    expect(formatTokens(1000)).toBe('1.0k');
    expect(formatTokens(9999)).toBe('10.0k');
    expect(formatTokens(10_000)).toBe('10k');
    expect(formatTokens(120_500)).toBe('121k');
  });

  it('switches to millions with one decimal below ten million', () => {
    expect(formatTokens(1_000_000)).toBe('1.0M');
    expect(formatTokens(2_400_000)).toBe('2.4M');
    expect(formatTokens(12_000_000)).toBe('12M');
  });
});

describe('formatTps', () => {
  it('keeps one decimal below ten tokens per second', () => {
    expect(formatTps(9.44)).toBe('9.4');
    expect(formatTps(0.04)).toBe('0');
  });

  it('rounds to whole tokens from ten up and clamps negatives', () => {
    expect(formatTps(10.4)).toBe('10');
    expect(formatTps(82.6)).toBe('83');
    expect(formatTps(-5)).toBe('0');
  });
});

describe('formatLatency', () => {
  it('renders milliseconds below a second', () => {
    expect(formatLatency(0)).toBe('0ms');
    expect(formatLatency(842.4)).toBe('842ms');
  });

  it('renders seconds with one decimal under ten, whole seconds above', () => {
    expect(formatLatency(1000)).toBe('1.0s');
    expect(formatLatency(9840)).toBe('9.8s');
    expect(formatLatency(12_400)).toBe('12s');
    expect(formatLatency(-1)).toBe('0ms');
  });
});

describe('formatCost', () => {
  it('trims trailing zeros so amounts read at their own precision', () => {
    expect(formatCost(0.42)).toBe('$0.42');
    expect(formatCost(2.7)).toBe('$2.7');
    expect(formatCost(17.8)).toBe('$17.8');
    expect(formatCost(0)).toBe('$0');
  });

  it('renders a nonzero amount that rounds to zero as the smallest readable amount', () => {
    expect(formatCost(0.004)).toBe('$0.01');
  });
});

describe('formatExact', () => {
  it('prints plain digits', () => {
    expect(formatExact(35_213)).toBe('35213');
    expect(formatExact(12.6)).toBe('13');
  });
});

describe('percentColor', () => {
  it('stays dim until seventy, warns above it, and errors above ninety', () => {
    expect(percentColor(0)).toBe('dim');
    expect(percentColor(70)).toBe('dim');
    expect(percentColor(70.1)).toBe('warning');
    expect(percentColor(90)).toBe('warning');
    expect(percentColor(90.1)).toBe('error');
    expect(percentColor(null)).toBe('dim');
  });
});

describe('formatCwd', () => {
  it('collapses a path inside the home directory to a tilde form', () => {
    expect(formatCwd('/home/me/dev/app', '/home/me')).toBe('~/dev/app');
    expect(formatCwd('/home/me', '/home/me')).toBe('~');
  });

  it('keeps paths outside home absolute', () => {
    expect(formatCwd('/srv/app', '/home/me')).toBe('/srv/app');
    expect(formatCwd('/home/melanie/app', '/home/me')).toBe('/home/melanie/app');
  });

  it('returns the path unchanged when no home directory is known', () => {
    expect(formatCwd('/srv/app', '')).toBe('/srv/app');
  });
});

describe('shortenPath', () => {
  it('keeps a path that already fits', () => {
    expect(shortenPath('~/dev', 20)).toBe('~/dev');
  });

  it('keeps the tail that identifies the project', () => {
    expect(shortenPath('~/Development/projects/pi-extensions', 15)).toBe('…/pi-extensions');
    expect(shortenPath('~/Development/projects/pi-extensions', 6)).toBe('pi-ex…');
  });

  it('degrades to a truncated last segment when even the tail does not fit', () => {
    expect(shortenPath('~/loooooong-project-name', 4)).toBe('loo…');
  });
});

describe('modelShortId and pathTail', () => {
  it('strips a provider prefix from a model id', () => {
    expect(modelShortId('anthropic/claude-sonnet-4')).toBe('claude-sonnet-4');
    expect(modelShortId('gpt-5')).toBe('gpt-5');
  });

  it('keeps the last two path segments', () => {
    expect(pathTail('~/dev/app')).toBe('dev/app');
    expect(pathTail('~/dev')).toBe('~/dev');
  });
});
