/**
 * The config schema and its tolerant reader.
 *
 * `parseConfig` is a pure function of the file's text: it validates every entry, records one
 * human-readable problem per rejected or corrected field, and always returns a usable layout. A
 * missing file, a half-edited JSON document, or a stale module id must never take the status line
 * down — the footer is chrome, and chrome that throws is worse than chrome that is wrong.
 */

import type { ThemeColor } from '@earendil-works/pi-coding-agent';

import { isModuleId, type LabelStyle, MODULE_IDS, MODULES, type ModuleId, type ResolvedEntry } from './modules.ts';
import type { Layout } from './render.ts';

/** Every foreground theme token pi exposes. Backgrounds are excluded on purpose. */
export const THEME_COLORS: readonly ThemeColor[] = [
  'accent',
  'border',
  'borderAccent',
  'borderMuted',
  'success',
  'error',
  'warning',
  'muted',
  'dim',
  'text',
  'thinkingText',
  'scrollbarTrack',
  'scrollbarThumb',
  'searchMatchText',
  'userMessageText',
  'customMessageText',
  'customMessageLabel',
  'toolTitle',
  'toolOutput',
  'mdHeading',
  'mdLink',
  'mdLinkUrl',
  'mdCode',
  'mdCodeBlock',
  'mdCodeBlockBorder',
  'mdQuote',
  'mdQuoteBorder',
  'mdHr',
  'mdListBullet',
  'toolDiffAdded',
  'toolDiffRemoved',
  'toolDiffContext',
  'syntaxComment',
  'syntaxKeyword',
  'syntaxFunction',
  'syntaxVariable',
  'syntaxString',
  'syntaxNumber',
  'syntaxType',
  'syntaxOperator',
  'syntaxPunctuation',
  'thinkingOff',
  'thinkingMinimal',
  'thinkingLow',
  'thinkingMedium',
  'thinkingHigh',
  'thinkingXhigh',
  'thinkingMax',
  'bashMode',
];

const LABEL_STYLES: readonly LabelStyle[] = ['none', 'glyph', 'word'];

/** The separator used when the config does not name one: the visible beat between readings. */
const DEFAULT_DIVIDER = ' · ';

/** One module reference in the config file. */
export interface ConfigEntry {
  id: ModuleId;
  label?: LabelStyle;
  format?: string;
  color?: ThemeColor;
  prefix?: string;
  suffix?: string;
}

/**
 * One footer row. A missing side is empty, not inherited.
 *
 * `divider` overrides the top-level separator for both groups; `leftDivider` and `rightDivider`
 * override it per side, which is how the default layout keeps `·` between readings but a plain space
 * between the directory and its branch, and between the provider, model, and thinking level.
 */
export interface ConfigRow {
  left: ConfigEntry[];
  right: ConfigEntry[];
  divider?: string;
  leftDivider?: string;
  rightDivider?: string;
}

export interface Config {
  rows: ConfigRow[];
  divider: string;
}

/**
 * The order a fresh install reads, matching pi's native footer.
 *
 * Row one is the working directory and its context; row two is the session's volumes and the model
 * identity. `provider` and `session` stay hidden until they have something to say, so the default
 * line is exactly as short as the native one.
 */
export function defaultConfig(): Config {
  return {
    divider: DEFAULT_DIVIDER,
    rows: [
      {
        // The directory line reads like a sentence, not a list of readings.
        divider: ' ',
        left: [{ id: 'path' }, { id: 'branch' }, { id: 'session', prefix: '• ' }],
        right: [],
      },
      {
        left: [
          { id: 'input' },
          { id: 'output' },
          { id: 'cache-hit' },
          { id: 'tps' },
          { id: 'cost' },
          { id: 'context' },
        ],
        // Identity is one phrase: `(provider) model • level`.
        rightDivider: ' ',
        right: [{ id: 'provider' }, { id: 'model' }, { id: 'effort', prefix: '• ' }],
      },
    ],
  };
}

export interface ParsedConfig {
  config: Config;
  layout: Layout;
  problems: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** "model, effort, path, …" — every valid id, for a problem that tells you what to pick instead. */
const KNOWN_IDS = MODULE_IDS.join(', ');

function validLabel(value: unknown): value is LabelStyle {
  return typeof value === 'string' && (LABEL_STYLES as readonly string[]).includes(value);
}

function validColor(value: unknown): value is ThemeColor {
  return typeof value === 'string' && (THEME_COLORS as readonly string[]).includes(value);
}

/** Resolves one validated config entry into the layout's module instance. */
export function resolveEntry(entry: ConfigEntry): ResolvedEntry {
  const def = MODULES[entry.id];
  return {
    def,
    label: entry.label ?? def.defaultLabel,
    format: entry.format ?? def.defaultFormat,
    color: entry.color ?? null,
    prefix: entry.prefix ?? '',
    suffix: entry.suffix ?? '',
  };
}

/**
 * Parses the config file.
 *
 * @param text - The file's contents, or null when it does not exist.
 * @returns The effective config, its resolved layout, and every problem found while reading it.
 */
export function parseConfig(text: string | null): ParsedConfig {
  if (text === null) {
    const config = defaultConfig();
    return { config, layout: toLayout(config), problems: [] };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    const config = defaultConfig();
    const detail = error instanceof Error ? error.message : String(error);
    return {
      config,
      layout: toLayout(config),
      problems: [`config.json is not valid JSON (${detail}); using the built-in defaults`],
    };
  }

  if (!isRecord(raw)) {
    const config = defaultConfig();
    return {
      config,
      layout: toLayout(config),
      problems: ['config.json must be a JSON object with a "rows" array; using the built-in defaults'],
    };
  }

  const problems: string[] = [];
  const config: Config = {
    divider: parseDivider(raw.divider, 'divider', problems) ?? DEFAULT_DIVIDER,
    rows: parseRowsSetting(raw, problems),
  };
  return { config, layout: toLayout(config), problems };
}

/** The literal separator between modules; newlines would break the one-line-per-row contract. */
function parseDivider(value: unknown, where: string, problems: string[]): string | null {
  if (value === undefined) return null;
  if (typeof value !== 'string') {
    problems.push(`${where} must be a string; using the default separator`);
    return null;
  }
  if (/[\r\n]/.test(value)) {
    problems.push(`${where} must not contain a newline; using the default separator`);
    return null;
  }
  return value;
}

/**
 * Reads `rows`, or the older top-level `left` / `right` pair as a single row.
 *
 * The legacy pair keeps a just-written config working after the multi-row change: it is read as the
 * metrics row, with the old defaults for whichever side it omitted.
 */
function parseRowsSetting(raw: Record<string, unknown>, problems: string[]): ConfigRow[] {
  if (raw.rows !== undefined) return parseRows(raw.rows, problems);

  if (raw.left === undefined && raw.right === undefined) return defaultConfig().rows;

  const legacy = defaultConfig().rows[1] ?? { left: [], right: [] };
  return [
    {
      left: parseSide(raw.left, 'left', problems, legacy.left),
      right: parseSide(raw.right, 'right', problems, legacy.right),
    },
  ];
}

function parseRows(value: unknown, problems: string[]): ConfigRow[] {
  if (!Array.isArray(value)) {
    problems.push('rows must be an array of { "left": [...], "right": [...] } objects; using the built-in rows');
    return defaultConfig().rows;
  }
  const rows: ConfigRow[] = [];
  value.forEach((item, index) => {
    if (!isRecord(item)) {
      problems.push(`rows[${index}]: expected an object with "left" and/or "right"; skipped`);
      return;
    }
    const row: ConfigRow = {
      left: parseSide(item.left, `rows[${index}].left`, problems, []),
      right: parseSide(item.right, `rows[${index}].right`, problems, []),
    };
    for (const key of ['divider', 'leftDivider', 'rightDivider'] as const) {
      const divider = parseDivider(item[key], `rows[${index}].${key}`, problems);
      if (divider !== null) row[key] = divider;
    }
    rows.push(row);
  });
  return rows;
}

/** Accepts `[{ id: "input" }]`, the shorthand `["input"]`, or a missing/!array value (fallback). */
function parseSide(value: unknown, where: string, problems: string[], fallback: ConfigEntry[]): ConfigEntry[] {
  if (value === undefined) return fallback;
  if (!Array.isArray(value)) {
    problems.push(`${where} must be an array of modules; using its default side`);
    return fallback;
  }
  const entries: ConfigEntry[] = [];
  value.forEach((item, index) => {
    const entry = parseEntry(item, `${where}[${index}]`, problems);
    if (entry !== null) entries.push(entry);
  });
  return entries;
}

function parseEntry(item: unknown, where: string, problems: string[]): ConfigEntry | null {
  // Shorthand: a bare module id.
  const raw = typeof item === 'string' ? { id: item } : item;
  if (!isRecord(raw)) {
    problems.push(`${where}: expected an object like { "id": "input" }; skipped`);
    return null;
  }

  const id = raw.id;
  if (!isModuleId(id)) {
    problems.push(`${where}: unknown module ${JSON.stringify(id ?? null)}; skipped (known: ${KNOWN_IDS})`);
    return null;
  }

  const def = MODULES[id];
  const entry: ConfigEntry = { id };

  if (raw.label !== undefined) {
    if (validLabel(raw.label)) entry.label = raw.label;
    else problems.push(`${where}: label must be one of ${LABEL_STYLES.join(' | ')}; using ${def.defaultLabel}`);
  }

  if (raw.format !== undefined) {
    if (typeof raw.format === 'string' && def.formats.includes(raw.format)) entry.format = raw.format;
    else {
      problems.push(
        `${where}: ${id} has no format ${JSON.stringify(raw.format)}; using ${def.defaultFormat}` +
          (def.formats.length > 0 ? ` (known: ${def.formats.join(' | ')})` : ''),
      );
    }
  }

  if (raw.color !== undefined) {
    if (validColor(raw.color)) entry.color = raw.color;
    else problems.push(`${where}: unknown theme color ${JSON.stringify(raw.color)}; using the module's own colour`);
  }

  for (const key of ['prefix', 'suffix'] as const) {
    const text = raw[key];
    if (text === undefined) continue;
    if (typeof text === 'string') entry[key] = text;
    else problems.push(`${where}: ${key} must be a string; ignored`);
  }

  return entry;
}

/** Config entries → layout instances, preserving row order and resolving each side's separator. */
export function toLayout(config: Config): Layout {
  return {
    rows: config.rows.map((row) => {
      const divider = row.divider ?? config.divider;
      return {
        left: row.left.map(resolveEntry),
        right: row.right.map(resolveEntry),
        divider: row.leftDivider ?? divider,
        rightDivider: row.rightDivider ?? divider,
      };
    }),
  };
}

/**
 * The `/statusline` report: the effective rows, every resolved field with its source, and the
 * problems the reader found. Plain text; the command layer adds the title.
 */
export function reportConfig(parsed: ParsedConfig, source: string): string[] {
  const lines: string[] = [`config: ${source}`, `divider: ${JSON.stringify(parsed.config.divider)}`];

  parsed.config.rows.forEach((row, index) => {
    const divider = row.divider ?? parsed.config.divider;
    const leftDivider = row.leftDivider ?? divider;
    const rightDivider = row.rightDivider ?? divider;
    const dividers =
      leftDivider === rightDivider
        ? JSON.stringify(leftDivider)
        : `${JSON.stringify(leftDivider)} (right: ${JSON.stringify(rightDivider)})`;
    lines.push('', `row[${index}]:`, `  divider: ${dividers}`);
    for (const side of ['left', 'right'] as const) {
      lines.push(`  ${side}:`);
      if (row[side].length === 0) lines.push('    (empty)');
      else {
        for (const entry of row[side]) {
          const def = MODULES[entry.id];
          const fields = [
            `label=${entry.label ?? def.defaultLabel}${entry.label === undefined ? ' (default)' : ''}`,
            `format=${entry.format ?? def.defaultFormat}${entry.format === undefined ? ' (default)' : ''}`,
            `color=${entry.color ?? `${def.colorNote ?? def.defaultColor} (module)`}`,
            `priority=${def.priority}${def.floor ? ' floor' : ''}`,
          ];
          if (entry.prefix !== undefined) fields.push(`prefix=${JSON.stringify(entry.prefix)}`);
          if (entry.suffix !== undefined) fields.push(`suffix=${JSON.stringify(entry.suffix)}`);
          lines.push(`    ${entry.id.padEnd(10)} ${fields.join('  ')}`);
        }
      }
    }
  });

  lines.push('', 'problems:');
  if (parsed.problems.length === 0) lines.push('  none — config is valid');
  else for (const problem of parsed.problems) lines.push(`  - ${problem}`);

  return lines;
}
