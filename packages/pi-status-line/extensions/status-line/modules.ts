/**
 * The module registry: what the status line can show, how each module reads by default, and which
 * modules give up their seat first when the terminal narrows.
 *
 * A module is deliberately inert data plus one pure `value()` function. Layout, labels, colours, and
 * overflow live elsewhere, so adding a module is a registry entry rather than a branch in the row
 * renderer. Nothing here imports the pi runtime — only its types — so the whole registry is
 * exercised in tests with plain objects.
 */

import type { Theme, ThemeColor } from '@earendil-works/pi-coding-agent';

import { formatCost, formatExact, formatTokens, modelShortId, pathTail, percentColor } from './format.ts';

/** Everything the modules can read. Collected once per turn by the wiring layer. */
export interface StatusLineParts {
  /** Model id, or the empty string when no model is selected. */
  model: string;
  /**
   * The model's provider, shown only when the session can route to more than one provider — the
   * same rule the native footer uses before it writes `(provider) model`.
   */
  provider: string | null;
  /** Thinking level (`off`…`max`), or null when the session is not thinking. */
  effort: string | null;
  /** Home-shortened working directory; empty when the path module is disabled. */
  path: string;
  branch: string | null;
  /** Explicit session name, or null when the session has none. */
  session: string | null;
  /** Session prompt tokens that were neither read from nor written to cache. */
  input: number;
  output: number;
  /** Cache hit rate as a share of prompt tokens, 0–100; null before the first turn. */
  cacheHitRate: number | null;
  /** Decode rate already formatted by formatTps, without a unit; null before the first turn. */
  tps: string | null;
  /** Tokens currently occupying the context window. */
  contextTokens: number;
  /** The model's window size, 0 when unknown. */
  contextWindow: number;
  /** The share of the window in use, 0–100, or null when it is not known yet. */
  contextPercent: number | null;
  /** Session spend in USD, or null when pi has not priced anything yet. */
  cost: number | null;
}

/** A module's value for the current frame. */
export interface ModuleValue {
  text: string;
  color: ThemeColor;
}

/** How a module's label reads. `none` is for modules whose value is self-describing (a model id). */
export type LabelStyle = 'none' | 'glyph' | 'word';

export type ModuleId =
  | 'model'
  | 'provider'
  | 'effort'
  | 'path'
  | 'branch'
  | 'session'
  | 'input'
  | 'output'
  | 'cache-hit'
  | 'tps'
  | 'context'
  | 'cost';

export interface ModuleDef {
  id: ModuleId;
  /**
   * Shrink rank: the lowest priority is dropped first when the line does not fit, and the highest
   * is dropped last. Floor modules are never dropped by the shrink pass.
   */
  priority: number;
  /** Kept even at the narrowest width (only `context`). */
  floor: boolean;
  /** One cell wide, drawn by the terminal's own monospace font, no emoji presentation. */
  glyph: string;
  /** The word form of the label. */
  word: string;
  defaultLabel: LabelStyle;
  formats: readonly string[];
  defaultFormat: string;
  /** The colour used when no `color` is configured. Reports show this for static modules. */
  defaultColor: ThemeColor;
  /**
   * Set when the module picks its colour per frame instead of using `defaultColor`. The
   * `/statusline` report prints this instead, so it never claims a static colour for a dynamic one.
   */
  colorNote?: string;
  /** The rendered value, or null when the module has nothing to say this frame. */
  value(parts: StatusLineParts, format: string): ModuleValue | null;
}

/**
 * The module table, ordered by the default left-to-right reading order of a session.
 *
 * Colours follow pi's own footer: every reading is `dim`, except context pressure, which borrows the
 * `warning` / `error` tokens above the same 70 % / 90 % thresholds. Identity modules are dim too, so
 * a configured accent is an opt-in rather than the default.
 */
export const MODULES: Readonly<Record<ModuleId, ModuleDef>> = {
  model: {
    id: 'model',
    priority: 90,
    floor: false,
    glyph: '◈',
    word: 'model',
    // A model id needs no label: it is the one value that identifies itself.
    defaultLabel: 'none',
    formats: ['id', 'short'],
    defaultFormat: 'id',
    defaultColor: 'dim',
    value: (parts, format) => ({
      text: format === 'short' ? modelShortId(parts.model) : parts.model,
      color: 'dim',
    }),
  },
  provider: {
    id: 'provider',
    priority: 85,
    floor: false,
    glyph: '◇',
    word: 'provider',
    defaultLabel: 'none',
    formats: ['paren', 'name'],
    defaultFormat: 'paren',
    defaultColor: 'dim',
    value: (parts, format) => {
      if (parts.provider === null || parts.provider === '') return null;
      return { text: format === 'name' ? parts.provider : `(${parts.provider})`, color: 'dim' };
    },
  },
  effort: {
    id: 'effort',
    priority: 40,
    floor: false,
    glyph: '◐',
    word: 'effort',
    defaultLabel: 'none',
    // `native` spells the disabled level out, the way the native footer writes `• thinking off`.
    formats: ['native', 'word', 'initial'],
    defaultFormat: 'native',
    defaultColor: 'dim',
    value: (parts, format) => {
      if (parts.effort === null || parts.effort === '') return null;
      if (format === 'native' && parts.effort === 'off') return { text: 'thinking off', color: 'dim' };
      const text = format === 'initial' ? parts.effort.slice(0, 1).toUpperCase() : parts.effort;
      return { text, color: 'dim' };
    },
  },
  path: {
    id: 'path',
    // Above the branch and session tail: a narrow terminal keeps the directory and drops what
    // follows it, the way the native footer truncates the directory line from the right.
    priority: 20,
    floor: false,
    glyph: '⌂',
    word: 'path',
    defaultLabel: 'none',
    formats: ['full', 'tail'],
    defaultFormat: 'full',
    defaultColor: 'dim',
    value: (parts, format) => {
      if (parts.path === '') return null;
      return { text: format === 'tail' ? pathTail(parts.path) : parts.path, color: 'dim' };
    },
  },
  branch: {
    id: 'branch',
    priority: 15,
    floor: false,
    glyph: '⎇',
    word: 'branch',
    defaultLabel: 'none',
    // Parenthesised is how the native footer writes the branch next to the cwd.
    formats: ['paren', 'name'],
    defaultFormat: 'paren',
    defaultColor: 'dim',
    value: (parts, format) => {
      if (parts.branch === null || parts.branch === '') return null;
      return { text: format === 'name' ? parts.branch : `(${parts.branch})`, color: 'dim' };
    },
  },
  session: {
    id: 'session',
    priority: 10,
    floor: false,
    glyph: '❯',
    word: 'session',
    defaultLabel: 'none',
    formats: ['name'],
    defaultFormat: 'name',
    defaultColor: 'dim',
    value: (parts) => (parts.session === null || parts.session === '' ? null : { text: parts.session, color: 'dim' }),
  },
  input: {
    id: 'input',
    priority: 80,
    floor: false,
    glyph: '↑',
    word: 'input',
    defaultLabel: 'glyph',
    formats: ['tokens', 'exact'],
    defaultFormat: 'tokens',
    defaultColor: 'dim',
    value: (parts, format) =>
      parts.input > 0
        ? { text: format === 'exact' ? formatExact(parts.input) : formatTokens(parts.input), color: 'dim' }
        : null,
  },
  output: {
    id: 'output',
    priority: 60,
    floor: false,
    glyph: '↓',
    word: 'output',
    defaultLabel: 'glyph',
    formats: ['tokens', 'exact'],
    defaultFormat: 'tokens',
    defaultColor: 'dim',
    value: (parts, format) =>
      parts.output > 0
        ? { text: format === 'exact' ? formatExact(parts.output) : formatTokens(parts.output), color: 'dim' }
        : null,
  },
  'cache-hit': {
    id: 'cache-hit',
    priority: 50,
    floor: false,
    // A bullseye: the reading itself is a hit rate.
    glyph: '◎',
    word: 'cache',
    defaultLabel: 'glyph',
    formats: ['percent', 'hit'],
    defaultFormat: 'percent',
    defaultColor: 'dim',
    value: (parts, format) => {
      if (parts.cacheHitRate === null) return null;
      const rate = `${parts.cacheHitRate.toFixed(1)}%`;
      return { text: format === 'hit' ? `${rate} hit` : rate, color: 'dim' };
    },
  },
  tps: {
    id: 'tps',
    priority: 30,
    floor: false,
    // The Greek lightning mark: speed as a single monospace cell, with no emoji presentation.
    glyph: 'ϟ',
    word: 'speed',
    defaultLabel: 'glyph',
    formats: ['rate', 'long'],
    defaultFormat: 'rate',
    defaultColor: 'dim',
    value: (parts, format) =>
      parts.tps === null ? null : { text: format === 'long' ? `${parts.tps} tok/s` : `${parts.tps}/s`, color: 'dim' },
  },
  context: {
    id: 'context',
    priority: 1000,
    floor: true,
    // Context is the one reading with no unit in its number, so it carries a glyph like the rest.
    glyph: '▤',
    word: 'ctx',
    // The native footer writes the context reading without a label: `17.0%/200k`.
    defaultLabel: 'none',
    formats: ['native', 'window', 'tokens', 'percent'],
    defaultFormat: 'native',
    defaultColor: 'dim',
    colorNote: 'pressure colour (70% / 90%)',
    value: (parts, format) => {
      const used = formatTokens(parts.contextTokens);
      const window = formatTokens(parts.contextWindow);
      if (format === 'percent') {
        return {
          text: parts.contextPercent === null ? '--' : `${Math.round(parts.contextPercent)}%`,
          color: percentColor(parts.contextPercent),
        };
      }
      if (format === 'tokens') return { text: used, color: percentColor(parts.contextPercent) };
      if (format === 'window') {
        return {
          text: parts.contextWindow > 0 ? `${used}/${window}` : used,
          color: percentColor(parts.contextPercent),
        };
      }
      // Native: one decimal of pressure over the abbreviated window, `?` when pi has no reading.
      const share = parts.contextPercent === null ? '?' : `${parts.contextPercent.toFixed(1)}%`;
      return { text: `${share}/${window}`, color: percentColor(parts.contextPercent) };
    },
  },
  cost: {
    id: 'cost',
    priority: 70,
    floor: false,
    // A currency mark for the rare case someone wants a label; the value is already self-describing.
    glyph: '¤',
    word: 'cost',
    defaultLabel: 'none',
    formats: ['usd', 'exact'],
    defaultFormat: 'usd',
    defaultColor: 'dim',
    value: (parts, format) => {
      if (parts.cost === null || parts.cost <= 0) return null;
      return { text: format === 'exact' ? `$${parts.cost.toFixed(4)}` : formatCost(parts.cost), color: 'dim' };
    },
  },
};

/** Every module id, in registry order. Used by validation and by the `/statusline` report. */
export const MODULE_IDS: readonly ModuleId[] = Object.keys(MODULES) as ModuleId[];

export function isModuleId(value: unknown): value is ModuleId {
  return typeof value === 'string' && Object.hasOwn(MODULES, value);
}

export function moduleDef(id: ModuleId): ModuleDef {
  return MODULES[id];
}

/**
 * One module instance as configured: the definition plus the per-entry overrides that survived
 * validation. `null` colour means "use whatever the module chose for this frame", which is how the
 * context reading keeps its pressure colour unless the user insists otherwise.
 */
export interface ResolvedEntry {
  def: ModuleDef;
  label: LabelStyle;
  format: string;
  color: ThemeColor | null;
  prefix: string;
  suffix: string;
}

/**
 * `label value`, with the key quiet and the value bright.
 *
 * Both label styles keep a space before the value, so `↑ 132` and `input 132` read at the same
 * rhythm; a self-describing value has no label at all.
 */
function labelled(theme: Theme, entry: ResolvedEntry, value: ModuleValue): string {
  const text = theme.fg(entry.color ?? value.color, value.text);
  const label =
    entry.label === 'none'
      ? ''
      : entry.label === 'glyph'
        ? `${theme.fg('dim', entry.def.glyph)} `
        : `${theme.fg('dim', entry.def.word)} `;
  const prefix = entry.prefix === '' ? '' : theme.fg('dim', entry.prefix);
  const suffix = entry.suffix === '' ? '' : theme.fg('dim', entry.suffix);
  return `${prefix}${label}${text}${suffix}`;
}

/**
 * Renders one module, or returns null when it has nothing to show this frame.
 *
 * A module that is empty (no branch, no output yet, no rate yet) contributes no divider either, so
 * the row never shows a dangling `·`.
 */
export function renderModule(theme: Theme, entry: ResolvedEntry, parts: StatusLineParts): string | null {
  const value = entry.def.value(parts, entry.format);
  return value === null ? null : labelled(theme, entry, value);
}
