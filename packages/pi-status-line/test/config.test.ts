import { describe, expect, it } from 'vitest';

import {
  defaultConfig,
  parseConfig,
  reportConfig,
  resolveEntry,
  THEME_COLORS,
} from '../extensions/status-line/config.ts';
import { MODULE_IDS } from '../extensions/status-line/modules.ts';

describe('default config', () => {
  it('puts the working directory on row one and the session readings on row two', () => {
    const config = defaultConfig();
    expect(config.divider).toBe(' · ');
    expect(config.rows).toHaveLength(2);
    expect(config.rows[0]?.divider).toBe(' ');
    expect(config.rows[0]?.left.map((entry) => entry.id)).toEqual(['path', 'branch', 'session']);
    expect(config.rows[0]?.right).toEqual([]);
    expect(config.rows[1]?.left.map((entry) => entry.id)).toEqual([
      'input',
      'output',
      'cache-hit',
      'tps',
      'cost',
      'context',
    ]);
    expect(config.rows[1]?.right.map((entry) => entry.id)).toEqual(['provider', 'model', 'effort']);
    expect(config.rows[1]?.rightDivider).toBe(' ');
  });

  it('returns a fresh copy each time, so callers cannot mutate the defaults', () => {
    const first = defaultConfig();
    first.rows.length = 0;
    expect(defaultConfig().rows.length).toBe(2);
  });
});

describe('parseConfig', () => {
  it('uses the defaults when the file does not exist', () => {
    const parsed = parseConfig(null);
    expect(parsed.problems).toEqual([]);
    expect(parsed.layout.rows).toHaveLength(2);
    expect(parsed.layout.rows[1]?.left.map((item) => item.def.id)).toEqual([
      'input',
      'output',
      'cache-hit',
      'tps',
      'cost',
      'context',
    ]);
  });

  it('falls back to the defaults with one problem when the JSON is broken', () => {
    const parsed = parseConfig('{ "rows": [');
    expect(parsed.problems).toHaveLength(1);
    expect(parsed.problems[0]).toContain('not valid JSON');
    expect(parsed.layout.rows[1]?.right.map((item) => item.def.id)).toEqual(['provider', 'model', 'effort']);
  });

  it('falls back to the defaults when the document is not an object', () => {
    const parsed = parseConfig('[]');
    expect(parsed.problems[0]).toContain('must be a JSON object');
    expect(parsed.config.rows).toHaveLength(2);
  });

  it('reads a full rows config, keeping row order and per-module overrides', () => {
    const parsed = parseConfig(
      JSON.stringify({
        divider: ' · ',
        rows: [
          { divider: ' ', left: [{ id: 'path', format: 'tail' }] },
          {
            left: [{ id: 'context', format: 'percent', label: 'word', color: 'accent', prefix: '(', suffix: ')' }],
            right: [{ id: 'model', format: 'short', label: 'word' }],
            rightDivider: '  ',
          },
        ],
      }),
    );
    expect(parsed.problems).toEqual([]);
    expect(parsed.layout.rows[0]?.divider).toBe(' ');
    expect(parsed.layout.rows[1]?.divider).toBe(' · ');
    expect(parsed.layout.rows[1]?.rightDivider).toBe('  ');
    expect(parsed.layout.rows).toHaveLength(2);
    expect(parsed.layout.rows[1]?.left[0]).toMatchObject({
      label: 'word',
      format: 'percent',
      color: 'accent',
      prefix: '(',
      suffix: ')',
    });
    expect(parsed.layout.rows[1]?.left[0]?.def.id).toBe('context');
    expect(parsed.layout.rows[1]?.right[0]).toMatchObject({ format: 'short', label: 'word' });
    // An omitted side is empty inside an explicit row.
    expect(parsed.layout.rows[0]?.right).toEqual([]);
  });

  it('accepts the bare-id shorthand for a module', () => {
    const parsed = parseConfig(JSON.stringify({ rows: [{ left: ['input', 'context'], right: [] }] }));
    expect(parsed.problems).toEqual([]);
    expect(parsed.layout.rows[0]?.left.map((item) => item.def.id)).toEqual(['input', 'context']);
  });

  it('allows the rows to be cleared', () => {
    const parsed = parseConfig(JSON.stringify({ rows: [] }));
    expect(parsed.problems).toEqual([]);
    expect(parsed.layout.rows).toEqual([]);
  });

  it('reads the legacy top-level left/right pair as a single row', () => {
    const parsed = parseConfig(JSON.stringify({ left: ['input'], right: ['model'] }));
    expect(parsed.problems).toEqual([]);
    expect(parsed.layout.rows).toHaveLength(1);
    expect(parsed.layout.rows[0]?.left.map((item) => item.def.id)).toEqual(['input']);
    expect(parsed.layout.rows[0]?.right.map((item) => item.def.id)).toEqual(['model']);
  });

  it('falls back to the metrics row defaults when only one legacy side is given', () => {
    const parsed = parseConfig(JSON.stringify({ left: ['cost'] }));
    expect(parsed.layout.rows[0]?.right.map((item) => item.def.id)).toEqual(['provider', 'model', 'effort']);
  });

  it('skips an unknown module and names the valid ids', () => {
    const parsed = parseConfig(JSON.stringify({ rows: [{ left: [{ id: 'tokens' }, { id: 'input' }], right: [] }] }));
    expect(parsed.layout.rows[0]?.left.map((item) => item.def.id)).toEqual(['input']);
    expect(parsed.problems[0]).toContain('unknown module "tokens"');
    expect(parsed.problems[0]).toContain('context');
  });

  it('falls back to the module default when a format does not exist, and lists the known ones', () => {
    const parsed = parseConfig(JSON.stringify({ rows: [{ left: [{ id: 'context', format: 'gauge' }] }] }));
    expect(parsed.layout.rows[0]?.left[0]?.format).toBe('native');
    expect(parsed.problems[0]).toContain('context has no format "gauge"');
    expect(parsed.problems[0]).toContain('native | window | tokens | percent');
  });

  it('drops an unknown theme colour and keeps the module colour', () => {
    const parsed = parseConfig(JSON.stringify({ rows: [{ left: [{ id: 'input', color: 'neon' }] }] }));
    expect(parsed.layout.rows[0]?.left[0]?.color).toBe(null);
    expect(parsed.problems[0]).toContain('unknown theme color "neon"');
  });

  it('falls back to the default label when the label style is not one of the three', () => {
    const parsed = parseConfig(JSON.stringify({ rows: [{ left: [{ id: 'input', label: 'icon' }] }] }));
    expect(parsed.layout.rows[0]?.left[0]?.label).toBe('glyph');
    expect(parsed.problems[0]).toContain('label must be one of none | glyph | word');
  });

  it('ignores a non-string prefix or suffix with one problem each', () => {
    const parsed = parseConfig(JSON.stringify({ rows: [{ left: [{ id: 'input', prefix: 1, suffix: false }] }] }));
    expect(parsed.layout.rows[0]?.left[0]?.prefix).toBe('');
    expect(parsed.layout.rows[0]?.left[0]?.suffix).toBe('');
    expect(parsed.problems).toHaveLength(2);
  });

  it('treats a non-array side as empty inside an explicit row', () => {
    const parsed = parseConfig(JSON.stringify({ rows: [{ left: 'input', right: [] }] }));
    expect(parsed.problems[0]).toContain('rows[0].left must be an array');
    expect(parsed.config.rows[0]?.left).toEqual([]);
    expect(parsed.config.rows[0]?.right).toEqual([]);
  });

  it('falls back to the default rows when rows is not an array', () => {
    const parsed = parseConfig(JSON.stringify({ rows: 'input' }));
    expect(parsed.problems[0]).toContain('rows must be an array');
    expect(parsed.config.rows).toHaveLength(2);
  });

  it('skips a non-object row and keeps the valid ones', () => {
    const parsed = parseConfig(JSON.stringify({ rows: ['nope', { left: ['input'] }] }));
    expect(parsed.problems[0]).toContain('rows[0]: expected an object');
    expect(parsed.layout.rows).toHaveLength(1);
  });

  it('falls back to the default separator when the divider is not a string or contains a newline', () => {
    expect(parseConfig(JSON.stringify({ divider: 1 })).problems[0]).toContain('divider must be a string');
    const parsed = parseConfig(JSON.stringify({ divider: '·\n' }));
    expect(parsed.problems[0]).toContain('divider must not contain a newline');
    expect(parsed.config.divider).toBe(' · ');
  });

  it('validates a row-level divider and falls back to the global one', () => {
    const parsed = parseConfig(
      JSON.stringify({
        rows: [
          { divider: 1, left: ['input'] },
          { leftDivider: ' ', left: ['output'] },
        ],
      }),
    );
    expect(parsed.problems[0]).toContain('rows[0].divider must be a string');
    expect(parsed.layout.rows[0]?.divider).toBe(' · ');
    expect(parsed.layout.rows[1]?.divider).toBe(' ');
    expect(parsed.layout.rows[1]?.rightDivider).toBe(' · ');
  });
});

describe('resolveEntry', () => {
  it('fills every unset field from the module defaults', () => {
    const resolved = resolveEntry({ id: 'cache-hit' });
    expect(resolved).toMatchObject({ label: 'glyph', format: 'percent', color: null, prefix: '', suffix: '' });
  });
});

describe('THEME_COLORS', () => {
  it('lists pi foreground tokens and no background tokens', () => {
    expect(THEME_COLORS).toContain('accent');
    expect(THEME_COLORS).toContain('thinkingHigh');
    expect(THEME_COLORS).not.toContain('selectedBg' as never);
    expect(new Set(THEME_COLORS).size).toBe(THEME_COLORS.length);
  });
});

describe('reportConfig', () => {
  it('prints every row and side with each resolved field and its source', () => {
    const parsed = parseConfig(
      JSON.stringify({
        rows: [{ left: [{ id: 'path' }] }, { left: [{ id: 'context', format: 'percent' }], right: [{ id: 'model' }] }],
      }),
    );
    const report = reportConfig(parsed, '/tmp/config.json').join('\n');
    expect(report).toContain('config: /tmp/config.json');
    expect(report).toContain('divider: " · "');
    expect(report).toContain('row[0]:\n  divider: " · "');
    expect(report).toContain('row[1]:');
    expect(report).toContain(
      'context    label=none (default)  format=percent  color=pressure colour (70% / 90%) (module)  priority=1000 floor',
    );
    expect(report).toContain('model      label=none (default)');
    expect(report).toContain('problems:\n  none — config is valid');
  });

  it('prints every problem when the config was corrected', () => {
    const parsed = parseConfig(JSON.stringify({ rows: [{ left: [{ id: 'nope' }] }] }));
    const report = reportConfig(parsed, 'inline').join('\n');
    expect(report).toContain('problems:\n  - rows[0].left[0]: unknown module "nope"');
    expect(report).toContain('right:\n    (empty)');
  });

  it('accepts every registry module id as valid', () => {
    for (const id of MODULE_IDS) {
      const parsed = parseConfig(JSON.stringify({ rows: [{ left: [{ id }] }] }));
      expect(parsed.problems).toEqual([]);
      expect(parsed.config.rows[0]?.left[0]?.id).toBe(id);
    }
  });
});
