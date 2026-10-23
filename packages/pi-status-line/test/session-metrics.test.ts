import { describe, expect, it } from 'vitest';

import { collectTotals } from '../extensions/status-line/session-metrics.ts';

const assistant = (usage: Record<string, unknown>) => ({
  type: 'message',
  message: { role: 'assistant', usage },
});

const usage = (overrides: Record<string, unknown> = {}) => ({
  input: 100,
  output: 40,
  cacheRead: 300,
  cacheWrite: 0,
  cost: { total: 0.5 },
  ...overrides,
});

describe('collectTotals', () => {
  it('sums input, output, and cost across assistant turns and tool results', () => {
    const totals = collectTotals([
      assistant(usage()),
      assistant(usage({ input: 200, output: 60, cost: { total: 1.25 } })),
      {
        type: 'message',
        message: { role: 'toolResult', usage: usage({ input: 50, output: 0, cost: { total: 0.25 } }) },
      },
    ]);
    expect(totals).toMatchObject({ input: 350, output: 100, cost: 2 });
  });

  it('takes the cache hit rate from the most recent assistant prompt, not an average', () => {
    const totals = collectTotals([
      assistant(usage({ cacheRead: 0 })), // 0%
      assistant(usage({ cacheRead: 900, input: 100, cacheWrite: 0 })), // 90%
    ]);
    expect(totals.cacheHitRate).toBe(90);
  });

  it('counts compaction and branch-summary calls as spend', () => {
    const totals = collectTotals([
      { type: 'compaction', usage: usage({ input: 10, output: 0, cost: { total: 0.1 } }) },
      { type: 'branch_summary', usage: usage({ input: 10, output: 0, cost: { total: 0.2 } }) },
    ]);
    expect(totals.cost).toBeCloseTo(0.3);
    expect(totals.input).toBe(20);
  });

  it('leaves the cache hit rate unset until an assistant prompt exists', () => {
    expect(collectTotals([]).cacheHitRate).toBe(null);
    expect(collectTotals([{ type: 'message', message: { role: 'user', content: 'hi' } }]).cacheHitRate).toBe(null);
  });

  it('degrades to zeros on a truncated or hand-edited session entry', () => {
    const totals = collectTotals([
      null,
      'garbage',
      { type: 'message', message: { role: 'assistant' } },
      assistant({ input: 'lots', output: Number.NaN, cost: 'free' }),
    ]);
    expect(totals).toEqual({ input: 0, output: 0, cacheHitRate: null, cost: 0 });
  });
});
