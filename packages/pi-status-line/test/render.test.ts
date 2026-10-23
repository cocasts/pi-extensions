import { visibleWidth } from '@earendil-works/pi-tui';
import { describe, expect, it } from 'vitest';

import { defaultConfig, toLayout } from '../extensions/status-line/config.ts';
import type { ModuleId } from '../extensions/status-line/modules.ts';
import { type Layout, renderStatusLine } from '../extensions/status-line/render.ts';
import { entry, parts, plainTheme } from './fixtures.ts';

const single = (left: ModuleId[], right: ModuleId[], divider = ' '): Layout => ({
  rows: [
    {
      left: left.map((id) => entry(id)),
      right: right.map((id) => entry(id)),
      divider,
      rightDivider: divider,
    },
  ],
});

const defaultLayout = (): Layout => toLayout(defaultConfig());

const render = (width: number, layout: Layout = defaultLayout()): string[] =>
  renderStatusLine(plainTheme, width, layout, parts());

describe('multi-row layout', () => {
  it('renders the working directory on row one and the readings on row two', () => {
    const [first, second] = render(200);
    expect(first).toBe('~/dev/app (main) • fix-footer');

    const left = '↑ 35k · ↓ 1.2k · ◎ 99.8% · ϟ 82/s · $0.42 · 17.0%/200k';
    const right = '(clinepass) anthropic/claude-sonnet-4 • medium';
    expect(second).toBe(left + ' '.repeat(200 - left.length - right.length) + right);
  });

  it('renders a wide single row as left metrics, padding, then right identity', () => {
    const layout = single(['input', 'output', 'cache-hit', 'tps', 'cost', 'context'], ['provider', 'model', 'effort']);
    const left = '↑ 35k ↓ 1.2k ◎ 99.8% ϟ 82/s $0.42 17.0%/200k';
    const right = '(clinepass) anthropic/claude-sonnet-4 medium';
    expect(render(120, layout)).toEqual([left + ' '.repeat(120 - left.length - right.length) + right]);
  });

  it('follows the configured order inside each side', () => {
    const line = render(120, single(['context', 'input'], ['effort', 'model']))[0] ?? '';
    expect(line.startsWith('17.0%/200k ↑ 35k')).toBe(true);
    expect(line.endsWith('medium anthropic/claude-sonnet-4')).toBe(true);
  });

  it('skips a module with no value without leaving a dangling divider', () => {
    const layout = single(['branch', 'input'], []);
    expect(renderStatusLine(plainTheme, 80, layout, parts({ branch: null }))).toEqual(['↑ 35k']);
  });

  it('omits a row that has nothing to show rather than rendering a blank line', () => {
    const layout: Layout = {
      rows: [
        { left: [], right: [], divider: ' ', rightDivider: ' ' },
        { left: [entry('input')], right: [], divider: ' ', rightDivider: ' ' },
      ],
    };
    expect(render(40, layout)).toEqual(['↑ 35k']);
  });

  it('right-aligns the right group when the left side is empty', () => {
    const model = 'anthropic/claude-sonnet-4';
    expect(render(60, single([], ['model']))).toEqual([' '.repeat(60 - model.length) + model]);
  });

  it('renders a cleared layout as one blank line', () => {
    expect(render(20, { rows: [] })).toEqual(['']);
  });

  it('honours prefix and suffix in the laid-out row', () => {
    const layout: Layout = {
      rows: [
        {
          left: [entry('input', { prefix: '[', suffix: ']' })],
          right: [],
          divider: ' ',
          rightDivider: ' ',
        },
      ],
    };
    expect(render(20, layout)).toEqual(['[↑ 35k]']);
  });

  it('uses a different divider per side when the row configures one', () => {
    const layout: Layout = {
      rows: [
        {
          left: [entry('input'), entry('output')],
          right: [entry('provider'), entry('model')],
          divider: ' · ',
          rightDivider: ' ',
        },
      ],
    };
    const [line = ''] = render(60, layout);
    expect(line.startsWith('↑ 35k · ↓ 1.2k')).toBe(true);
    expect(line.endsWith('(clinepass) anthropic/claude-sonnet-4')).toBe(true);
    expect(line).not.toContain('(clinepass) · ');
  });
});

describe('shrink order', () => {
  const metrics = () =>
    single(['input', 'output', 'cache-hit', 'tps', 'context', 'cost'], ['provider', 'model', 'effort']);

  it('shrinks each row on its own, so a narrow terminal keeps both the directory and the context', () => {
    const lines = render(40);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('~/dev/app');
    expect(lines[1]).toContain('17.0%/200k');
  });

  it('drops the session and branch before the path on the directory row', () => {
    expect(render(25)[0]).toBe('~/dev/app (main)');
    expect(render(12)[0]).toBe('~/dev/app');
  });

  it('keeps dropping by priority as the terminal narrows', () => {
    expect(render(110, metrics())[0]).toContain('ϟ');
    expect(render(40, metrics())[0]).not.toContain('ϟ');
    expect(render(40, metrics())[0]).toContain('17.0%/200k');
  });

  it('drops a low-priority module on the right before a higher-priority one on the left', () => {
    expect(render(10, single(['input'], ['effort']))[0]?.trim()).toBe('↑ 35k');
  });

  it('keeps dropping until only the floor is left, rather than truncating a module early', () => {
    expect(render(20, metrics())[0]?.trim()).toBe('17.0%/200k');
  });

  it('never drops the context floor, even at a width where nothing else fits', () => {
    const [line = ''] = render(12, metrics());
    expect(line).toContain('17.0%/200k');
    expect(visibleWidth(line)).toBeLessThanOrEqual(12);
  });

  it('truncates the last module instead of leaving the row empty', () => {
    const [line = ''] = render(4, single([], ['context']));
    expect(visibleWidth(line)).toBeLessThanOrEqual(4);
    expect(line).toContain('…');
  });

  it('truncates a directory that cannot fit at all', () => {
    const [line = ''] = render(5, single(['path'], []));
    expect(visibleWidth(line)).toBeLessThanOrEqual(5);
    expect(line).toContain('…');
  });

  it('renders every row within the terminal width', () => {
    const layout: Layout = {
      rows: [
        { left: [entry('path')], right: [], divider: ' ', rightDivider: ' ' },
        {
          left: [entry('input'), entry('output')],
          right: [entry('model')],
          divider: ' ',
          rightDivider: ' ',
        },
      ],
    };
    const lines = render(20, layout);
    expect(lines.every((line) => visibleWidth(line) <= 20)).toBe(true);
  });
});
