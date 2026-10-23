import type { Theme } from '@earendil-works/pi-coding-agent';
import { describe, expect, it } from 'vitest';

import { MODULES, type ResolvedEntry, renderModule } from '../extensions/status-line/modules.ts';
import { entry, parts, plainTheme } from './fixtures.ts';

/** A theme that labels each styled run with its theme token, so colour choices are observable. */
const taggedTheme = { fg: (color: string, text: string) => `<${color}>${text}</>` } as unknown as Theme;

const render = (id: keyof typeof MODULES, data = parts(), overrides: Partial<ResolvedEntry> = {}): string | null =>
  renderModule(plainTheme, entry(id, overrides), data);

describe('module values', () => {
  it('renders the model id, with a short form that drops the provider prefix', () => {
    expect(render('model')).toBe('anthropic/claude-sonnet-4');
    expect(render('model', parts(), { format: 'short' })).toBe('claude-sonnet-4');
  });

  it('renders the provider in parentheses or bare, and hides it when unknown', () => {
    expect(render('provider')).toBe('(clinepass)');
    expect(render('provider', parts(), { format: 'name' })).toBe('clinepass');
    expect(render('provider', parts({ provider: null }))).toBe(null);
  });

  it('renders the thinking level, word or initial, in the native dim colour', () => {
    expect(MODULES.effort.value(parts(), 'native')).toEqual({ text: 'medium', color: 'dim' });
    expect(MODULES.effort.value(parts(), 'word')).toEqual({ text: 'medium', color: 'dim' });
    expect(MODULES.effort.value(parts(), 'initial')?.text).toBe('M');
    expect(MODULES.effort.value(parts({ effort: 'off' }), 'native')?.text).toBe('thinking off');
    expect(MODULES.effort.value(parts({ effort: 'off' }), 'word')?.text).toBe('off');
    expect(MODULES.effort.value(parts({ effort: null }), 'native')).toBe(null);
  });

  it('renders the path home-relative or as its tail', () => {
    expect(render('path')).toBe('~/dev/app');
    expect(render('path', parts(), { format: 'tail' })).toBe('dev/app');
    expect(render('path', parts({ path: '' }))).toBe(null);
  });

  it('renders the branch parenthesised like the native footer, or bare', () => {
    expect(render('branch')).toBe('(main)');
    expect(render('branch', parts(), { format: 'name' })).toBe('main');
    expect(render('branch', parts({ branch: null }))).toBe(null);
  });

  it('renders the session name only when the session has one', () => {
    expect(render('session')).toBe('fix-footer');
    expect(render('session', parts({ session: null }))).toBe(null);
  });

  it('spaces the token arrows from their counts and hides a zero count', () => {
    expect(render('input')).toBe('↑ 35k');
    expect(render('output')).toBe('↓ 1.2k');
    expect(render('input', parts(), { format: 'exact' })).toBe('↑ 35213');
    expect(render('input', parts({ input: 0 }))).toBe(null);
    expect(render('output', parts({ output: 0 }))).toBe(null);
  });

  it('renders the cache hit rate with and without the unit word', () => {
    expect(render('cache-hit')).toBe('◎ 99.8%');
    expect(render('cache-hit', parts(), { format: 'hit' })).toBe('◎ 99.8% hit');
    expect(render('cache-hit', parts({ cacheHitRate: null }))).toBe(null);
  });

  it('renders the decode rate per second or with its unit', () => {
    expect(render('tps')).toBe('ϟ 82/s');
    expect(render('tps', parts(), { format: 'long' })).toBe('ϟ 82 tok/s');
    expect(render('tps', parts({ tps: null }))).toBe(null);
  });

  it('renders the context reading the way the native footer does, and in its other formats', () => {
    expect(render('context')).toBe('17.0%/200k');
    expect(render('context', parts(), { format: 'window' })).toBe('34k/200k');
    expect(render('context', parts(), { format: 'tokens' })).toBe('34k');
    expect(render('context', parts(), { format: 'percent' })).toBe('17%');
    // pi withholds the share after a compaction: the native footer prints a question mark.
    expect(render('context', parts({ contextPercent: null, contextTokens: 0 }))).toBe('?/200k');
  });

  it('renders cost as the native `$` amount, only once something has been spent', () => {
    expect(render('cost')).toBe('$0.42');
    expect(render('cost', parts(), { label: 'glyph' })).toBe('¤ $0.42');
    expect(render('cost', parts(), { format: 'exact' })).toBe('$0.4200');
    expect(render('cost', parts({ cost: 0 }))).toBe(null);
    expect(render('cost', parts({ cost: null }))).toBe(null);
  });
});

describe('label styles', () => {
  it('puts a space between a glyph and its value, like the rest of the footer', () => {
    expect(render('input', parts(), { label: 'glyph' })).toBe('↑ 35k');
  });

  it('can spell the label out as a word, with the space that makes it readable', () => {
    expect(render('input', parts(), { label: 'word' })).toBe('input 35k');
    expect(render('cache-hit', parts(), { label: 'word' })).toBe('cache 99.8%');
  });

  it('can drop the label for self-describing values', () => {
    expect(render('model', parts(), { label: 'none' })).toBe('anthropic/claude-sonnet-4');
    expect(render('input', parts(), { label: 'none' })).toBe('35k');
  });

  it('wraps the whole module in a configured prefix and suffix', () => {
    expect(render('input', parts(), { prefix: '[', suffix: ']' })).toBe('[↑ 35k]');
  });

  it('renders every value dim by default, and honours a configured colour', () => {
    expect(renderModule(taggedTheme, entry('input'), parts())).toBe('<dim>↑</> <dim>35k</>');
    expect(renderModule(taggedTheme, entry('input', { color: 'success' }), parts())).toBe('<dim>↑</> <success>35k</>');
    expect(renderModule(taggedTheme, entry('model'), parts())).toBe('<dim>anthropic/claude-sonnet-4</>');
  });

  it('keeps the context pressure colour by default', () => {
    expect(renderModule(taggedTheme, entry('context'), parts())).toBe('<dim>17.0%/200k</>');
    expect(renderModule(taggedTheme, entry('context'), parts({ contextPercent: 80 }))).toBe('<warning>80.0%/200k</>');
    expect(renderModule(taggedTheme, entry('context'), parts({ contextPercent: 95 }))).toBe('<error>95.0%/200k</>');
  });
});

describe('registry invariants', () => {
  it('declares every module id in the goal with a glyph, word, and formats', () => {
    expect(Object.keys(MODULES).sort()).toEqual(
      [
        'branch',
        'cache-hit',
        'context',
        'cost',
        'effort',
        'input',
        'model',
        'output',
        'path',
        'provider',
        'session',
        'tps',
      ].sort(),
    );
    for (const def of Object.values(MODULES)) {
      expect(def.glyph.length).toBe(1);
      expect(def.word.length).toBeGreaterThan(0);
      expect(def.formats).toContain(def.defaultFormat);
    }
  });

  it('keeps context as the only floor module with the highest priority', () => {
    const floors = Object.values(MODULES).filter((def) => def.floor);
    expect(floors.map((def) => def.id)).toEqual(['context']);
    expect(MODULES.context.priority).toBeGreaterThan(
      Math.max(
        ...Object.values(MODULES)
          .filter((def) => !def.floor)
          .map((def) => def.priority),
      ),
    );
  });

  it('defaults every module to the native dim colour', () => {
    for (const def of Object.values(MODULES)) expect(def.defaultColor).toBe('dim');
  });
});
